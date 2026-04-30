import { supabase } from '../services/supabase'
import { sendSilentPush } from '../services/expoPush'

const LEAD_SECONDS = 60 // 発火時刻の何秒前にSilent Pushを送るか

// 10秒ごと: scheduled_fire_time の LEAD_SECONDS 秒前になったアラームを送信
export async function fireScheduledAlarms() {
  const now = new Date()
  const threshold = new Date(now.getTime() + LEAD_SECONDS * 1000).toISOString()

  const { data: alarms } = await supabase
    .from('alarms')
    .select('id, match_id, scheduled_fire_time, devices(push_token)')
    .eq('is_enabled', true)
    .eq('is_fired', false)
    .not('scheduled_fire_time', 'is', null)
    .lte('scheduled_fire_time', threshold)

  if (!alarms || alarms.length === 0) return

  for (const alarm of alarms) {
    const token = (alarm.devices as unknown as { push_token: string } | null)?.push_token
    if (!token) continue

    try {
      await sendSilentPush(token, {
        matchId: alarm.match_id,
        eventType: 'starter',
        alarmId: alarm.id,
        fireAt: alarm.scheduled_fire_time, // デバイス側でdelaySecondsを計算するために渡す
      })
      await supabase.from('alarms').update({ is_fired: true }).eq('id', alarm.id)
      console.log(`[alarmFire] alarm ${alarm.id} → fireAt ${alarm.scheduled_fire_time}`)
    } catch (err) {
      console.error(`[alarmFire] alarm ${alarm.id} 送信失敗:`, err)
    }
  }
}
