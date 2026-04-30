import { Router } from 'express'
import { sendSilentPush, sendPushNotifications, type PushEventType } from '../services/expoPush'
import { supabase } from '../services/supabase'

const VALID_EVENT_TYPES: PushEventType[] = ['starter', 'bench', 'not_called_up', 'substitution', 'goal', 'assist']

const router = Router()

// サイレントプッシュ → BackgroundTask → ローカルアラーム の本番フローをテスト
router.post('/silent-push', async (req, res) => {
  const {
    push_token,
    event_type = 'starter',
    player_name = '三笘薫',
    delay_seconds = 5,
    snooze = false,
  } = req.body

  if (!push_token) return res.status(400).json({ error: 'push_token is required' })

  const fireAt = new Date(Date.now() + delay_seconds * 1000).toISOString()

  await sendSilentPush(push_token, {
    playerName: player_name,
    eventType: event_type,
    fireAt,
    alarmId: 'test',
    matchId: 'test',
    snooze,
  })

  console.log(`[test] silent push sent → fireAt: ${fireAt}`)
  return res.json({ ok: true, fireAt })
})

// 通常プッシュ通知のテスト
router.post('/push', async (req, res) => {
  const {
    push_token,
    event_type = 'starter',
    player_name = '三笘薫',
  } = req.body

  if (!push_token) return res.status(400).json({ error: 'push_token is required' })

  const validEventType: PushEventType = VALID_EVENT_TYPES.includes(event_type) ? event_type : 'starter'

  await sendPushNotifications({
    pushTokens: [push_token],
    playerName: player_name,
    eventType: validEventType,
    matchId: 'test',
  })

  console.log(`[test] push notification sent`)
  return res.json({ ok: true })
})

// match_id に紐づくアラームを全て強制発火（match_players・notification_log を無視）
router.post('/force-alarm', async (req, res) => {
  const { match_id, delay_seconds = 5 } = req.body
  if (!match_id) return res.status(400).json({ error: 'match_id is required' })

  const { data: match } = await supabase.from('matches').select('date').eq('id', match_id).single()
  if (!match) return res.status(404).json({ error: 'match not found' })

  const { data: alarms } = await supabase
    .from('alarms')
    .select('id, alarm_timing, minutes_before, snooze, devices(push_token)')
    .eq('match_id', match_id)
    .eq('is_enabled', true)

  if (!alarms || alarms.length === 0) {
    return res.status(404).json({ error: 'no enabled alarms found for this match_id' })
  }

  const fireAt = new Date(Date.now() + delay_seconds * 1000).toISOString()
  let fired = 0

  for (const alarm of alarms) {
    const token = (alarm.devices as unknown as { push_token: string } | null)?.push_token
    if (!token) continue
    await sendSilentPush(token, {
      matchId: match_id,
      eventType: 'starter',
      alarmId: alarm.id,
      fireAt,
      snooze: alarm.snooze ?? false,
    })
    fired++
  }

  console.log(`[test/force-alarm] ${fired}件発火 match=${match_id} fireAt=${fireAt}`)
  return res.json({ ok: true, fired, fireAt })
})

// DB のアラーム設定を使ってスタメン通知アラームを発火（lineupPoller の API呼び出し部分をスキップ）
router.post('/fire-lineup-alarm', async (req, res) => {
  const { match_id } = req.body
  if (!match_id) return res.status(400).json({ error: 'match_id is required' })

  const { sendLineupNotifications } = await import('../jobs/lineupPoller')
  const { data: match } = await supabase.from('matches').select('date').eq('id', match_id).single()
  if (!match) return res.status(404).json({ error: 'match not found' })

  await sendLineupNotifications(match_id, match.date)
  return res.json({ ok: true })
})

// DB のアラーム設定を使って途中出場アラームを発火（eventPoller の API呼び出し部分をスキップ）
router.post('/fire-sub-alarm', async (req, res) => {
  const { match_id, player_id } = req.body
  if (!match_id || !player_id) return res.status(400).json({ error: 'match_id and player_id are required' })

  const { fireBenchAlarms } = await import('../jobs/eventPoller')
  await fireBenchAlarms(match_id, player_id)
  return res.json({ ok: true })
})

export default router
