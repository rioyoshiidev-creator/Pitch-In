/**
 * チーム・選手同期ジョブ
 *
 * 実行タイミング:
 *   - シーズン開始時（年1〜2回）: syncTeams → syncJapanesePlayers の順で実行
 *   - 移籍期間中（日1回）: syncJapanesePlayers のみ実行（移籍チェック）
 *
 * 選手の登録方法:
 *   - 管理者が players テーブルに name + api_player_id を手動登録
 *   - syncJapanesePlayers がスカッドと突合してチームを自動設定
 *
 * 設計方針: いつ実行してもユーザー表示に影響が出ないよう、削除・リセットは行わない
 *   - syncTeams: upsert のみ（削除しない）
 *   - syncJapanesePlayers: 見つかった選手のみ更新、見つからなかった選手だけ null に
 *     移籍検知時: 旧チームの未確定試合から match_players を削除 → 新チームに追加
 */
import { supabase } from '../services/supabase'
import axios from 'axios'

const api = axios.create({
  baseURL: 'https://v3.football.api-sports.io',
  headers: { 'x-apisports-key': process.env.API_FOOTBALL_KEY! },
})

// Step1: リーグに所属する全チームを取得してDBに保存（upsertのみ、削除しない）
export async function syncTeams() {
  console.log('[syncTeams] 開始')

  const { data: leagues } = await supabase.from('leagues').select('id, name')

  if (!leagues || leagues.length === 0) {
    console.log('[syncTeams] 対象リーグなし')
    return
  }

  for (const league of leagues) {
    try {
      const leagueRes = await api.get('/leagues', { params: { id: league.id, current: 'true' } })
      const leagueData = leagueRes.data.response?.[0]
      const season = leagueData?.seasons?.find((s: any) => s.current === true)?.year

      if (!season) {
        console.log(`  [${league.name}] 現在のシーズンが取得できませんでした`)
        await sleep(2000)
        continue
      }

      await supabase.from('leagues').update({ current_season: season }).eq('id', league.id)
      console.log(`  [${league.name}] シーズン: ${season}`)
      await sleep(2000)

      console.log(`  [${league.name}] チーム取得中...`)
      const res = await api.get('/teams', { params: { league: league.id, season } })
      const teams: any[] = res.data.response ?? []

      for (const t of teams) {
        await supabase.from('teams').upsert(
          { id: t.team.id, name: t.team.name, logo_url: t.team.logo ?? null, league_id: league.id, updated_at: new Date().toISOString() },
          { onConflict: 'id' }
        )
      }
      console.log(`    → ${teams.length}チーム保存`)
      await sleep(2000)
    } catch (err: any) {
      console.error(`  [${league.name}] エラー: ${err.message}`)
    }
  }

  console.log('[syncTeams] 完了')
}

// Step2: 全チームのスカッドを取得し、手動登録済みの選手IDと突合してチームを紐付け
// - 見つかった選手: api_team_id を更新、移籍の場合は match_players も付け替え
// - 見つからなかった選手: api_team_id = null（どのチームにも所属していない）
export async function syncJapanesePlayers() {
  console.log('[syncJapanesePlayers] 開始')

  const { data: registeredPlayers } = await supabase
    .from('players')
    .select('id, name, api_player_id, api_team_id')

  if (!registeredPlayers || registeredPlayers.length === 0) {
    console.log('[syncJapanesePlayers] 登録済み選手なし。先に players テーブルに手動登録してください')
    return
  }

  const playerMap = new Map(registeredPlayers.map((p) => [p.api_player_id, p]))
  console.log(`  登録済み選手: ${registeredPlayers.length}人`)

  const { data: teams } = await supabase.from('teams').select('id, name, league_id')

  if (!teams || teams.length === 0) {
    console.log('[syncJapanesePlayers] チームデータなし。先に syncTeams を実行してください')
    return
  }

  // 全チームの has_japanese をリセット（今回のスカッドで再設定）
  await supabase.from('teams').update({ has_japanese: false }).neq('id', 0)

  // どのスカッドでも見つかった選手IDを記録
  const foundPlayerIds = new Set<string>()
  let matched = 0

  for (const team of teams) {
    try {
      const res = await api.get('/players/squads', { params: { team: team.id } })
      const squads: any[] = res.data.response ?? []
      const squadPlayers: any[] = squads.flatMap((s: any) => s.players ?? [])

      const foundPlayers = squadPlayers.filter((p: any) => playerMap.has(p.id))

      if (foundPlayers.length > 0) {
        await supabase
          .from('teams')
          .update({ has_japanese: true, updated_at: new Date().toISOString() })
          .eq('id', team.id)

        for (const p of foundPlayers) {
          const registered = playerMap.get(p.id)!
          foundPlayerIds.add(registered.id)

          const isTransfer = registered.api_team_id !== null && registered.api_team_id !== team.id

          if (isTransfer) {
            console.log(`    移籍検知: ${registered.name} (${registered.api_team_id} → ${team.id})`)
            await handleTransfer(registered.id, registered.api_team_id!, team.id)
          } else if (registered.api_team_id === null) {
            console.log(`    チーム紐付け: ${registered.name} → ${team.name}`)
            await addPlayerToUpcomingMatches(registered.id, team.id)
          }

          await supabase
            .from('players')
            .update({
              api_team_id: team.id,
              position: p.position ?? null,
              number: p.number ?? null,
              updated_at: new Date().toISOString(),
            })
            .eq('id', registered.id)

          matched++
        }
      }

      await sleep(2000)
    } catch (err: any) {
      console.error(`  [${team.name}] エラー: ${err.message}`)
    }
  }

  // どのスカッドにも見つからなかった選手は api_team_id = null
  for (const player of registeredPlayers) {
    if (!foundPlayerIds.has(player.id) && player.api_team_id !== null) {
      console.log(`  未所属（移籍先不明）: ${player.name}`)
      await supabase
        .from('players')
        .update({ api_team_id: null, updated_at: new Date().toISOString() })
        .eq('id', player.id)
    }
  }

  console.log(`[syncJapanesePlayers] 完了: ${matched}選手のチームを更新`)
}

// 移籍時: 旧チームの未確定試合から削除 → 新チームの試合に追加
async function handleTransfer(playerId: string, oldTeamId: number, newTeamId: number) {
  // 旧チームの lineup 未確定の将来試合から削除
  const { data: oldMatches } = await supabase
    .from('matches')
    .select('id')
    .or(`home_team_id.eq.${oldTeamId},away_team_id.eq.${oldTeamId}`)
    .gte('date', new Date().toISOString())
    .eq('lineup_fetched', false)

  for (const m of oldMatches ?? []) {
    await supabase
      .from('match_players')
      .delete()
      .eq('match_id', m.id)
      .eq('player_id', playerId)
  }

  // 新チームの将来試合に追加
  await addPlayerToUpcomingMatches(playerId, newTeamId)
}

// 選手を指定チームの将来試合の match_players に追加（既存があれば無視）
async function addPlayerToUpcomingMatches(playerId: string, teamId: number) {
  const { data: upcomingMatches } = await supabase
    .from('matches')
    .select('id')
    .or(`home_team_id.eq.${teamId},away_team_id.eq.${teamId}`)
    .gte('date', new Date().toISOString())
    .in('status', ['scheduled', 'postponed'])

  for (const match of upcomingMatches ?? []) {
    await supabase.from('match_players').upsert(
      { match_id: match.id, player_id: playerId, status: 'unknown', goals: 0, assists: 0 },
      { onConflict: 'match_id,player_id', ignoreDuplicates: true }
    )
  }
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}
