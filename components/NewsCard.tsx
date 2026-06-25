import { Article } from '@/types'

function timeAgo(dateString: string): string {
  const diff = Date.now() - new Date(dateString).getTime()
  const hours = Math.floor(diff / 3_600_000)
  const minutes = Math.floor(diff / 60_000)
  if (hours >= 24) return `${Math.floor(hours / 24)}일 전`
  if (hours >= 1) return `${hours}시간 전`
  if (minutes >= 1) return `${minutes}분 전`
  return '방금 전'
}

export default function NewsCard({ article }: { article: Article }) {
  return (
    <a
      href={article.url}
      target="_blank"
      rel="noopener noreferrer"
      className="group flex flex-col overflow-hidden rounded-xl border border-gray-800 bg-gray-900 transition-all duration-200 hover:border-blue-500/50 hover:shadow-xl hover:shadow-blue-950/20"
    >
      {/* hover accent bar */}
      <div className="h-0.5 w-full bg-gradient-to-r from-blue-500 to-cyan-400 opacity-0 transition-opacity duration-200 group-hover:opacity-100" />

      <div className="flex flex-1 flex-col p-5">
        {/* Meta row */}
        <div className="mb-3 flex items-center justify-between gap-2">
          <span className="truncate rounded-full bg-blue-950/60 px-2.5 py-0.5 text-xs font-medium text-blue-400">
            {article.media ?? '알 수 없는 언론사'}
          </span>
          <span className="shrink-0 text-xs text-gray-600">
            {timeAgo(article.created_at)}
          </span>
        </div>

        {/* Title */}
        <h3 className="mb-3 line-clamp-2 text-sm font-semibold leading-snug text-gray-100 transition-colors group-hover:text-white">
          {article.title}
        </h3>

        {/* AI summary */}
        {article.summary && (
          <p className="mb-4 line-clamp-3 flex-1 text-xs leading-relaxed text-gray-500">
            {article.summary}
          </p>
        )}

        {/* Footer */}
        <div className="mt-auto flex items-center justify-end border-t border-gray-800/60 pt-3">
          <span className="flex items-center gap-1 text-xs text-gray-600 transition-colors group-hover:text-blue-400">
            원문 보기
            <svg
              className="h-3 w-3"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
              />
            </svg>
          </span>
        </div>
      </div>
    </a>
  )
}
