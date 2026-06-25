import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Robot Trends — 로봇 산업·기술 뉴스',
  description: '매일 자동 수집되는 로봇 산업 및 기술 최신 뉴스',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="ko">
      <body className="bg-gray-950 antialiased">{children}</body>
    </html>
  )
}
