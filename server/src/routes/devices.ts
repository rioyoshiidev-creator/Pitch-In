import { Router } from 'express'
import { supabase } from '../services/supabase'

const router = Router()

// デバイス登録 / Push Token 更新
router.post('/', async (req, res) => {
  const { push_token, platform = 'ios' } = req.body
  if (!push_token) return res.status(400).json({ error: 'push_token is required' })

  const { data, error } = await supabase
    .from('devices')
    .upsert({ push_token, platform, updated_at: new Date().toISOString() }, { onConflict: 'push_token' })
    .select('id')
    .single()

  if (error) return res.status(500).json({ error: error.message })
  return res.json({ device_id: data.id })
})

// フォロー選手を同期（全件置き換え）
router.put('/:deviceId/followed-players', async (req, res) => {
  const { deviceId } = req.params
  const { players } = req.body as {
    players: {
      player_id: string
      notify_lineup: boolean
      notify_substitution: boolean
      notify_goal: boolean
      notify_assist: boolean
    }[]
  }

  if (!Array.isArray(players)) return res.status(400).json({ error: 'players must be an array' })

  // 既存を削除して再挿入
  await supabase.from('followed_players').delete().eq('device_id', deviceId)

  if (players.length > 0) {
    const rows = players.map((p) => ({ device_id: deviceId, ...p }))
    const { error } = await supabase.from('followed_players').insert(rows)
    if (error) return res.status(500).json({ error: error.message })
  }

  return res.json({ ok: true })
})

export default router
