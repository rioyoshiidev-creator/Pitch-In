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
 * 元の試合時刻からの経過時間によって監視頻度を変える:
 *   0〜2時間:  毎回チェック（実質5分ごと）
 *   2〜8時間:  毎時0〜4分のみチェック（実質1時間ごと）
 *   8時間以降: スキップ → scheduleSync（日次）に委ねる
 */
export async function pollPostponed() {
  const now = new Date()
  const isHourlyWindow = now.getMinutes() < 5

  const { data: matches } = await supabase
    .from('matches')
    .select('id, api_fixture_id, date')
    .eq('status', 'postponed')

  if (!matches || matches.length === 0) return

  const targets = matches.filter((m) => {
    const elapsedMs = now.getTime() - new Date(m.date).getTime()
    if (elapsedMs < 0) return false                           // まだキックオフ前（通常はありえない）
    if (elapsedMs < 2 * 60 * 60 * 1000) return true          // 2時間以内: 毎回
    if (elapsedMs < 8 * 60 * 60 * 1000) return isHourlyWindow // 2〜8時間: 毎時0〜4分のみ
    return false                                              // 8時間超: スキップ
  })

  if (targets.length === 0) return

  for (const match of targets) {
    try {
      const fixture = await fetchFixture(match.api_fixture_id)
      if (!fixture) continue

      const newStatus = toMatchStatus(fixture.fixture.status.short)
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
