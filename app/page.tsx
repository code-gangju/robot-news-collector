import { GoogleGenerativeAI } from '@google/generative-ai'
import { createServerClient } from '@/lib/supabase/server'
import NewsCard from '@/components/NewsCard'
import { Article } from '@/types'

async function getArticles(): Promise<Article[]> {
  const supabase = createServerClient()

  // 오늘 날짜 자정 기준으로 오늘 수집된 뉴스 먼저 시도
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const { data: todayData } = await supabase
    .from('news')
    .select('*')
    .gte('created_at', today.toISOString())
    .order('created_at', { ascending: false })
    .limit(20)

  if (todayData && todayData.length > 0) return todayData

  // 오늘 뉴스가 없으면 최신 20개 반환
  const { data: latestData } = await supabase
    .from('news')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(20)

  return latestData ?? []
}

async function getTrendSummary(articles: Article[]): Promise<string> {
  if (!process.env.GEMINI_API_KEY || articles.length === 0) return ''

  try {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY)
    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' })

    const headlines = articles
      .slice(0, 8)
      .map((a, i) => `${i + 1}. ${a.title}`)
      .join('\n')

    const result = await model.generateContent(
      `오늘의 로봇 산업·기술 뉴스 헤드라인:\n${headlines}\n\n위 뉴스들을 종합해서 오늘 로봇 업계의 핵심 흐름을 3문장 이내의 한국어로 요약해줘.`,
    )

    return result.response.text().trim()
  } catch {
    return ''
  }
}

export default async function HomePage() {
  const articles = await getArticles()
  const trendSummary = await getTrendSummary(articles)

  const dateStr = new Date().toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'short',
  })

  return (
    <main className="min-h-screen bg-gray-950 text-gray-100">
      {/* ── Header ─────────────────────────────────────────── */}
      <header className="sticky top-0 z-10 border-b border-gray-800/80 bg-gray-950/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6">
          <div className="flex items-center gap-3">
            <span className="text-3xl">🤖</span>
            <div>
              <h1 className="text-lg font-bold tracking-tight text-white">
                Robot Trends
              </h1>
              <p className="text-xs text-gray-500">로봇 산업·기술 뉴스 자동 수집</p>
            </div>
          </div>
          <p className="hidden text-sm text-gray-500 sm:block">{dateStr}</p>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        {/* ── 트렌드 요약 배너 ─────────────────────────────── */}
        <section className="mb-10">
          <div className="relative overflow-hidden rounded-2xl border border-blue-900/40 bg-gradient-to-br from-blue-950/50 to-gray-900 p-6 sm:p-8">
            {/* 배경 글로우 */}
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_rgba(59,130,246,0.10),transparent_60%)]" />

            <div className="relative">
              <div className="mb-3 flex items-center gap-2">
                <span className="h-2 w-2 animate-pulse rounded-full bg-blue-400" />
                <span className="text-xs font-semibold uppercase tracking-widest text-blue-400">
                  AI 트렌드 분석
                </span>
              </div>

              <h2 className="mb-4 text-xl font-bold text-white sm:text-2xl">
                오늘의 로봇 트렌드 요약
              </h2>

              {trendSummary ? (
                <p className="text-sm leading-relaxed text-gray-300 sm:text-base">
                  {trendSummary}
                </p>
              ) : articles.length === 0 ? (
                <p className="text-sm text-gray-500">
                  아직 수집된 뉴스가 없습니다.{' '}
                  <code className="rounded bg-gray-800 px-1.5 py-0.5 text-xs text-gray-300">
                    python collector.py
                  </code>
                  를 실행해 주세요.
                </p>
              ) : (
                <ul className="space-y-2">
                  {articles.slice(0, 3).map((a) => (
                    <li key={a.id} className="flex gap-2 text-sm text-gray-300">
                      <span className="mt-0.5 shrink-0 text-blue-400">›</span>
                      <span>{a.summary ?? a.title}</span>
                    </li>
                  ))}
                </ul>
              )}

              <div className="mt-5 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-white/10 pt-4 text-xs text-gray-600">
                <span>총 {articles.length}개 기사</span>
                <span>·</span>
                <span>키워드: 로봇 산업, 로봇 기술</span>
              </div>
            </div>
          </div>
        </section>

        {/* ── 뉴스 그리드 ─────────────────────────────────── */}
        <section>
          <div className="mb-5 flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
              최신 뉴스
            </h2>
            <span className="text-xs text-gray-700">{articles.length}건</span>
          </div>

          {articles.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-28 text-gray-700">
              <span className="mb-4 text-5xl opacity-30">🤖</span>
              <p className="text-sm">수집된 뉴스가 없습니다.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {articles.map((article) => (
                <NewsCard key={article.id} article={article} />
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  )
}
