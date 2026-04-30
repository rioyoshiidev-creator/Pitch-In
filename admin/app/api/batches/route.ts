import { NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import axios from 'axios'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY!
)

const api = axios.create({
  baseURL: 'https://v3.football.api-sports.io',
  headers: { 'x-apisports-key': process.env.NEXT_PUBLIC_API_FOOTBALL_KEY! },
})

function sleep(ms: number) {
  return new Promise(r => setTimeout(r, ms))
}

// API-Football は失敗時も HTTP 200 で errors フィールドにエラーを入れて返す
function checkApiErrors(data: any): string | null {
  if (!data.errors) return null
  if (Array.isArray(data.errors) && data.errors.length === 0) return null
  if (typeof data.errors === 'object' && Object.keys(data.errors).length === 0) return null
  return JSON.stringify(data.errors)
}

function toMatchStatus(short: string): string {
  if (['1H', '2H', 'ET', 'P', 'HT'].includes(short)) return 'live'
  if (['FT', 'AET', 'PEN'].includes(short)) return 'finished'
  if (['PST', 'CANC', 'ABD'].includes(short)) return 'postponed'
  return 'scheduled'
}

// SSE でログを逐次送信
export async function POST(req: NextRequest) {
  const body = await req.json()
  const { type, matchId, fixtureId, leagueId } = body

  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      function log(msg: string) {
        controller.enqueue(encoder.encode(`data: ${msg}\n\n`))
      }

      try {
        if (type === 'sync_teams') {
          await runSyncTeams(log)
        } else if (type === 'sync_squads') {
          await runSyncSquads(log)
        } else if (type === 'sync_schedule') {
          await runSyncSchedule(log)
        } else if (type === 'fetch_lineup') {
          await runFetchLineup(log, matchId, fixtureId)
        } else if (type === 'fetch_events') {
          await runFetchEvents(log, matchId, fixtureId)
        } else {
          log('❌ 不明なバッチタイプ')
        }
        log('✅ 完了')
      } catch (err: any) {
        log(`❌ エラー: ${err.message}`)
      } finally {
        controller.close()
      }
    }
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    }
  })
}

// ── チーム取得 ────────────────────────────────────────────
async function runSyncTeams(log: (msg: string) => void) {
  log('📋 チーム取得バッチ開始')
  const { data: leagues } = await supabase.from('leagues').select('id, name')
  if (!leagues || leagues.length === 0) { log('⚠️ リーグが登録されていません'); return }

  for (const league of leagues) {
    // 現在のシーズンをAPIから取得
    const leagueRes = await api.get('/leagues', { params: { id: league.id, current: 'true' } })
    const leagueApiError = checkApiErrors(leagueRes.data)
    if (leagueApiError) { log(`  ❌ [${league.name}] シーズン取得エラー: ${leagueApiError}`); await sleep(2000); continue }

    const leagueData = leagueRes.data.response?.[0]
    const season = leagueData?.seasons?.find((s: any) => s.current === true)?.year
    if (!season) { log(`  ⚠️ [${league.name}] 現在のシーズンが取得できません`); await sleep(2000); continue }

    await supabase.from('leagues').update({ current_season: season }).eq('id', league.id)
    log(`  [${league.name}] シーズン: ${season}`)
    await sleep(2000)

    // チーム取得
    log(`  [${league.name}] チーム取得中...`)
    const res = await api.get('/teams', { params: { league: league.id, season } })
    const apiError = checkApiErrors(res.data)
    if (apiError) { log(`  ❌ APIエラー: ${apiError}`); await sleep(2000); continue }

    const teams: any[] = res.data.response ?? []
    if (teams.length === 0) { log(`  ⚠️ チームが0件でした`); await sleep(2000); continue }

    for (const t of teams) {
      await supabase.from('teams').upsert(
        { id: t.team.id, name: t.team.name, logo_url: t.team.logo ?? null, league_id: league.id, updated_at: new Date().toISOString() },
        { onConflict: 'id' }
      )
    }
    log(`  ✅ ${teams.length}チーム保存`)
    await sleep(2000)
  }
}

