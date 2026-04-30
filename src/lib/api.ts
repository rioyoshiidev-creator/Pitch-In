import type { Match, FollowedPlayer, PlayerMatchStatus, MatchStatus } from '../types'

// ── デバイス登録 ─────────────────────────────────────────────

export async function registerDevice(pushToken: string): Promise<string> {
  const res = await fetch(`${BASE_URL}/devices`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ push_token: pushToken, platform: 'ios' }),
  })
  if (!res.ok) throw new Error(`device registration failed: ${res.status}`)
  const data = await res.json()
  return data.device_id as string
}

export async function syncFollowedPlayersToServer(
  deviceId: string,
  players: FollowedPlayer[]
): Promise<void> {
  const body = players.map((p) => ({
    player_id: p.id,
    notify_lineup: p.notifyLineup,
    notify_substitution: p.notifySubstitution,
    notify_goal: p.notifyGoal,
    notify_assist: p.notifyAssist,
  }))
  const res = await fetch(`${BASE_URL}/devices/${deviceId}/followed-players`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ players: body }),
  })
  if (!res.ok) throw new Error(`sync failed: ${res.status}`)
}

const BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000'

// ── DB レスポンス型 ──────────────────────────────────────────

interface DbPlayer {
  id: string
  name: string
  api_team_id: number | null
  position: string | null
  number: number | null
  sort_order: number
  teams?: { name: string; leagues?: { name: string } | null } | null
}

interface DbMatchPlayer {
  player_id: string
  status: string
  minute_in: number | null
  minute_out: number | null
  goals: number
  assists: number
  goal_minutes: number[]
  assist_minutes: number[]
  players: DbPlayer
}

interface DbMatch {
  id: string
  home_team_id: number
  away_team_id: number
  home_score: number | null
  away_score: number | null
  date: string
  status: string
  live_status: string | null
  current_minute: number | null
  extra_minute: number | null
  league: { id: number; name: string; sort_order: number } | null
  home_team: { id: number; name: string; logo_url: string | null } | null
  away_team: { id: number; name: string; logo_url: string | null } | null
  match_players: DbMatchPlayer[]
}

// ── 変換 ────────────────────────────────────────────────────

function transformMatch(raw: DbMatch): Match {
  const japanesePlayers = raw.match_players
    .filter((mp) => mp.players != null)
    .map((mp) => {
      const p = mp.players
      const teamName =
        p.api_team_id === raw.home_team_id
          ? (raw.home_team?.name ?? '')
          : (raw.away_team?.name ?? '')

      return {
        player: {
          id: p.id,
          name: p.name,
          team: teamName,
          league: raw.league?.name ?? '',
          position: p.position ?? '',
          number: p.number ?? 0,
        },
        status: mp.status as PlayerMatchStatus,
        minuteIn: mp.minute_in ?? undefined,
        minuteOut: mp.minute_out ?? undefined,
        goals: mp.goals,
        assists: mp.assists,
        goalMinutes: mp.goal_minutes ?? [],
        assistMinutes: mp.assist_minutes ?? [],
      }
    })

  return {
    id: raw.id,
    homeTeam: raw.home_team?.name ?? '−',
    awayTeam: raw.away_team?.name ?? '−',
    homeLogoUrl: raw.home_team?.logo_url ?? undefined,
    awayLogoUrl: raw.away_team?.logo_url ?? undefined,
    homeScore: raw.home_score ?? undefined,
    awayScore: raw.away_score ?? undefined,
    date: raw.date,
    league: raw.league?.name ?? '',
    leagueId: String(raw.league?.id ?? ''),
    leagueSortOrder: raw.league?.sort_order ?? 999,
    status: raw.status as MatchStatus,
    liveStatus: raw.live_status ?? undefined,
    currentMinute: raw.current_minute ?? undefined,
    extraMinute: raw.extra_minute ?? undefined,
    japanesePlayers,
  }
}

// ── API 関数 ─────────────────────────────────────────────────

export async function fetchMatches(deviceId?: string): Promise<{
  matches: Match[]
  followedPlayerIds: Set<string>
}> {
  const url = deviceId
    ? `${BASE_URL}/matches?device_id=${deviceId}`
    : `${BASE_URL}/matches`

  const res = await fetch(url)
  if (!res.ok) throw new Error(`matches fetch failed: ${res.status}`)

  const json = await res.json()
  const matches: Match[] = (json.matches as DbMatch[]).map(transformMatch)
  const followedPlayerIds = new Set<string>(json.followed_player_ids ?? [])

  return { matches, followedPlayerIds }
}

// ── アラーム同期 ─────────────────────────────────────────────

export async function fetchAlarmsFromServer(deviceId: string): Promise<import('../types').Alarm[]> {
  const res = await fetch(`${BASE_URL}/alarms?device_id=${encodeURIComponent(deviceId)}`)
  if (!res.ok) throw new Error(`alarm fetch failed: ${res.status}`)
  const data: any[] = await res.json()
  return data.map((a) => ({
    id: `alarm-${a.match_id}`,
    serverId: a.id,
    matchId: a.match_id,
    homeTeam: a.matches?.home_team?.name ?? '',
    awayTeam: a.matches?.away_team?.name ?? '',
    league: a.matches?.league?.name ?? '',
    matchDate: a.matches?.date ?? '',
    alarmTiming: a.alarm_timing,
    minutesBefore: a.minutes_before,
    notifySubstitution: a.notify_substitution,
    snooze: a.snooze ?? false,
    selectedPlayerIds: a.selected_player_ids ?? undefined,
  }))
}

export async function upsertAlarmOnServer(
  deviceId: string,
  alarm: import('../types').Alarm
): Promise<string> {
  const res = await fetch(`${BASE_URL}/alarms`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      device_id: deviceId,
      match_id: alarm.matchId,
      alarm_timing: alarm.alarmTiming,
      minutes_before: alarm.minutesBefore,
      notify_substitution: alarm.notifySubstitution,
      snooze: alarm.snooze,
      selected_player_ids: alarm.selectedPlayerIds ?? null,
    }),
  })
  if (!res.ok) throw new Error(`alarm upsert failed: ${res.status}`)
  const data = await res.json()
  return data.alarm_id as string
}

export async function deleteAlarmOnServer(serverId: string): Promise<void> {
  const res = await fetch(`${BASE_URL}/alarms/${serverId}`, { method: 'DELETE' })
  if (!res.ok) throw new Error(`alarm delete failed: ${res.status}`)
}

export async function fetchMinVersion(): Promise<string> {
  const res = await fetch(`${BASE_URL}/config`)
  if (!res.ok) return '0.0.0'
  const data = await res.json()
  return data.min_version as string
}

export async function fetchAllPlayers(query?: string): Promise<FollowedPlayer[]> {
  const url = query
    ? `${BASE_URL}/matches/players?q=${encodeURIComponent(query)}`
    : `${BASE_URL}/matches/players`

  const res = await fetch(url)
  if (!res.ok) throw new Error(`players fetch failed: ${res.status}`)

  const data: DbPlayer[] = await res.json()

  return data.map((p) => ({
    id: p.id,
    name: p.name,
    team: p.teams?.name ?? '',
    league: p.teams?.leagues?.name ?? '',
    position: p.position ?? '',
    number: p.number ?? 0,
    notifyLineup: true,
    notifySubstitution: true,
    notifyGoal: false,
    notifyAssist: false,
  }))
}
