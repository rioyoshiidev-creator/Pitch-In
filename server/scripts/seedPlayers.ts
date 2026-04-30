/**
 * 日本人選手を API-Football から取得して DB に投入する
 * 実行: npx ts-node scripts/seedPlayers.ts
 *
 * 戦略: 日本人選手が所属する既知チームのスカッドを取得 → nationality=Japan で抽出
 * APIコール数: チーム数と同じ（現在 ~10回）
 */
import 'dotenv/config'
import axios from 'axios'
import { createClient } from '@supabase/supabase-js'

const SEASON = 2024

// 日本人選手が所属する既知チーム（チームID: リーグID）
const JAPANESE_TEAMS: { teamId: number; leagueId: number; leagueName: string; teamName: string }[] = [
  { teamId: 51,  leagueId: 39,  leagueName: 'Premier League',       teamName: 'Brighton' },
  { teamId: 40,  leagueId: 39,  leagueName: 'Premier League',       teamName: 'Liverpool' },
  { teamId: 42,  leagueId: 39,  leagueName: 'Premier League',       teamName: 'Arsenal' },
  { teamId: 92,  leagueId: 140, leagueName: 'La Liga',              teamName: 'Real Sociedad' },
  { teamId: 160, leagueId: 78,  leagueName: 'Bundesliga',           teamName: 'Freiburg' },
  { teamId: 168, leagueId: 78,  leagueName: 'Bundesliga',           teamName: 'Bayer Leverkusen' },
  { teamId: 85,  leagueId: 61,  leagueName: 'Ligue 1',              teamName: 'PSG' },
  { teamId: 94,  leagueId: 61,  leagueName: 'Ligue 1',              teamName: 'Stade Reims' },
  { teamId: 41,  leagueId: 88,  leagueName: 'Eredivisie',           teamName: 'Feyenoord' },
  { teamId: 25,  leagueId: 39,  leagueName: 'Premier League',       teamName: 'Crystal Palace' },
]

const api = axios.create({
  baseURL: 'https://v3.football.api-sports.io',
  headers: { 'x-apisports-key': process.env.API_FOOTBALL_KEY! },
})

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function main() {
  console.log('=== 日本人選手シード開始 ===\n')

  // 残りクォータ確認
  const statusRes = await api.get('/status')
  const requests = statusRes.data.response?.requests
  console.log(`API クォータ: ${requests?.current}/${requests?.limit_day} 使用済み`)
  console.log(`残り: ${requests?.limit_day - requests?.current} リクエスト\n`)

  let inserted = 0
  let skipped = 0

  for (const team of JAPANESE_TEAMS) {
    console.log(`[${team.teamName}] スカッド取得中...`)

    const res = await api.get('/players/squads', { params: { team: team.teamId } })
    const squads: any[] = res.data.response ?? []

    const players: any[] = squads.flatMap((s: any) => s.players ?? [])
    const japanese = players.filter((p: any) => p.nationality === 'Japan')

    if (japanese.length === 0) {
      console.log(`  → 日本人選手なし（チームIDが古い可能性あり）`)
      skipped++
      await sleep(600)
      continue
    }

    for (const p of japanese) {
      const row = {
        id: `player-${p.id}`,
        name: p.name,
        team: team.teamName,
        league: team.leagueName,
        league_id: String(team.leagueId),
        position: p.position ?? 'Unknown',
        number: p.number ?? 0,
        api_player_id: p.id,
        api_team_id: team.teamId,
        updated_at: new Date().toISOString(),
      }

      const { error } = await supabase
        .from('players')
        .upsert(row, { onConflict: 'api_player_id' })

      if (error) {
        console.error(`  ✗ ${p.name}: ${error.message}`)
        skipped++
      } else {
        console.log(`  ✓ ${p.name} (${p.position} #${p.number})`)
        inserted++
      }
    }

    await sleep(600)
  }

  console.log(`\n=== 完了: ${inserted}件挿入, ${skipped}件スキップ ===`)

  // 最終クォータ確認
  const finalStatus = await api.get('/status')
  const finalReq = finalStatus.data.response?.requests
  console.log(`API 使用: ${finalReq?.current}/${finalReq?.limit_day}`)
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

main().catch((e) => {
  console.error('エラー:', e.message)
  process.exit(1)
})
