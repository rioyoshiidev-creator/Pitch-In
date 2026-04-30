'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

interface League { id: number; name: string; current_season: number; sort_order: number }

export default function LeaguesPage() {
  const [leagues, setLeagues] = useState<League[]>([])
  const [form, setForm] = useState({ id: '', name: '' })
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState('')

  async function load() {
    const { data } = await supabase
      .from('leagues')
      .select('*')
      .order('sort_order', { ascending: true })
      .order('id', { ascending: true })
    setLeagues(data ?? [])
  }

  useEffect(() => { load() }, [])

  async function add() {
    if (!form.id || !form.name) return
    setLoading(true)
    const maxOrder = leagues.length > 0 ? Math.max(...leagues.map(l => l.sort_order)) : -1
    const { error } = await supabase.from('leagues').insert({
      id: Number(form.id),
      name: form.name,
      current_season: 0,
      sort_order: maxOrder + 1,
    })
    setMsg(error ? `エラー: ${error.message}` : '追加しました（シーズンはチーム取得バッチ実行時に自動設定されます）')
    setForm({ id: '', name: '' })
    await load()
    setLoading(false)
  }

  async function remove(id: number, name: string) {
    if (!confirm(`「${name}」を削除しますか？\n関連するチーム・試合・選手のチーム紐付けもすべて削除されます。`)) return
    setLoading(true)
    setMsg('')

    // 1. このリーグのチームIDを取得
    const { data: teams } = await supabase.from('teams').select('id').eq('league_id', id)
    const teamIds = (teams ?? []).map((t: any) => t.id)

    if (teamIds.length > 0) {
      // 2. 選手の api_team_id を null に
      await supabase.from('players').update({ api_team_id: null }).in('api_team_id', teamIds)
      // 3. 試合を削除（match_players・alarms はカスケード削除）
      await supabase.from('matches').delete().in('home_team_id', teamIds)
      await supabase.from('matches').delete().in('away_team_id', teamIds)
      // 4. チームを削除
      await supabase.from('teams').delete().eq('league_id', id)
    }

    // 5. リーグを削除
    const { error } = await supabase.from('leagues').delete().eq('id', id)
    if (error) {
      setMsg(`削除失敗: ${error.message}`)
    } else {
      setMsg('削除しました')
      await load()
    }
    setLoading(false)
  }

  async function moveUp(index: number) {
    if (index === 0) return
    const a = leagues[index], b = leagues[index - 1]
    await Promise.all([
      supabase.from('leagues').update({ sort_order: b.sort_order }).eq('id', a.id),
      supabase.from('leagues').update({ sort_order: a.sort_order }).eq('id', b.id),
    ])
    await load()
  }

  async function moveDown(index: number) {
    if (index === leagues.length - 1) return
    const a = leagues[index], b = leagues[index + 1]
    await Promise.all([
      supabase.from('leagues').update({ sort_order: b.sort_order }).eq('id', a.id),
      supabase.from('leagues').update({ sort_order: a.sort_order }).eq('id', b.id),
    ])
    await load()
  }

  return (
    <div>
      <h1 className="text-xl font-bold mb-6">リーグ管理</h1>

      {/* 追加フォーム */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 mb-8">
        <h2 className="font-bold mb-4 text-sm text-gray-400 uppercase tracking-wide">リーグを追加</h2>
        <div className="flex gap-3 items-end">
          <div>
            <label className="text-xs text-gray-400 block mb-1">League ID (API-Football)</label>
            <input value={form.id} onChange={e => setForm(f => ({ ...f, id: e.target.value }))}
              className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm w-32" placeholder="39" />
          </div>
          <div>
            <label className="text-xs text-gray-400 block mb-1">リーグ名</label>
            <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm w-48" placeholder="Premier League" />
          </div>
          <button onClick={add} disabled={loading || !form.id || !form.name}
            className="bg-green-600 hover:bg-green-500 text-white rounded-lg px-4 py-2 text-sm font-bold disabled:opacity-50">
            追加
          </button>
        </div>
        <p className="text-xs text-gray-500 mt-3">シーズンはチーム取得バッチ実行時に自動設定されます</p>
        {msg && <p className={`text-sm mt-2 ${msg.startsWith('削除失敗') ? 'text-red-400' : 'text-green-400'}`}>{msg}</p>}
      </div>

      {/* 一覧 */}
      <table className="w-full text-sm">
        <thead>
          <tr className="text-gray-400 text-left border-b border-gray-800">
            <th className="pb-3 pr-2 w-16">順番</th>
            <th className="pb-3 pr-6">リーグ名</th>
            <th className="pb-3 pr-6">ID</th>
            <th className="pb-3"></th>
          </tr>
        </thead>
        <tbody>
          {leagues.map((l, i) => (
            <tr key={l.id} className="border-b border-gray-900 hover:bg-gray-900">
              <td className="py-2 pr-2">
                <div className="flex gap-1">
                  <button onClick={() => moveUp(i)} disabled={i === 0}
                    className="text-gray-500 hover:text-gray-200 disabled:opacity-20 text-base leading-none px-1">↑</button>
                  <button onClick={() => moveDown(i)} disabled={i === leagues.length - 1}
                    className="text-gray-500 hover:text-gray-200 disabled:opacity-20 text-base leading-none px-1">↓</button>
                </div>
              </td>
              <td className="py-3 pr-6 font-medium">{l.name}</td>
              <td className="py-3 pr-6 text-gray-400 font-mono">{l.id}</td>
              <td className="py-3">
                <button onClick={() => remove(l.id, l.name)} className="text-red-400 hover:text-red-300 text-xs">削除</button>
              </td>
            </tr>
          ))}
          {leagues.length === 0 && (
            <tr><td colSpan={5} className="py-8 text-center text-gray-500">リーグが登録されていません</td></tr>
          )}
        </tbody>
      </table>
    </div>
  )
}
