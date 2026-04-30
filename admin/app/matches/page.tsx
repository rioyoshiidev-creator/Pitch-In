'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

interface Match {
  id: string
  api_fixture_id: number
  date: string
  status: string
  current_minute: number | null
  home_score: number | null
  away_score: number | null
  lineup_fetched: boolean
  home_team: { name: string } | null
  away_team: { name: string } | null
}

const STATUS_LABEL: Record<string, { label: string; color: string }> = {
  scheduled: { label: '予定', color: 'text-gray-400' },
  live:       { label: 'LIVE', color: 'text-red-400' },
  finished:   { label: '終了', color: 'text-gray-500' },
  postponed:  { label: '延期', color: 'text-yellow-400' },
}

export default function MatchesPage() {
  const [matches, setMatches] = useState<Match[]>([])
  const [logs, setLogs] = useState<string[]>([])
  const [running, setRunning] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<string>('all')

  async function load() {
    const { data } = await supabase
      .from('matches')
      .select('*, home_team:teams!matches_home_team_id_fkey(name), away_team:teams!matches_away_team_id_fkey(name)')
      .order('date', { ascending: true })
    setMatches((data as any) ?? [])
  }

  useEffect(() => { load() }, [])

  async function runBatch(type: string, matchId: string, fixtureId: number) {
    if (running) return
    setRunning(`${type}-${matchId}`)
    setLogs([`▶ ${type === 'fetch_lineup' ? 'スタメン取得' : 'イベント取得'} 開始...`])

    const res = await fetch('/api/batches', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, matchId, fixtureId }),
    })

    const reader = res.body?.getReader()
    const decoder = new TextDecoder()
    if (!reader) return

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      const text = decoder.decode(value)
      for (const line of text.split('\n').filter(l => l.startsWith('data: '))) {
        setLogs(prev => [...prev, line.replace('data: ', '')])
      }
    }

    setRunning(null)
    await load()
  }

  const filtered = statusFilter === 'all' ? matches : matches.filter(m => m.status === statusFilter)

  return (
    <div>
      <h1 className="text-xl font-bold mb-2">試合一覧</h1>
      <p className="text-gray-400 text-sm mb-6">スケジュール取得後、各試合のスタメン・イベントを手動取得できます</p>

      {/* フィルター */}
      <div className="flex gap-2 mb-6">
        {['all', 'scheduled', 'live', 'finished', 'postponed'].map(s => (
          <button key={s} onClick={() => setStatusFilter(s)}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold ${statusFilter === s ? 'bg-green-600 text-white' : 'bg-gray-800 text-gray-300'}`}>
            {s === 'all' ? `全て (${matches.length})` : STATUS_LABEL[s]?.label}
          </button>
        ))}
        <button onClick={load} className="ml-auto px-3 py-1.5 rounded-lg text-xs bg-gray-800 text-gray-300 hover:bg-gray-700">
          更新
        </button>
      </div>

      {/* 試合一覧 */}
      <div className="space-y-2 mb-8">
        {filtered.length === 0 && (
          <div className="text-center text-gray-500 py-12">
            試合がありません。バッチページからスケジュール取得を実行してください
          </div>
        )}
        {filtered.map(m => {
          const st = STATUS_LABEL[m.status] ?? { label: m.status, color: 'text-gray-400' }
          const dateStr = new Date(m.date).toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })
          const isRunningLineup = running === `fetch_lineup-${m.id}`
          const isRunningEvents = running === `fetch_events-${m.id}`

          return (
            <div key={m.id} className="bg-gray-900 border border-gray-800 rounded-xl px-5 py-4 flex items-center gap-4">
              {/* 日時・ステータス */}
              <div className="w-32 shrink-0">
                <div className="text-xs text-gray-400">{dateStr}</div>
                <div className={`text-xs font-bold mt-0.5 ${st.color}`}>
                  {st.label}{m.status === 'live' && m.current_minute ? ` ${m.current_minute}'` : ''}
                </div>
              </div>

              {/* 対戦カード */}
              <div className="flex-1 min-w-0">
                <div className="text-sm font-bold">
                  {m.home_team?.name ?? '−'} vs {m.away_team?.name ?? '−'}
                </div>
                {(m.home_score !== null) && (
                  <div className="text-xs text-gray-400 mt-0.5">
                    {m.home_score} - {m.away_score}
                  </div>
                )}
              </div>

              {/* fixture ID */}
              <div className="text-xs text-gray-600 font-mono shrink-0">#{m.api_fixture_id}</div>

              {/* スタメン取得済みバッジ */}
              {m.lineup_fetched && (
                <span className="text-xs bg-green-900 text-green-400 px-2 py-0.5 rounded-full shrink-0">スタメン済</span>
              )}

              {/* アクションボタン */}
              <div className="flex gap-2 shrink-0">
                {(m.status === 'scheduled' || m.status === 'live') && (
                  <button
                    onClick={() => runBatch('fetch_lineup', m.id, m.api_fixture_id)}
                    disabled={!!running}
                    className="bg-blue-700 hover:bg-blue-600 disabled:opacity-40 text-white text-xs font-bold px-3 py-1.5 rounded-lg">
                    {isRunningLineup ? '取得中...' : 'スタメン'}
                  </button>
                )}
                {m.status === 'live' && (
                  <button
                    onClick={() => runBatch('fetch_events', m.id, m.api_fixture_id)}
                    disabled={!!running}
                    className="bg-red-700 hover:bg-red-600 disabled:opacity-40 text-white text-xs font-bold px-3 py-1.5 rounded-lg">
                    {isRunningEvents ? '取得中...' : 'イベント'}
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* ログ */}
      {logs.length > 0 && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <h2 className="text-xs text-gray-400 uppercase tracking-wide mb-3">実行ログ</h2>
          <div className="font-mono text-sm space-y-1 max-h-64 overflow-y-auto">
            {logs.map((log, i) => (
              <div key={i} className={
                log.startsWith('✅') ? 'text-green-400' :
                log.startsWith('❌') ? 'text-red-400' :
                log.startsWith('⚠') ? 'text-yellow-400' :
                'text-gray-300'
              }>{log}</div>
            ))}
            {running && <div className="text-gray-500 animate-pulse">処理中...</div>}
          </div>
        </div>
      )}
    </div>
  )
}
