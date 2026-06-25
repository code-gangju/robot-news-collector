"""
robot_news_collector.py
────────────────────────────────────────────────────────────────────
로봇 산업·기술 뉴스를 Google News RSS로 수집해 Supabase에 저장합니다.
ANTHROPIC_API_KEY가 있으면 Claude Haiku로 한 줄 요약도 자동 생성합니다.

실행: python collector.py
"""

import os
import re
import time
import feedparser
import requests
from urllib.parse import quote
from html.parser import HTMLParser
from supabase import create_client, Client
from dotenv import load_dotenv

load_dotenv()                           # .env
load_dotenv(".env.local", override=True)  # .env.local (Next.js 관행)

# ── 설정 ─────────────────────────────────────────────────────────
SUPABASE_URL  = os.environ["SUPABASE_URL"]
SUPABASE_KEY  = os.environ["SUPABASE_SERVICE_ROLE_KEY"]  # 서버용 Service Role 키
GEMINI_KEY    = os.getenv("GEMINI_API_KEY")               # 없으면 요약 단계 건너뜀

KEYWORDS        = ["로봇 산업", "로봇 기술"]
MAX_PER_KEYWORD = 10   # 키워드당 최대 수집 건수
USE_SUMMARY     = bool(GEMINI_KEY)


# ── 유틸 ─────────────────────────────────────────────────────────
class _HTMLStripper(HTMLParser):
    """HTML 태그를 제거하는 최소 파서."""
    def __init__(self):
        super().__init__()
        self._parts: list[str] = []

    def handle_data(self, data: str) -> None:
        self._parts.append(data)

    def get_text(self) -> str:
        return " ".join(self._parts).strip()


def strip_html(html: str) -> str:
    s = _HTMLStripper()
    s.feed(html)
    return s.get_text()


# ── Google News RSS 수집 ─────────────────────────────────────────
def fetch_google_news(keyword: str, max_results: int = 10) -> list[dict]:
    """
    Google News RSS에서 키워드로 최신 뉴스를 수집합니다.
    별도 API 키 불필요. 무료로 사용 가능합니다.
    """
    encoded_kw = quote(keyword)
    rss_url = (
        f"https://news.google.com/rss/search"
        f"?q={encoded_kw}&hl=ko&gl=KR&ceid=KR:ko"
    )

    feed = feedparser.parse(rss_url)

    articles: list[dict] = []
    for entry in feed.entries[:max_results]:
        articles.append({
            "title":   entry.title,
            "url":     entry.link,
            "media":   entry.get("source", {}).get("title", "Google News"),
            "summary": None,  # Gemini가 생성. RSS desc는 제목 반복이라 저장 안 함
        })

    return articles


# ── Naver News API 수집 (선택) ───────────────────────────────────
def fetch_naver_news(keyword: str, max_results: int = 10) -> list[dict]:
    """
    네이버 뉴스 검색 API를 사용합니다.
    사전 준비: https://developers.naver.com 에서 앱 등록 후
    .env에 NAVER_CLIENT_ID, NAVER_CLIENT_SECRET 추가 필요.
    """
    client_id     = os.environ.get("NAVER_CLIENT_ID")
    client_secret = os.environ.get("NAVER_CLIENT_SECRET")
    if not (client_id and client_secret):
        raise EnvironmentError(
            "NAVER_CLIENT_ID, NAVER_CLIENT_SECRET 환경변수를 설정해주세요."
        )

    resp = requests.get(
        "https://openapi.naver.com/v1/search/news.json",
        headers={
            "X-Naver-Client-Id":     client_id,
            "X-Naver-Client-Secret": client_secret,
        },
        params={"query": keyword, "display": max_results, "sort": "date"},
        timeout=10,
    )
    resp.raise_for_status()

    def clean(text: str) -> str:
        return re.sub(r"<[^>]+>", "", text).replace("&quot;", '"').strip()

    articles: list[dict] = []
    for item in resp.json().get("items", []):
        articles.append({
            "title":   clean(item["title"]),
            "url":     item.get("link") or item.get("originallink", ""),
            "media":   item.get("originallink", "").split("/")[2],  # 도메인 추출
            "summary": clean(item.get("description", "")) or None,
        })

    return articles


