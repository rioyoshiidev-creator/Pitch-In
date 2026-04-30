/**
 * 試合スケジュール同期
 * 日本人選手が所属するチーム（has_japanese=true）の試合のみ取得
 * 毎日1回実行
 *
 * 試合保存時に match_players も同時に保存する（status='unknown'）
 * これにより routes/matches.ts での実行時補完が不要になり、
 * sync_squads の前後どちらに実行しても表示に影響が出ない
 */
import { supabase } from '../services/supabase'
import axios from 'axios'

const api = axios.create({
  baseURL: 'https://v3.football.api-sports.io',
  headers: { 'x-apisports-key': process.env.API_FOOTBALL_KEY! },
})

function toMatchStatus(short: string): string {
  if (['1H', '2H', 'ET', 'P', 'HT'].includes(short)) return 'live'
  if (['FT', 'AET', 'PEN'].includes(short)) return 'finished'
  if (['PST', 'CANC', 'ABD'].includes(short)) return 'postponed'
  return 'scheduled'
}

export async function syncMatchSchedule() {
  console.log('[scheduleSync] 開始')

  const { data: teams } = await supabase
    .from('teams')
    .select('id, name, league_id, leagues(current_season)')
    .eq('has_japanese', true)

  if (!teams || teams.length === 0) {
    console.log('[scheduleSync] 対象チームなし')
    return
  }

  // 日本人選手を api_team_id でインデックス化
  const { data: japanesePlayers } = await supabase
    .from('players')
    .select('id, api_team_id')
    .not('api_team_id', 'is', null)

  const playersByTeam = new Map<number, string[]>()
  for (const p of japanesePlayers ?? []) {
    if (!p.api_team_id) continue
    const list = playersByTeam.get(p.api_team_id) ?? []
    list.push(p.id)
    playersByTeam.set(p.api_team_id, list)
  }

  const from = new Date().toISOString().split('T')[0]
  const to = new Date(Date.now() + 14 * 86400000).toISOString().split('T')[0]

  for (const team of teams) {
    const season = (team.leagues as any)?.current_season
    if (!season) continue

    try {
      const res = await api.get('/fixtures', {
        params: { team: team.id, season, from, to },
      })
      const fixtures: any[] = res.data.response ?? []

      for (const f of fixtures) {
        const matchId = `fixture-${f.fixture.id}`

        await supabase.from('matches').upsert({
          id: matchId,
          api_fixture_id: f.fixture.id,
          league_id: f.league.id,
          home_team_id: f.teams.home.id,
          away_team_id: f.teams.away.id,
          home_score: f.goals.home,
          away_score: f.goals.away,
          date: f.fixture.date,
          status: toMatchStatus(f.fixture.status.short),
          live_status: f.fixture.status.short,
          current_minute: f.fixture.status.elapsed,
          extra_minute: f.fixture.status.extra ?? null,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'api_fixture_id' })

        // 試合に関わる日本人選手を match_players に保存（既存があれば無視）
        const teamIds = [f.teams.home.id, f.teams.away.id]
        for (const teamId of teamIds) {
          const playerIds = playersByTeam.get(teamId) ?? []
          for (const playerId of playerIds) {
            await supabase.from('match_players').upsert(
              { match_id: matchId, player_id: playerId, status: 'unknown', goals: 0, assists: 0 },
              { onConflict: 'match_id,player_id', ignoreDuplicates: true }
            )
          }
        }
      }

      console.log(`  [${team.name}] ${fixtures.length}試合保存`)
      await sleep(2000)
    } catch (err: any) {
      console.error(`  [${team.name}] エラー: ${err.message}`)
    }
  }

  console.log('[scheduleSync] 完了')
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}
