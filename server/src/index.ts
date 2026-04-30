import 'dotenv/config'
import express from 'express'
import cron from 'node-cron'
import devicesRouter from './routes/devices'
import alarmsRouter from './routes/alarms'
import matchesRouter from './routes/matches'
import configRouter from './routes/config'
import testRouter from './routes/test'
import { syncMatchSchedule } from './jobs/scheduleSync'
import { syncTeams, syncJapanesePlayers } from './jobs/syncTeamsAndPlayers'
import { pollLineups } from './jobs/lineupPoller'
import { pollLiveEvents } from './jobs/eventPoller'

const app = express()
app.use(express.json())

// ヘルスチェック
app.get('/health', (_req, res) => res.json({ ok: true, ts: new Date().toISOString() }))

// ルート
app.use('/devices', devicesRouter)
app.use('/alarms', alarmsRouter)
app.use('/matches', matchesRouter)
app.use('/config', configRouter)
app.use('/test', testRouter)

// ============================================================
// Cronジョブ
// ※ 開発中は100req/day制限のため頻度を抑えています
// ============================================================

// 毎日 09:00 に試合スケジュール同期
cron.schedule('0 9 * * *', async () => {
  await syncMatchSchedule()
}, { timezone: 'Asia/Tokyo' })

// 移籍期間中は毎日 08:00 に選手チーム更新（1〜2月、7〜8月）
// 通常期間は手動実行
cron.schedule('0 8 * * *', async () => {
  await syncJapanesePlayers()
}, { timezone: 'Asia/Tokyo' })

// 試合開始1時間前からスタメン確認（5分ごと）
cron.schedule('*/5 * * * *', async () => {
  await pollLineups()
})

// 試合中イベント確認（1分ごと）
cron.schedule('* * * * *', async () => {
  await pollLiveEvents()
})


const PORT = process.env.PORT ?? 3000
app.listen(PORT, () => {
  console.log(`[server] 起動完了 http://localhost:${PORT}`)
  console.log('[server] cron: scheduleSync=1回/日(09:00), lineup=5分ごと, events=1分ごと')
})