// ── スカッド取得・選手紐付け ──────────────────────────────
async function runSyncSquads(log: (msg: string) => void) {
  log('👥 スカッド取得・選手紐付けバッチ開始')
  const { data: registeredPlayers } = await supabase.from('players').select('id, name, api_player_id, api_team_id')
  if (!registeredPlayers || registeredPlayers.length === 0) { log('⚠️ 選手が登録されていません'); return }

  const playerMap = new Map(registeredPlayers.map(p => [p.api_player_id, p]))
  log(`  登録済み選手: ${registeredPlayers.length}人`)

  const { data: teams } = await supabase.from('teams').select('id, name')
  if (!teams || teams.length === 0) { log('⚠️ チームがありません。先にチーム取得を実行してください'); return }

  // 全チームの has_japanese をリセット（今回のスカッドで再設定）
  await supabase.from('teams').update({ has_japanese: false }).neq('id', 0)

  log(`  全${teams.length}チームのスカッドを確認中...`)
  const foundPlayerIds = new Set<string>()
  let matched = 0

  for (const team of teams) {
    const res = await api.get('/players/squads', { params: { team: team.id } })

    const apiError = checkApiErrors(res.data)
    if (apiError) {
      log(`  ❌ [${team.name}] APIエラー: ${apiError}`)
      await sleep(2000)
      continue
    }

    const squads: any[] = res.data.response ?? []
    const squadPlayers: any[] = squads.flatMap((s: any) => s.players ?? [])
    const found = squadPlayers.filter((p: any) => playerMap.has(p.id))

    if (found.length > 0) {
      await supabase.from('teams').update({ has_japanese: true, updated_at: new Date().toISOString() }).eq('id', team.id)
      for (const p of found) {
        const registered = playerMap.get(p.id)!
        foundPlayerIds.add(registered.id)

        const isTransfer = registered.api_team_id !== null && registered.api_team_id !== team.id

        if (isTransfer) {
          log(`  🔄 移籍: ${registered.name} (チームID: ${registered.api_team_id} → ${team.id})`)
          // 旧チームの未確定試合から削除
          const { data: oldMatches } = await supabase
            .from('matches').select('id')
            .or(`home_team_id.eq.${registered.api_team_id},away_team_id.eq.${registered.api_team_id}`)
            .gte('date', new Date().toISOString()).eq('lineup_fetched', false)
          for (const m of oldMatches ?? []) {
            await supabase.from('match_players').delete()
              .eq('match_id', m.id).eq('player_id', registered.id)
          }
          // 新チームの将来試合に追加
          await addPlayerToUpcomingMatches(registered.id, team.id)
        } else if (registered.api_team_id === null) {
          await addPlayerToUpcomingMatches(registered.id, team.id)
        }

        await supabase.from('players').update({
          api_team_id: team.id, position: p.position ?? null,
          number: p.number ?? null, updated_at: new Date().toISOString(),
        }).eq('id', registered.id)
        log(`  ✓ 紐付け: ${registered.name} → ${team.name} (#${p.number} ${p.position})`)
        matched++
      }
    }
    await sleep(2000)
  }

  // どのスカッドにも見つからなかった選手は api_team_id = null
  for (const player of registeredPlayers) {
    if (!foundPlayerIds.has(player.id) && player.api_team_id !== null) {
      log(`  ⚠️ 未所属（移籍先不明）: ${player.name}`)
      await supabase.from('players').update({ api_team_id: null, updated_at: new Date().toISOString() }).eq('id', player.id)
    }
  }

  log(`  合計 ${matched}選手のチームを更新しました`)
}

