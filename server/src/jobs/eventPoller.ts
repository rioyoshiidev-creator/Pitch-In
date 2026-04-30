import { supabase } from '../services/supabase'
import { fetchEvents, fetchFixture } from '../services/apiFootball'
import { sendPushNotifications, sendSilentPush } from '../services/expoPush'

// 試合中の得点・交代イベントをポーリング
export async function pollLiveEvents() {
  const now = new Date()
  const threeHoursAgo = new Date(now.getTime() - 3 * 60 * 60 * 1000)

  // status=live の試合 + キックオフ時刻を過ぎた scheduled 試合（遅延対応）
  const { data: matches } = await supabase
    .from('matches')
    .select('id, api_fixture_id, home_team_id, away_team_id, status')
    .or(`status.eq.live,and(status.eq.scheduled,date.lte.${now.toISOString()},date.gte.${threeHoursAgo.toISOString()})`)

  if (!matches || matches.length === 0) return

  for (const match of matches) {
    try {
      await processLiveMatch(match)
    } catch (err) {
      console.error(`[eventPoller] fixture ${match.api_fixture_id} エラー:`, err)
    }
  }
}

async function processLiveMatch(match: { id: string; api_fixture_id: number }) {
  // 試合ステータス更新
  const fixture = await fetchFixture(match.api_fixture_id)
  if (!fixture) return

  const status = toMatchStatus(fixture.fixture.status.short)
  await supabase.from('matches').update({
    status,
    live_status: fixture.fixture.status.short,
    current_minute: fixture.fixture.status.elapsed,
    extra_minute: fixture.fixture.status.extra ?? null,
    home_score: fixture.goals.home,
    away_score: fixture.goals.away,
    updated_at: new Date().toISOString(),
  }).eq('id', match.id)

  const events = await fetchEvents(match.api_fixture_id)
  const { data: players } = await supabase.from('players').select('id, name, api_player_id')
  if (!players) return

  const japaneseApiIds = new Map(players.map((p) => [p.api_player_id, p]))

  // 全イベントから得点・アシストの分数を集計（冪等: 毎回上書き）
  const goalMinutes = new Map<string, number[]>()
  const assistMinutes = new Map<string, number[]>()

  for (const event of events) {
    if (event.type === 'Goal' && event.detail !== 'Own Goal') {
      const minute = event.time.elapsed ?? 0
      const scorer = japaneseApiIds.get(event.player?.id)
      if (scorer) goalMinutes.set(scorer.id, [...(goalMinutes.get(scorer.id) ?? []), minute])

      if (event.assist?.id) {
        const assister = japaneseApiIds.get(event.assist.id)
        if (assister) assistMinutes.set(assister.id, [...(assistMinutes.get(assister.id) ?? []), minute])
      }
    }
  }

  for (const [playerId, minutes] of goalMinutes) {
    await supabase.from('match_players')
      .update({ goals: minutes.length, goal_minutes: minutes })
      .eq('match_id', match.id)
      .eq('player_id', playerId)
  }
  for (const [playerId, minutes] of assistMinutes) {
    await supabase.from('match_players')
      .update({ assists: minutes.length, assist_minutes: minutes })
      .eq('match_id', match.id)
      .eq('player_id', playerId)
  }

  // 通知 & 交代処理
  for (const event of events) {
    const player = japaneseApiIds.get(event.player?.id)

    if (event.type === 'Goal' && event.detail !== 'Own Goal') {
      if (player) await notifyIfNew(match.id, player.id, 'goal', player.name)
      if (event.assist?.id) {
        const assister = japaneseApiIds.get(event.assist.id)
        if (assister) await notifyIfNew(match.id, assister.id, 'assist', assister.name)
      }
    }

    if (event.type === 'subst') {
      // 交代で入る選手
      if (player) {
        await notifyIfNew(match.id, player.id, 'substitution', player.name)
        await supabase.from('match_players').upsert(
          { match_id: match.id, player_id: player.id, status: 'starter', minute_in: event.time.elapsed },
          { onConflict: 'match_id,player_id' }
        )
        await fireBenchAlarms(match.id, player.id)
      }
      // 交代で出る選手: minute_out をセット
      if (event.assist?.id) {
        const playerOff = japaneseApiIds.get(event.assist.id)
        if (playerOff) {
          await supabase.from('match_players')
            .update({ minute_out: event.time.elapsed })
            .eq('match_id', match.id)
            .eq('player_id', playerOff.id)
        }
      }
    }
  }

  if (status === 'finished') {
    console.log(`[eventPoller] ${match.id} 試合終了`)
  }
}

async function notifyIfNew(matchId: string, playerId: string, eventType: 'goal' | 'substitution' | 'assist', playerName: string) {
  const { data: logged } = await supabase
    .from('notification_log')
    .select('id')
    .eq('match_id', matchId)
    .eq('player_id', playerId)
    .eq('event_type', eventType)
    .single()

  if (logged) return

  const notifyField = eventType === 'goal' ? 'notify_goal'
    : eventType === 'assist' ? 'notify_assist'
    : 'notify_substitution'

  const { data: followers } = await supabase
    .from('followed_players')
    .select('devices(push_token)')
    .eq('player_id', playerId)
    .eq(notifyField, true)

  const tokens = (followers ?? [])
    .map((f) => (f.devices as unknown as { push_token: string } | null)?.push_token)
    .filter((t): t is string => !!t)

  if (tokens.length > 0) {
    await sendPushNotifications({ pushTokens: tokens, playerName, eventType, matchId })
  }

  await supabase.from('notification_log').insert({ match_id: matchId, player_id: playerId, event_type: eventType })
}

export async function fireBenchAlarms(matchId: string, playerId: string) {
  const { data: alarms } = await supabase
    .from('alarms')
    .select('*, devices(push_token)')
    .eq('match_id', matchId)
    .eq('is_enabled', true)
    .eq('notify_substitution', true)
    .eq('sub_alarm_fired', false)  // 既に発火済みのアラームはスキップ

  for (const alarm of alarms ?? []) {
    const selectedIds = alarm.selected_player_ids as string[] | null

    if (selectedIds) {
      // 選手選択が設定されている場合：交代選手が選択リストに含まれているかチェック
      if (!selectedIds.includes(playerId)) continue
    } else {
      // 選択なし（全員）：従来通りフォロー中かチェック
      const { data: followed } = await supabase
        .from('followed_players')
        .select('player_id')
        .eq('device_id', alarm.device_id)
        .eq('player_id', playerId)
        .single()
      if (!followed) continue
    }

    const token = (alarm.devices as unknown as { push_token: string } | null)?.push_token
    if (!token) continue

    await sendSilentPush(token, { matchId, eventType: 'sub', playerId, alarmId: alarm.id, snooze: alarm.snooze ?? false })

    // 最初の1人だけで発火済みとしてマーク（他の選択選手が出ても再発火しない）
    await supabase.from('alarms').update({ sub_alarm_fired: true }).eq('id', alarm.id)
  }
}

function toMatchStatus(short: string): string {
  if (['1H', '2H', 'ET', 'P', 'HT'].includes(short)) return 'live'
  if (['FT', 'AET', 'PEN'].includes(short)) return 'finished'
  if (['PST', 'CANC', 'ABD'].includes(short)) return 'postponed'
  return 'scheduled'
}
