'use client'
import { useState } from 'react'

type BatchType = 'sync_teams' | 'sync_squads' | 'sync_schedule'

interface BatchConfig {
  type: BatchType
  label: string
  desc: string
  warning?: string
}

const BATCHES: BatchConfig[] = [
  {
    type: 'sync_teams',
    label: 'チーム取得',
    desc: '登録済みリーグの全チームをAPIから取得してDBに保存します',
    warning: 'シーズン開始時（年1〜2回）に実行してください',
  },
  {
    type: 'sync_squads',
    label: 'スカッド取得・選手紐付け',
    desc: '全チームのスカッドを取得し、登録済み選手のチームを自動設定します',
    warning: '移籍期間中は毎日、通常期間はシーズン開始時に実行してください',
  },
  {
    type: 'sync_schedule',
    label: '試合スケジュール取得',
    desc: '日本人選手のいるチームの今後2週間の試合をDBに保存します',
    warning: '試合ページから個別にスタメン・イベント取得もできます',
  },
]

export default function BatchesPage() {
  const [logs, setLogs] = useState<string[]>([])
  const [running, setRunning] = useState(false)
  const [currentBatch, setCurrentBatch] = useState<BatchType | null>(null)

  async function runBatch(type: BatchType) {
    if (running) return
    setRunning(true)
    setCurrentBatch(type)
    setLogs([`▶ ${BATCHES.find(b => b.type === type)?.label} 開始...`])

    const res = await fetch('/api/batches', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type }),
    })

    const reader = res.body?.getReader()
    const decoder = new TextDecoder()

    if (!reader) return

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      const text = decoder.decode(value)
      const lines = text.split('\n').filter(l => l.startsWith('data: '))
      for (const line of lines) {
        const msg = line.replace('data: ', '')
        setLogs(prev => [...prev, msg])
      }
    }

    setRunning(false)
    setCurrentBatch(null)
  }

  return (
    <div>
      <h1 className="text-xl font-bold mb-2">バッチ実行</h1>
      <p className="text-gray-400 text-sm mb-8">APIリクエストを消費します。実行前に残りクォータを確認してください</p>

      <div className="grid gap-4 mb-8">
        {BATCHES.map(b => (
          <div key={b.type} className="bg-gray-900 border border-gray-800 rounded-xl p-6">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="font-bold text-base mb-1">{b.label}</h2>
                <p className="text-gray-400 text-sm mb-2">{b.desc}</p>
                {b.warning && (
                  <p className="text-yellow-500 text-xs">⚠ {b.warning}</p>
                )}
              </div>
              <button
                onClick={() => runBatch(b.type)}
                disabled={running}
                className="ml-6 bg-green-600 hover:bg-green-500 disabled:opacity-40 text-white rounded-lg px-5 py-2 text-sm font-bold whitespace-nowrap"
              >
                {running && currentBatch === b.type ? '実行中...' : '実行'}
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* ログ表示 */}
      {logs.length > 0 && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <h2 className="text-xs text-gray-400 uppercase tracking-wide mb-3">実行ログ</h2>
          <div className="font-mono text-sm space-y-1 max-h-96 overflow-y-auto">
            {logs.map((log, i) => (
              <div key={i} className={
                log.startsWith('✅') ? 'text-green-400' :
                log.startsWith('❌') ? 'text-red-400' :
                log.startsWith('⚠') ? 'text-yellow-400' :
                log.startsWith('🔄') ? 'text-blue-400' :
                'text-gray-300'
              }>
                {log}
              </div>
            ))}
            {running && <div className="text-gray-500 animate-pulse">処理中...</div>}
          </div>
        </div>
      )}
    </div>
  )
}
