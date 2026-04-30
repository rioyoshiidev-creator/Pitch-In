'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

interface Player {
  id: string; name: string; api_player_id: number
  api_team_id: number | null; position: string | null; number: number | null
  sort_order: number
  teams?: { name: string } | null
}

export default function PlayersPage() {
  const [players, setPlayers] = useState<Player[]>([])
  const [form, setForm] = useState({ name: '', api_player_id: '' })
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState('')
  const [search, setSearch] = useState('')

  async function load() {
    const { data } = await supabase
      .from('players')
      .select('*, teams(name)')
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true })
    setPlayers(data ?? [])
  }

  useEffect(() => { load() }, [])

  async function add() {
    if (!form.name || !form.api_player_id) return
    setLoading(true)
    setMsg('')
    const id = `player-${form.api_player_id}`
    const maxOrder = players.length > 0 ? Math.max(...players.map(p => p.sort_order)) : -1
    const { error } = await supabase.from('players').insert({
      id,
      name: form.name,
      api_player_id: Number(form.api_player_id),
      sort_order: maxOrder + 1,
    })
    setMsg(error ? `エラー: ${error.message}` : `${form.name} を追加しました（チームはバッチ実行で自動設定されます）`)
    setForm({ name: '', api_player_id: '' })
    await load()
    setLoading(false)
  }

  async function remove(id: string, name: string) {
    if (!confirm(`${name} を削除しますか？`)) return
    await supabase.from('players').delete().eq('id', id)
    await load()
  }

  async function moveUp(index: number) {
    if (index === 0) return
    const a = players[index]
    const b = players[index - 1]
    await Promise.all([
      supabase.from('players').update({ sort_order: b.sort_order }).eq('id', a.id),
      supabase.from('players').update({ sort_order: a.sort_order }).eq('id', b.id),
    ])
    await load()
  }

  async function moveDown(index: number) {
    if (index === players.length - 1) return
    const a = players[index]
    const b = players[index + 1]
    await Promise.all([
      supabase.from('players').update({ sort_order: b.sort_order }).eq('id', a.id),
      supabase.from('players').update({ sort_order: a.sort_order }).eq('id', b.id),
    ])
    await load()
  }

  const filtered = search
    ? players.filter(p =>
        p.name.includes(search) ||
        (p.teams?.name ?? '').toLowerCase().includes(search.toLowerCase())
      )
    : players

  return (
    <div>
      <h1 className="text-xl font-bold mb-6">選手管理</h1>

      {/* 追加フォーム */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 mb-8">
        <h2 className="font-bold mb-1 text-sm text-gray-400 uppercase tracking-wide">選手を追加</h2>
        <p className="text-xs text-gray-500 mb-4">所属チームはバッチ実行（スカッド取得）で自動設定されます</p>
        <div className="flex gap-3 items-end">
          <div>
            <label className="text-xs text-gray-400 block mb-1">選手名</label>
            <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm w-40" placeholder="三笘薫" />
          </div>
          <div>
            <label className="text-xs text-gray-400 block mb-1">api_player_id</label>
            <input value={form.api_player_id} onChange={e => setForm(f => ({ ...f, api_player_id: e.target.value }))}
              className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm w-32 font-mono" placeholder="1237" />
          </div>
          <button onClick={add} disabled={loading}
            className="bg-green-600 hover:bg-green-500 text-white rounded-lg px-4 py-2 text-sm font-bold disabled:opacity-50">
            追加
          </button>
        </div>
        {msg && <p className="text-sm mt-3 text-green-400">{msg}</p>}
      </div>

      {/* 検索 */}
      <input value={search} onChange={e => setSearch(e.target.value)}
        className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm w-64 mb-4"
        placeholder="名前・チーム名で絞り込み" />
      {search && <span className="text-xs text-gray-500 ml-2">※ 並び替えは絞り込みなしの状態で行ってください</span>}

      {/* 一覧 */}
      <table className="w-full text-sm">
        <thead>
          <tr className="text-gray-400 text-left border-b border-gray-800">
            <th className="pb-3 pr-2 w-16">順番</th>
            <th className="pb-3 pr-4">選手名</th>
            <th className="pb-3 pr-4">Player ID</th>
            <th className="pb-3 pr-4">所属チーム</th>
            <th className="pb-3 pr-4">POS</th>
            <th className="pb-3 pr-4">#</th>
            <th className="pb-3"></th>
          </tr>
        </thead>
        <tbody>
          {filtered.map((p, i) => (
            <tr key={p.id} className="border-b border-gray-900 hover:bg-gray-900">
              <td className="py-2 pr-2">
                {!search && (
                  <div className="flex gap-1">
                    <button
                      onClick={() => moveUp(i)}
                      disabled={i === 0}
                      className="text-gray-500 hover:text-gray-200 disabled:opacity-20 text-base leading-none px-1"
                      title="上へ"
                    >↑</button>
                    <button
                      onClick={() => moveDown(i)}
                      disabled={i === players.length - 1}
                      className="text-gray-500 hover:text-gray-200 disabled:opacity-20 text-base leading-none px-1"
                      title="下へ"
                    >↓</button>
                  </div>
                )}
              </td>
              <td className="py-3 pr-4 font-medium">{p.name}</td>
              <td className="py-3 pr-4 font-mono text-gray-400">{p.api_player_id}</td>
              <td className="py-3 pr-4 text-gray-300">
                {p.teams?.name ?? <span className="text-yellow-500 text-xs">未設定</span>}
              </td>
              <td className="py-3 pr-4 text-gray-400">{p.position ?? '−'}</td>
              <td className="py-3 pr-4 text-gray-400">{p.number ?? '−'}</td>
              <td className="py-3">
                <button onClick={() => remove(p.id, p.name)} className="text-red-400 hover:text-red-300 text-xs">削除</button>
              </td>
            </tr>
          ))}
          {filtered.length === 0 && (
            <tr><td colSpan={7} className="py-8 text-center text-gray-500">選手が登録されていません</td></tr>
          )}
        </tbody>
      </table>
    </div>
  )
}
