import type { Metadata } from 'next'
import Link from 'next/link'
import './globals.css'

export const metadata: Metadata = { title: 'PitchIn Admin' }

const NAV = [
  { href: '/leagues', label: 'リーグ' },
  { href: '/players', label: '選手' },
  { href: '/teams', label: 'チーム' },
  { href: '/matches', label: '試合' },
  { href: '/batches', label: 'バッチ実行' },
]

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body className="bg-gray-950 text-gray-100 min-h-screen">
        <nav className="bg-gray-900 border-b border-gray-800 px-6 py-3 flex items-center gap-8">
          <span className="font-bold text-green-400 text-lg">PitchIn Admin</span>
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} className="text-sm text-gray-300 hover:text-white transition-colors">
              {n.label}
            </Link>
          ))}
        </nav>
        <main className="max-w-5xl mx-auto px-6 py-8">{children}</main>
      </body>
    </html>
  )
}
