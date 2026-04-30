import Link from 'next/link'

const CARDS = [
  { href: '/leagues', label: 'リーグ管理', desc: 'リーグの追加・削除' },
  { href: '/players', label: '選手管理', desc: '選手の追加・削除' },
  { href: '/teams', label: 'チーム一覧', desc: 'チームと日本人選手の紐付き確認' },
  { href: '/batches', label: 'バッチ実行', desc: 'チーム取得・スカッド取得を手動実行' },
]

export default function Home() {
  return (
    <div>
      <h1 className="text-2xl font-bold mb-2">PitchIn 管理者画面</h1>
      <p className="text-gray-400 mb-8 text-sm">ローカル環境から本番DBを管理します</p>
      <div className="grid grid-cols-2 gap-4">
        {CARDS.map((c) => (
          <Link key={c.href} href={c.href}
            className="bg-gray-900 border border-gray-800 rounded-xl p-6 hover:border-green-500 transition-colors">
            <div className="font-bold text-lg mb-1">{c.label}</div>
            <div className="text-gray-400 text-sm">{c.desc}</div>
          </Link>
        ))}
      </div>
    </div>
  )
}
