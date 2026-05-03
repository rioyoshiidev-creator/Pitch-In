import { supabase } from '../services/supabase'
import { fetchLineups } from '../services/apiFootball'
import { sendPushNotifications, sendSilentPush } from '../services/expoPush'

// スタメン発表前1時間以内の試合を対象にポーリング
export async function pollLineups() {
  const now = new Date()
  const oneHourLater = new Date(now.getTime() + 60 * 60000)

  // スタメン未取得の予定試合（1時間以内にキックオフ）
  const { data: matches } = await supabase
    .from('matches')
    .select('id, api_fixture_id, home_team_id, away_team_id, date')
    .eq('status', 'scheduled')
    .eq('lineup_fetched', false)
    .lte('date', oneHourLater.toISOString())
    .gte('date', now.toISOString())

  if (!matches || matches.length === 0) return

  for (const match of matches) {
    try {
      await processLineup(match)
    } catch (err) {
      console.error(`[lineupPoller] fixture ${match.api_fixture_id} エラー:`, err)
    }
  }
}

async function processLineup(match: { id: string; api_fixture_id: number; home_team_id: number; away_team_id: number; date: string }) {
  const lineups = await fetchLineups(match.api_fixture_id)
  if (lineups.length === 0) return  // まだ発表されていない

  // 日本人選手を取得
  const { data: players } = await supabase
    .from('players')
    .select('id, name, api_player_id, api_team_id')

  if (!players) return

  const japaneseApiIds = new Map(players.map((p) => [p.api_player_id, p]))

  // match_playersを更新
  for (const lineup of lineups) {
    const starters = lineup.startXI.map((s) => s.player)
    const subs = lineup.substitutes.map((s) => s.player)

    for (const p of starters) {
      const player = japaneseApiIds.get(p.id)
      if (!player) continue
      await supabase.from('match_players').upsert(
        { match_id: match.id, player_id: player.id, status: 'starter', goals: 0, assists: 0 },
        { onConflict: 'match_id,player_id' }
      )
    }

    for (const p of subs) {
      const player = japaneseApiIds.get(p.id)
      if (!player) continue
      await supabase.from('match_players').upsert(
        { match_id: match.id, player_id: player.id, status: 'bench', goals: 0, assists: 0 },
        { onConflict: 'match_id,player_id' }
      )
    }
  }

  // スタメン・ベンチに入らなかった選手を not_selected に更新
  await supabase
    .from('match_players')
    .update({ status: 'not_selected' })
    .eq('match_id', match.id)
    .eq('status', 'unknown')

  // lineup_fetchedをtrueに更新
  await supabase.from('matches').update({ lineup_fetched: true }).eq('id', match.id)

  // 通知送信
  await sendLineupNotifications(match.id, match.date)
}

export async function sendLineupNotifications(matchId: string, matchDate: string) {
  const { data: matchPlayers } = await supabase
    .from('match_players')
    .select('player_id, status, players(name)')
    .eq('match_id', matchId)

  if (!matchPlayers) return

  // スタメン選手IDを収集してからまとめてアラーム発火
  const starterIds = new Set<string>()

  for (const mp of matchPlayers) {
    const playerName = (mp.players as unknown as { name: string }).name
    const isStarter = mp.status === 'starter'
    const isBench = mp.status === 'bench'

    const eventType = isStarter ? 'starter' : isBench ? 'bench' : 'not_called_up'

    // INSERT先行：失敗（unique制約違反）なら送信済みのためスキップ
    const { error: logError } = await supabase.from('notification_log').insert({
      match_id: matchId,
      player_id: mp.player_id,
      event_type: eventType,
    })
    if (logError) continue

    // フォロー中デバイスを取得（notify_lineup=trueのみ）
    const { data: followers } = await supabase
      .from('followed_players')
      .select('devices(push_token)')
      .eq('player_id', mp.player_id)
      .eq('notify_lineup', true)

    const tokens = (followers ?? [])
      .map((f) => (f.devices as unknown as { push_token: string } | null)?.push_token)
      .filter((t): t is string => !!t)

    if (tokens.length > 0) {
      await sendPushNotifications({ pushTokens: tokens, playerName, eventType, matchId })
    }

    if (isStarter) starterIds.add(mp.player_id)
  }

  // スタメンが1人でもいる場合にアラーム発火
  if (starterIds.size > 0) {
    await fireAlarms(matchId, matchDate, starterIds)
  }
}

async function fireAlarms(matchId: string, matchDate: string, starterIds: Set<string>) {
  const { data: alarms } = await supabase
    .from('alarms')
    .select('id, device_id, alarm_timing, minutes_before, snooze, selected_player_ids, devices(push_token)')
    .eq('match_id', matchId)
    .eq('is_enabled', true)

  for (const alarm of alarms ?? []) {
    const selectedIds = alarm.selected_player_ids as string[] | null

    let idsToCheck: string[] | null = selectedIds
    if (!idsToCheck) {
      const { data: fp } = await supabase
        .from('followed_players')
        .select('player_id')
        .eq('device_id', alarm.device_id)
      idsToCheck = (fp ?? []).map((f) => f.player_id)
    }

    if (idsToCheck && !idsToCheck.some((id) => starterIds.has(id))) continue

    const token = (alarm.devices as unknown as { push_token: string } | null)?.push_token
    if (!token) continue

    const fireAt = alarm.alarm_timing === 'lineup'
      ? new Date().toISOString()
      : new Date(new Date(matchDate).getTime() - alarm.minutes_before * 60000).toISOString()

    await sendSilentPush(token, { matchId, eventType: 'starter', alarmId: alarm.id, fireAt, snooze: alarm.snooze ?? false })

    // ベンチ選手アラームの二重発火防止
    await supabase.from('alarms').update({ sub_alarm_fired: true }).eq('id', alarm.id)
  }
}
