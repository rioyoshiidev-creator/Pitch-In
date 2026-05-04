import { supabase } from '../services/supabase'
import { fetchFixture } from '../services/apiFootball'

function toMatchStatus(short: string): string {
  if (['1H', '2H', 'ET', 'P', 'HT'].includes(short)) return 'live'
  if (['FT', 'AET', 'PEN'].includes(short)) return 'finished'
  if (['PST', 'CANC', 'ABD'].includes(short)) return 'postponed'
  return 'scheduled'
}

/**
 * 延期試合の再スケジュール監視（5分ごとに呼ばれる）
 *
 * 元の試合時刻から2時間以内: 高頻度（5分ごと）でAPIチェック
 * 2時間を過ぎたもの: scheduleSync（日次）に任せてここではスキップ
 */
export async function pollPostponed() {
  const now = new Date()
  const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000)

  const { data: matches } = await supabase
    .from('matches')
    .select('id, api_fixture_id, date')
    .eq('status', 'postponed')

  if (!matches || matches.length === 0) return

  // 元の試合時刻から2時間以内のものだけチェック
  const recentMatches = matches.filter((m) => new Date(m.date) >= twoHoursAgo)
  if (recentMatches.length === 0) return

  for (const match of recentMatches) {
    try {
      const fixture = await fetchFixture(match.api_fixture_id)
      if (!fixture) continue

      const newStatus = toMatchStatus(fixture.fixture.status.short)

      // まだ延期状態なら何もしない
      if (newStatus === 'postponed') continue

      await supabase.from('matches').update({
        status: newStatus,
        live_status: fixture.fixture.status.short,
        date: fixture.fixture.date,
        current_minute: fixture.fixture.status.elapsed,
        home_score: fixture.goals.home ?? null,
        away_score: fixture.goals.away ?? null,
        ...(newStatus === 'scheduled' ? { lineup_fetched: false } : {}),
        updated_at: new Date().toISOString(),
      }).eq('id', match.id)

      console.log(`[postponedPoller] ${match.id}: postponed → ${newStatus} (${fixture.fixture.date})`)
    } catch (err) {
      console.error(`[postponedPoller] fixture ${match.api_fixture_id} エラー:`, err)
    }
  }
}