async function addPlayerToUpcomingMatches(playerId: string, teamId: number) {
  const { data: upcomingMatches } = await supabase
    .from('matches').select('id')
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

// ── 試合スケジュール取得 ──────────────────────────────────
async function runSyncSchedule(log: (msg: string) => void) {
  log('📅 試合スケジュール取得開始')

  const { data: teams } = await supabase
    .from('teams')
    .select('id, name, league_id, leagues(current_season)')
    .eq('has_japanese', true)

  if (!teams || teams.length === 0) {
    log('⚠️ 日本人選手のいるチームがありません。スカッド取得を先に実行してください')
    return
  }

  const from = new Date().toISOString().split('T')[0]
  const to = new Date(Date.now() + 14 * 86400000).toISOString().split('T')[0]
  log(`  対象期間: ${from} 〜 ${to}`)
  log(`  対象チーム: ${teams.length}チーム`)

  let total = 0
  for (const team of teams) {
    const season = (team.leagues as any)?.current_season
    if (!season) {
      log(`  ⚠️ [${team.name}] シーズン未設定のためスキップ`)
      continue
    }

    const res = await api.get('/fixtures', { params: { team: team.id, season, from, to } })

    const apiError = checkApiErrors(res.data)
    if (apiError) {
      log(`  ❌ [${team.name}] APIエラー (season=${season}): ${apiError}`)
      await sleep(2000)
      continue
    }

    const fixtures: any[] = res.data.response ?? []
    if (fixtures.length === 0) {
      log(`  ⚠️ [${team.name}] 0試合 (season=${season} が現在のシーズンか確認してください)`)
      await sleep(2000)
      continue
    }

    // 日本人選手を api_team_id でインデックス化
    const { data: japanesePlayers } = await supabase
      .from('players').select('id, api_team_id').not('api_team_id', 'is', null)
    const playersByTeam = new Map<number, string[]>()
    for (const p of japanesePlayers ?? []) {
      if (!p.api_team_id) continue
      const list = playersByTeam.get(p.api_team_id) ?? []
      list.push(p.id)
      playersByTeam.set(p.api_team_id, list)
    }

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
      for (const teamId of [f.teams.home.id, f.teams.away.id]) {
        for (const playerId of playersByTeam.get(teamId) ?? []) {
          await supabase.from('match_players').upsert(
            { match_id: matchId, player_id: playerId, status: 'unknown', goals: 0, assists: 0 },
            { onConflict: 'match_id,player_id', ignoreDuplicates: true }
          )
        }
      }
    }
    log(`  ✅ [${team.name}] ${fixtures.length}試合保存`)
    total += fixtures.length
    await sleep(2000)
  }
  log(`  合計 ${total}試合をDBに保存しました`)
}

// ── スタメン取得（特定試合） ──────────────────────────────
async function runFetchLineup(log: (msg: string) => void, matchId: string, fixtureId: number) {
  log(`📋 スタメン取得: fixture ${fixtureId}`)

  const res = await api.get('/fixtures/lineups', { params: { fixture: fixtureId } })
  const lineups: any[] = res.data.response ?? []

  if (lineups.length === 0) {
    log('⚠️ スタメンがまだ発表されていません')
    return
  }

  const { data: players } = await supabase.from('players').select('id, name, api_player_id')
  if (!players) return
  const playerMap = new Map(players.map(p => [p.api_player_id, p]))

  let found = 0
  for (const lineup of lineups) {
    const starters = lineup.startXI.map((s: any) => s.player)
    const subs = lineup.substitutes.map((s: any) => s.player)

    for (const p of starters) {
      const player = playerMap.get(p.id)
      if (!player) continue
      await supabase.from('match_players').upsert(
        { match_id: matchId, player_id: player.id, status: 'starter', goals: 0, assists: 0 },
        { onConflict: 'match_id,player_id' }
      )
      log(`  ✓ スタメン: ${player.name} (${lineup.team.name})`)
      found++
    }
    for (const p of subs) {
      const player = playerMap.get(p.id)
      if (!player) continue
      await supabase.from('match_players').upsert(
        { match_id: matchId, player_id: player.id, status: 'bench', goals: 0, assists: 0 },
        { onConflict: 'match_id,player_id' }
      )
      log(`  ✓ ベンチ: ${player.name} (${lineup.team.name})`)
      found++
    }
  }

  // スタメン・ベンチに入らなかった選手を not_selected に更新
  await supabase
    .from('match_players')
    .update({ status: 'not_selected' })
    .eq('match_id', matchId)
    .eq('status', 'unknown')
  log('  ✓ ベンチ外の選手を更新しました')

  if (found === 0) log('  日本人選手はスタメン/ベンチにいませんでした（全員ベンチ外）')

  await supabase.from('matches').update({ lineup_fetched: true }).eq('id', matchId)
}

