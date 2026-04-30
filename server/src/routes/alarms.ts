import { Router } from 'express'
import { supabase } from '../services/supabase'

const router = Router()

// アラーム一覧取得
router.get('/', async (req, res) => {
  const { device_id } = req.query
  if (!device_id) return res.status(400).json({ error: 'device_id is required' })

  const { data, error } = await supabase
    .from('alarms')
    .select(`
      *,
      matches(
        id, date,
        home_team:teams!matches_home_team_id_fkey(name),
        away_team:teams!matches_away_team_id_fkey(name),
        league:leagues(name)
      )
    `)
    .eq('device_id', device_id)
    .order('created_at', { ascending: false })

  if (error) return res.status(500).json({ error: error.message })
  return res.json(data)
})

// アラーム設定（upsert）
router.post('/', async (req, res) => {
  const { device_id, match_id, alarm_timing, minutes_before, notify_substitution, snooze, selected_player_ids } = req.body

  const { data, error } = await supabase
    .from('alarms')
    .upsert(
      {
        device_id, match_id, alarm_timing, minutes_before, notify_substitution, snooze,
        selected_player_ids: selected_player_ids ?? null,
        sub_alarm_fired: false,  // 保存・更新時はリセット
        is_enabled: true,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'device_id,match_id' }
    )
    .select('id')
    .single()

  if (error) return res.status(500).json({ error: error.message })
  return res.json({ alarm_id: data.id })
})

// アラーム更新（ON/OFF・設定変更）
router.patch('/:alarmId', async (req, res) => {
  const { alarmId } = req.params
  const updates = req.body

  const { error } = await supabase
    .from('alarms')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', alarmId)

  if (error) return res.status(500).json({ error: error.message })
  return res.json({ ok: true })
})

// アラーム削除
router.delete('/:alarmId', async (req, res) => {
  const { alarmId } = req.params

  const { error } = await supabase.from('alarms').delete().eq('id', alarmId)
  if (error) return res.status(500).json({ error: error.message })
  return res.json({ ok: true })
})

export default router