# ── Gemini 한 줄 요약 ────────────────────────────────────────────
def summarize_with_gemini(title: str, rss_summary: str) -> str:
    """
    Gemini 2.0 Flash Lite로 기사 제목과 RSS 요약을 한 문장으로 압축합니다.
    무료 티어: 하루 1,500 요청 / 분당 30 요청 제공.
    """
    from google import genai  # 함수 내 임포트 — GEMINI_KEY 없을 때 오류 방지

    client = genai.Client(api_key=GEMINI_KEY)

    source_text = f"제목: {title}"
    if rss_summary:
        source_text += f"\n내용: {rss_summary}"

    prompt = (
        f"뉴스 제목: {title}\n\n"
        "이 제목만 보고 독자가 기사를 클릭하기 전에 핵심 내용을 파악할 수 있도록 "
        "한국어 한 문장(40~70자)으로 설명해줘. "
        "규칙: ① 제목 문구를 그대로 반복하지 말 것 "
        "② 이 뉴스가 왜 중요한지 또는 어떤 의미인지 포함할 것 "
        "③ 추측이나 과장 없이 제목에서 유추 가능한 사실만 쓸 것"
    )

    response = client.models.generate_content(
        model="gemini-2.0-flash",
        contents=prompt,
    )
    return response.text.strip()


# ── Supabase 저장 ────────────────────────────────────────────────
def save_to_supabase(db: Client, articles: list[dict]) -> int:
    """
    url 컬럼을 기준으로 upsert합니다.
    이미 존재하는 URL은 무시되므로 중복 저장이 발생하지 않습니다.
    """
    if not articles:
        return 0

    result = (
        db.table("news")
        .upsert(articles, on_conflict="url", ignore_duplicates=False)
        .execute()
    )
    return len(result.data)


# ── 메인 ─────────────────────────────────────────────────────────
def main() -> None:
    db = create_client(SUPABASE_URL, SUPABASE_KEY)

    # 1단계: 키워드별 수집 + URL 기준 중복 제거
    seen_urls: set[str] = set()
    all_articles: list[dict] = []

    for keyword in KEYWORDS:
        print(f"\n🔍 '{keyword}' 수집 중...")
        try:
            fetched = fetch_google_news(keyword, max_results=MAX_PER_KEYWORD)
            # 네이버 뉴스로 바꾸려면 위 줄을 아래로 교체:
            # fetched = fetch_naver_news(keyword, max_results=MAX_PER_KEYWORD)
        except Exception as e:
            print(f"  ⚠️  수집 실패: {e}")
            continue

        new_count = 0
        for article in fetched:
            if article["url"] not in seen_urls:
                seen_urls.add(article["url"])
                all_articles.append(article)
                new_count += 1

        print(f"  → {new_count}건 추가 (전체 누적 {len(all_articles)}건)")

    if not all_articles:
        print("\n❌ 수집된 기사가 없습니다. 네트워크 상태나 키워드를 확인하세요.")
        return

    # 2단계: Claude 요약 (ANTHROPIC_API_KEY가 있을 때만 실행)
    if USE_SUMMARY:
        print(f"\n✍️  Claude 요약 생성 중 (총 {len(all_articles)}건)...")
        for i, article in enumerate(all_articles, 1):
            try:
                article["summary"] = summarize_with_gemini(
                    article["title"],
                    article.get("summary") or "",
                )
                print(f"  [{i:02d}/{len(all_articles)}] {article['title'][:45]}...")
                time.sleep(4)  # 무료 티어: 분당 15회 제한 → 4초 간격
            except Exception as e:
                print(f"  ⚠️  요약 실패 — {article['title'][:35]}...: {e}")
    else:
        print("\nℹ️  GEMINI_API_KEY 없음 → 요약 생성을 건너뜁니다.")

    # 3단계: Supabase 저장
    print(f"\n💾 Supabase 저장 중...")
    saved_count = save_to_supabase(db, all_articles)
    print(f"\n✅ 완료 — {saved_count}건 신규 저장 (중복 {len(all_articles) - saved_count}건 제외)")


if __name__ == "__main__":
    main()
