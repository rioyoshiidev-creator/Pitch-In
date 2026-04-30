export type MatchStatus = 'scheduled' | 'live' | 'finished' | 'postponed'
export type PlayerMatchStatus = 'starter' | 'bench' | 'not_selected' | 'unknown'
export type AlarmTiming = 'before_kickoff' | 'lineup'

export interface Player {
  id: string
  name: string
  team: string
  league: string
  position: string
  number: number
  photo?: string
}

export interface FollowedPlayer extends Player {
  notifyLineup: boolean       // スタメン発表時
  notifySubstitution: boolean // 途中出場時
  notifyGoal: boolean         // 得点時
  notifyAssist: boolean       // アシスト時
}

export interface PlayerMatchInfo {
  player: Player
  status: PlayerMatchStatus
  minuteIn?: number
  minuteOut?: number
  goals: number
  assists: number
  goalMinutes: number[]
  assistMinutes: number[]
}

export interface Match {
  id: string
  homeTeam: string
  awayTeam: string
  homeLogoUrl?: string
  awayLogoUrl?: string
  homeScore?: number
  awayScore?: number
  date: string
  league: string
  leagueId: string
  leagueSortOrder?: number
  status: MatchStatus
  liveStatus?: string
  currentMinute?: number
  extraMinute?: number
  japanesePlayers: PlayerMatchInfo[]
}

// 試合単位のアラーム（選手単位ではなく試合ごとに1つ）
export interface Alarm {
  id: string
  matchId: string
  homeTeam: string
  awayTeam: string
  league: string
  matchDate: string
  alarmTiming: AlarmTiming
  minutesBefore: number         // alarmTiming === 'lineup' のとき無視
  notifySubstitution: boolean   // ベンチ選手が途中出場したときも通知するか
  snooze: boolean
  playerIds?: string[]          // この試合の日本人選手ID一覧（フォロー解除時の削除判定に使用）
  selectedPlayerIds?: string[]  // アラーム対象として選択した選手ID（未設定=全員）
  serverId?: string             // Supabase上のアラームUUID（サーバー同期後に設定）
}
