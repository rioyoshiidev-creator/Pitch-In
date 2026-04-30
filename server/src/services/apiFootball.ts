import axios from 'axios'
import type { ApiFootballFixture, ApiFootballLineup, ApiFootballEvent } from '../types'

const client = axios.create({
  baseURL: 'https://v3.football.api-sports.io',
  headers: {
    'x-apisports-key': process.env.API_FOOTBALL_KEY!,
  },
})

// 対応リーグID (API-Football)
export const SUPPORTED_LEAGUES: Record<string, number> = {
  PL: 39,   // Premier League
  PD: 140,  // La Liga
  BL1: 78,  // Bundesliga
  FL1: 61,  // Ligue 1
  SA: 135,  // Serie A
  DED: 88,  // Eredivisie
  CL: 2,    // Champions League
}

export const CURRENT_SEASON = 2024

async function get<T>(path: string, params: Record<string, unknown>): Promise<T> {
  const res = await client.get(path, { params })
  return res.data.response as T
}

// 指定日の試合一覧を取得
export async function fetchFixturesByDate(date: string): Promise<ApiFootballFixture[]> {
  const results: ApiFootballFixture[] = []
  for (const leagueId of Object.values(SUPPORTED_LEAGUES)) {
    const fixtures = await get<ApiFootballFixture[]>('/fixtures', {
      league: leagueId,
      season: CURRENT_SEASON,
      date,
    })
    results.push(...fixtures)
  }
  return results
}

// 今後2週間の試合を取得（リーグ単位）
export async function fetchUpcomingFixtures(leagueId: number): Promise<ApiFootballFixture[]> {
  const from = new Date().toISOString().split('T')[0]
  const toDate = new Date(Date.now() + 14 * 86400000).toISOString().split('T')[0]
  return get<ApiFootballFixture[]>('/fixtures', {
    league: leagueId,
    season: CURRENT_SEASON,
    from,
    to: toDate,
  })
}

// スタメン取得
export async function fetchLineups(fixtureId: number): Promise<ApiFootballLineup[]> {
  return get<ApiFootballLineup[]>('/fixtures/lineups', { fixture: fixtureId })
}

// 試合イベント取得（得点・交代）
export async function fetchEvents(fixtureId: number): Promise<ApiFootballEvent[]> {
  return get<ApiFootballEvent[]>('/fixtures/events', { fixture: fixtureId })
}

// 試合の現在ステータス取得
export async function fetchFixture(fixtureId: number): Promise<ApiFootballFixture | null> {
  const res = await get<ApiFootballFixture[]>('/fixtures', { id: fixtureId })
  return res[0] ?? null
}

// 日本人選手の取得（チームスカッドからnationality=Japanで抽出）
export async function fetchJapanesePlayersByTeam(teamId: number, season: number) {
  const res = await client.get('/players/squads', { params: { team: teamId } })
  return res.data.response
}

// APIの残りクォータを確認
export async function checkQuota(): Promise<{ remaining: number; limit: number }> {
  const res = await client.get('/status')
  const sub = res.data.response?.subscription
  return {
    remaining: sub?.requests?.current ?? 0,
    limit: sub?.requests?.limit_day ?? 100,
  }
}
