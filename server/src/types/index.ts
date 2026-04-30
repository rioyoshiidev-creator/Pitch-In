export type MatchStatus = 'scheduled' | 'live' | 'finished' | 'postponed'
export type PlayerMatchStatus = 'starter' | 'bench' | 'not_selected' | 'unknown'
export type AlarmTiming = 'before_kickoff' | 'lineup'

export interface Player {
  id: string
  name: string
  team: string
  league: string
  league_id: string
  position: string
  number: number
  api_player_id: number
  api_team_id: number
}

export interface Match {
  id: string
  home_team: string
  away_team: string
  home_team_id: number
  away_team_id: number
  home_score: number | null
  away_score: number | null
  date: string
  league: string
  league_id: string
  api_fixture_id: number
  status: MatchStatus
  current_minute: number | null
}

export interface MatchPlayer {
  match_id: string
  player_id: string
  status: PlayerMatchStatus
  minute_in: number | null
  minute_out: number | null
  goals: number
  assists: number
}

export interface Device {
  id: string
  push_token: string
  created_at: string
  updated_at: string
}

export interface FollowedPlayer {
  device_id: string
  player_id: string
  notify_lineup: boolean
  notify_substitution: boolean
  notify_goal: boolean
  notify_assist: boolean
}

export interface Alarm {
  id: string
  device_id: string
  match_id: string
  alarm_timing: AlarmTiming
  minutes_before: number
  notify_substitution: boolean
  is_enabled: boolean
  snooze: boolean
  selected_player_ids: string[] | null  // null=全員対象
  sub_alarm_fired: boolean              // 途中出場アラームが既に発火済みか
}

// API-Football レスポンス型
export interface ApiFootballFixture {
  fixture: {
    id: number
    date: string
    status: {
      short: string
      elapsed: number | null
      extra: number | null
    }
  }
  league: {
    id: number
    name: string
    country: string
  }
  teams: {
    home: { id: number; name: string }
    away: { id: number; name: string }
  }
  goals: {
    home: number | null
    away: number | null
  }
}

export interface ApiFootballLineup {
  team: { id: number; name: string }
  startXI: { player: { id: number; name: string; number: number; pos: string } }[]
  substitutes: { player: { id: number; name: string; number: number; pos: string } }[]
}

export interface ApiFootballEvent {
  time: { elapsed: number; extra: number | null }
  team: { id: number }
  player: { id: number; name: string }
  assist: { id: number | null; name: string | null }
  type: string
  detail: string
}