// ── 試合中イベント取得（特定試合） ────────────────────────
async function runFetchEvents(log: (msg: string) => void, matchId: string, fixtureId: number) {
  log(`⚡ 試合イベント取得: fixture ${fixtureId}`)

  // ステータス更新
  const fixtureRes = await api.get('/fixtures', { params: { id: fixtureId } })
  const fixture = fixtureRes.data.response?.[0]
  if (fixture) {
    const status = toMatchStatus(fixture.fixture.status.short)
    await supabase.from('matches').update({
      status,
      live_status: fixture.fixture.status.short,
      current_minute: fixture.fixture.status.elapsed,
      extra_minute: fixture.fixture.status.extra ?? null,
      home_score: fixture.goals.home,
      away_score: fixture.goals.away,
      updated_at: new Date().toISOString(),
    }).eq('id', matchId)
    log(`  ステータス: ${status} ${fixture.fixture.status.elapsed ? `(${fixture.fixture.status.elapsed}分)` : ''}`)
    log(`  スコア: ${fixture.goals.home} - ${fixture.goals.away}`)
  }

  // イベント取得
  const eventsRes = await api.get('/fixtures/events', { params: { fixture: fixtureId } })
  const events: any[] = eventsRes.data.response ?? []

  const { data: players } = await supabase.from('players').select('id, name, api_player_id')
  if (!players) return
  const playerMap = new Map(players.map(p => [p.api_player_id, p]))

  log(`  イベント数: ${events.length}件`)

  // 得点・アシストの分数を集計（全イベントから計算して上書き）
  const goalMinutes = new Map<string, number[]>()
  const assistMinutes = new Map<string, number[]>()

  for (const event of events) {
    if (event.type === 'Goal' && event.detail !== 'Own Goal') {
      const minute = event.time.elapsed ?? 0
      const scorer = playerMap.get(event.player?.id)
      if (scorer) goalMinutes.set(scorer.id, [...(goalMinutes.get(scorer.id) ?? []), minute])
      if (event.assist?.id) {
        const assister = playerMap.get(event.assist.id)
        if (assister) assistMinutes.set(assister.id, [...(assistMinutes.get(assister.id) ?? []), minute])
      }
    }
  }

  for (const [playerId, minutes] of goalMinutes) {
    await supabase.from('match_players').update({ goals: minutes.length, goal_minutes: minutes }).eq('match_id', matchId).eq('player_id', playerId)
  }
  for (const [playerId, minutes] of assistMinutes) {
    await supabase.from('match_players').update({ assists: minutes.length, assist_minutes: minutes }).eq('match_id', matchId).eq('player_id', playerId)
  }

  for (const event of events) {
    const player = playerMap.get(event.player?.id)

    if (event.type === 'Goal' && event.detail !== 'Own Goal') {
      if (player) log(`  ⚽ ゴール: ${player.name} (${event.time.elapsed}分)`)
      if (event.assist?.id) {
        const assister = playerMap.get(event.assist.id)
        if (assister) log(`  🅰️ アシスト: ${assister.name} (${event.time.elapsed}分)`)
      }
    }

    if (event.type === 'subst' && player) {
      await supabase.from('match_players').upsert(
        { match_id: matchId, player_id: player.id, status: 'starter', minute_in: event.time.elapsed },
        { onConflict: 'match_id,player_id' }
      )
      log(`  🔄 途中出場: ${player.name} (${event.time.elapsed}分)`)
      // 交代で出る選手のminute_out
      if (event.assist?.id) {
        const playerOff = playerMap.get(event.assist.id)
        if (playerOff) {
          await supabase.from('match_players').update({ minute_out: event.time.elapsed }).eq('match_id', matchId).eq('player_id', playerOff.id)
          log(`  ↩️ 交代退場: ${playerOff.name} (${event.time.elapsed}分)`)
        }
      }
    }
  }
}
