import { Router } from 'express'
import { supabase } from '../services/supabase'

const router = Router()

// 試合一覧（今後2週間 + 直近7日の終了試合）
router.get('/', async (req, res) => {
  const { device_id } = req.query

  const from = new Date(Date.now() - 7 * 86400000).toISOString()
  const to = new Date(Date.now() + 14 * 86400000).toISOString()

  const { data: matches, error } = await supabase
    .from('matches')
    .select(`
      id, api_fixture_id, date, status, live_status, current_minute, extra_minute,
      home_score, away_score, home_team_id, away_team_id, league_id,
      league:leagues(id, name, sort_order),
      home_team:teams!matches_home_team_id_fkey(id, name, logo_url),
      away_team:teams!matches_away_team_id_fkey(id, name, logo_url),
      match_players(
        player_id, status, minute_in, minute_out, goals, assists,
        goal_minutes, assist_minutes,
        players(id, name, api_team_id, position, number, sort_order)
      )
    `)
    .gte('date', from)
    .lte('date', to)
    .order('date', { ascending: true })

  if (error) return res.status(500).json({ error: error.message })

  if (device_id) {
    const { data: followed } = await supabase
      .from('followed_players')
      .select('player_id')
      .eq('device_id', device_id)

    const followedIds = new Set((followed ?? []).map((f) => f.player_id))
    return res.json({ matches: matches ?? [], followed_player_ids: [...followedIds] })
  }

  return res.json({ matches: matches ?? [], followed_player_ids: [] })
})

// 選手一覧（sort_order順）
router.get('/players', async (req, res) => {
  const { q } = req.query

  let query = supabase
    .from('players')
    .select('*, teams!players_api_team_id_fkey(name, leagues(name))')
    .not('api_team_id', 'is', null)
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true })

  if (q) {
    query = query.ilike('name', `%${q}%`)
  }

  const { data, error } = await query
  if (error) return res.status(500).json({ error: error.message })
  return res.json(data)
})

export default router
