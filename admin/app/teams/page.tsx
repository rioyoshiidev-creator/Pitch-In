'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

interface Team {
  id: number; name: string; has_japanese: boolean
  leagues?: { name: string } | null
}

export default function TeamsPage() {
  const [teams, setTeams] = useState<Team[]>([])
  const [filter, setFilter] = useState<'all' | 'japanese'>('japanese')

  useEffect(() => {
    supabase.from('teams').select('*, leagues(name)').order('name')
      .then(({ data }) => setTeams(data ?? []))
  }, [])

  const filtered = filter === 'japanese' ? teams.filter(t => t.has_japanese) : teams

  return (
    <div>
      <h1 className="text-xl font-bold mb-2">チーム一覧</h1>
      <p className="text-gray-400 text-sm mb-6">バッチ実行（チーム取得・スカッド取得）で自動更新されます</p>

      <div className="flex gap-2 mb-6">
        <button onClick={() => setFilter('japanese')}
          className={`px-4 py-2 rounded-lg text-sm font-bold ${filter === 'japanese' ? 'bg-green-600 text-white' : 'bg-gray-800 text-gray-300'}`}>
          日本人選手あり ({teams.filter(t => t.has_japanese).length})
        </button>
        <button onClick={() => setFilter('all')}
          className={`px-4 py-2 rounded-lg text-sm font-bold ${filter === 'all' ? 'bg-green-600 text-white' : 'bg-gray-800 text-gray-300'}`}>
          全チーム ({teams.length})
        </button>
      </div>

      <table className="w-full text-sm">
        <thead>
          <tr className="text-gray-400 text-left border-b border-gray-800">
            <th className="pb-3 pr-6">ID</th>
            <th className="pb-3 pr-6">チーム名</th>
            <th className="pb-3 pr-6">リーグ</th>
            <th className="pb-3">日本人選手</th>
          </tr>
        </thead>
        <tbody>
          {filtered.map(t => (
            <tr key={t.id} className="border-b border-gray-900 hover:bg-gray-900">
              <td className="py-3 pr-6 font-mono text-gray-400">{t.id}</td>
              <td className="py-3 pr-6 font-medium">{t.name}</td>
              <td className="py-3 pr-6 text-gray-400">{t.leagues?.name ?? '−'}</td>
              <td className="py-3">
                {t.has_japanese
                  ? <span className="bg-green-900 text-green-400 text-xs px-2 py-1 rounded-full">あり</span>
                  : <span className="text-gray-600 text-xs">なし</span>}
              </td>
            </tr>
          ))}
          {filtered.length === 0 && (
            <tr><td colSpan={4} className="py-8 text-center text-gray-500">チームがありません。バッチを実行してください</td></tr>
          )}
        </tbody>
      </table>
    </div>
  )
}
