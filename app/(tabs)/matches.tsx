import React, { useState, useEffect, useCallback, useRef } from 'react'
import { router } from 'expo-router'
import { Image } from 'expo-image'
import {
  View,
  Text,
  SectionList,
  StyleSheet,
  TouchableOpacity,
  Modal,
  Switch,
  ActivityIndicator,
  Linking,
  AppState,
  Animated,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import * as Notifications from 'expo-notifications'
import { Colors } from '../../src/constants/colors'
import { fetchMatches } from '../../src/lib/api'
import { formatMatchDate, formatMatchTime, formatAlarmTime, isToday } from '../../src/utils/date'
import { useAlarms } from '../../src/context/AlarmContext'
import { useFollowedPlayers } from '../../src/context/FollowedPlayersContext'
import type { Match, PlayerMatchInfo, Alarm } from '../../src/types'
import { ALARM_OPTIONS, isSameOption } from '../../src/constants/alarmOptions'
import type { AlarmOption } from '../../src/constants/alarmOptions'

type FollowTab = 'followed' | 'all'
type StatusTab = 'scheduled' | 'live' | 'finished'

function byLeagueThenTime(a: Match, b: Match): number {
  const lo = (a.leagueSortOrder ?? 999) - (b.leagueSortOrder ?? 999)
  if (lo !== 0) return lo
  const td = new Date(a.date).getTime() - new Date(b.date).getTime()
  if (td !== 0) return td
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0  // id で並び順を固定
}

function formatLiveMinute(minute?: number, liveStatus?: string, extra?: number): string {
  if (liveStatus === 'HT' || liveStatus === 'BT') return 'ハーフタイム'
  if (liveStatus === 'P') return 'PK戦'
  if (minute == null) return ''
  // extra フィールドがある場合はそちらを優先
  if (extra != null && extra > 0) {
    const base = (liveStatus === '2H' || liveStatus === 'ET') ? 90 : 45
    return `${base}+${extra}'`
  }
  // elapsed が基準値を超えている場合（APIによっては elapsed が増加する）
  if (liveStatus === '1H' && minute > 45) return `45+${minute - 45}'`
  if ((liveStatus === '2H' || liveStatus === 'ET') && minute > 90) return `90+${minute - 90}'`
  return `${minute}'`
}

function filterAndSort(matches: Match[], statusTab: StatusTab): Match[] {
  const now = Date.now()
  const TWO_WEEKS = 14 * 86400000
  const SEVEN_DAYS = 7 * 86400000

  if (statusTab === 'scheduled') {
    return matches
      .filter((m) => m.status === 'scheduled' || m.status === 'postponed')
      .filter((m) => new Date(m.date).getTime() <= now + TWO_WEEKS)
      .sort(byLeagueThenTime)
  }
  if (statusTab === 'live') {
    return matches
      .filter((m) => m.status === 'live')
      .sort(byLeagueThenTime)
  }
  return matches
    .filter((m) => m.status === 'finished')
    .filter((m) => new Date(m.date).getTime() >= now - SEVEN_DAYS)
    .sort(byLeagueThenTime)
}

function groupByLeague(matches: Match[]): { league: string; matches: Match[] }[] {
  const map = new Map<string, { order: number; matches: Match[] }>()
  for (const m of matches) {
    if (!map.has(m.league)) map.set(m.league, { order: m.leagueSortOrder ?? 999, matches: [] })
    map.get(m.league)!.matches.push(m)
  }
  return Array.from(map.entries())
    .map(([league, { order, matches }]) => ({ league, order, matches }))
    .sort((a, b) => a.order - b.order)
    .map(({ league, matches }) => ({ league, matches }))
}

function groupByDate(matches: Match[], descending: boolean): { label: string; matches: Match[] }[] {
  const map = new Map<string, Match[]>()
  for (const m of matches) {
    const key = formatMatchDate(m.date)
    const label = isToday(m.date) ? `今日 ${key}` : key
    if (!map.has(label)) map.set(label, [])
    map.get(label)!.push(m)
  }
  const result: { label: string; matches: Match[] }[] = []
  map.forEach((ms, label) => result.push({ label, matches: ms }))
  result.sort((a, b) => {
    const diff = new Date(a.matches[0].date).getTime() - new Date(b.matches[0].date).getTime()
    return descending ? -diff : diff
  })
  return result
}

export default function MatchesScreen() {
  const [followTab, setFollowTab] = useState<FollowTab>('followed')
  const [statusTab, setStatusTab] = useState<StatusTab>('scheduled')
  const [alarmTarget, setAlarmTarget] = useState<Match | null>(null)
  const [permissionDenied, setPermissionDenied] = useState(false)
  const [allMatches, setAllMatches] = useState<Match[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const { followedPlayers } = useFollowedPlayers()

  const handleAlarmPress = useCallback(async (match: Match) => {
    const { status } = await Notifications.getPermissionsAsync()
    if (status === 'granted') {
      setAlarmTarget(match)
      return
    }
    if (status === 'undetermined') {
      const { status: newStatus } = await Notifications.requestPermissionsAsync()
      if (newStatus === 'granted') {
        setAlarmTarget(match)
        return
      }
    }
    setPermissionDenied(true)
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const { matches } = await fetchMatches()
      setAllMatches(matches)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  const silentLoad = useCallback(async () => {
    try {
      const { matches } = await fetchMatches()
      setAllMatches(matches)
    } catch {}
  }, [])

  // 初回ロード
  useEffect(() => { load() }, [load])

  // 試合中 or キックオフ1時間前の試合がある場合にポーリング
  // - 試合中: 30秒ごと
  // - キックオフ1時間以内: 60秒ごと（スタメン発表を拾うため）
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  useEffect(() => {
    const now = Date.now()
    const ONE_HOUR = 60 * 60 * 1000
    const hasLive = allMatches.some((m) => m.status === 'live')
    const hasPreMatch = allMatches.some((m) => {
      if (m.status !== 'scheduled') return false
      const kickoff = new Date(m.date).getTime()
      return kickoff > now && kickoff - now <= ONE_HOUR
    })

    const interval = hasLive ? 30000 : hasPreMatch ? 60000 : null
    if (interval) {
      intervalRef.current = setInterval(silentLoad, interval)
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [allMatches, silentLoad])

  // フォアグラウンド復帰時に更新
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') silentLoad()
    })
    return () => sub.remove()
  }, [silentLoad])

  const followedIds = new Set(followedPlayers.map((p) => p.id))
  const displayMatches = followTab === 'followed'
    ? allMatches.filter((m) => m.japanesePlayers.some((p) => followedIds.has(p.player.id)))
    : allMatches

  const followedLiveCount = followTab === 'followed'
    ? allMatches.filter((m) => m.status === 'live' && m.japanesePlayers.some((p) => followedIds.has(p.player.id))).length
    : 0

  const STATUS_TABS: { key: StatusTab; label: string }[] = [
    { key: 'scheduled', label: '試合開始前' },
    { key: 'live', label: followedLiveCount > 0 ? `試合中 ${followedLiveCount}` : '試合中' },
    { key: 'finished', label: '試合終了' },
  ]

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>試合</Text>
      </View>

      {/* フォロー中 / 全選手 */}
      <View style={styles.toggleRow}>
        {(['followed', 'all'] as FollowTab[]).map((t) => (
          <TouchableOpacity
            key={t}
            style={[styles.toggleBtn, followTab === t && styles.toggleBtnActive]}
            onPress={() => setFollowTab(t)}
          >
            <Text style={[styles.toggleText, followTab === t && styles.toggleTextActive]}>
              {t === 'followed' ? 'フォロー中' : '全選手'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* 試合開始前 / 試合中 / 試合終了 */}
      <View style={styles.statusTabRow}>
        {STATUS_TABS.map((t) => (
          <TouchableOpacity
            key={t.key}
            style={[styles.statusTab, statusTab === t.key && styles.statusTabActive]}
            onPress={() => setStatusTab(t.key)}
          >
            <Text style={[styles.statusTabText, statusTab === t.key && styles.statusTabTextActive]}>
              {t.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <View style={styles.emptyWrap}>
          <ActivityIndicator color={Colors.primary} />
        </View>
      ) : error ? (
        <View style={styles.emptyWrap}>
          <Text style={styles.emptyText}>読み込みに失敗しました</Text>
          <TouchableOpacity onPress={load} style={styles.retryBtn}>
            <Text style={styles.retryText}>再試行</Text>
          </TouchableOpacity>
        </View>
      ) : (
        // タブごとに SectionList を常時レンダリングしてスクロール位置を保持
        (['scheduled', 'live', 'finished'] as StatusTab[]).map((tab) => {
          const tabMatches = filterAndSort(displayMatches, tab)
          const dateGroups = groupByDate(tabMatches, tab === 'finished')
          const sections = dateGroups.map(({ label, matches: dayMatches }) => ({
            title: label,
            data: groupByLeague(dayMatches),
          }))
          const EMPTY_LABELS: Record<StatusTab, string> = {
            scheduled: '今後2週間の試合はありません',
            live: '現在試合中の試合はありません',
            finished: '直近1週間に終了した試合はありません',
          }
          return (
            <SectionList
              key={tab}
              style={{ flex: 1, display: statusTab === tab ? 'flex' : 'none' }}
              contentContainerStyle={styles.list}
              sections={sections}
              keyExtractor={(item, index) => item.league + index}
              stickySectionHeadersEnabled
              renderSectionHeader={({ section }) => (
                <View style={styles.dateSectionHeader}>
                  <Text style={styles.dateSectionTitle}>{section.title}</Text>
                </View>
              )}
              renderItem={({ item }) => (
                <View style={styles.leagueGroup}>
                  <Text style={styles.leagueHeader}>{item.league}</Text>
                  {item.matches.map((match) => (
                    <MatchCard
                      key={match.id}
                      match={match}
                      onAlarmPress={handleAlarmPress}
                    />
                  ))}
                </View>
              )}
              ListEmptyComponent={
                <View style={styles.emptyWrap}>
                  <Text style={styles.emptyText}>{EMPTY_LABELS[tab]}</Text>
                </View>
              }
            />
          )
        })
      )}

      {alarmTarget && (
        <AlarmModal
          match={alarmTarget}
          onClose={() => setAlarmTarget(null)}
        />
      )}

      <Modal visible={permissionDenied} transparent animationType="fade" onRequestClose={() => setPermissionDenied(false)}>
        <View style={styles.permDeniedContainer}>
          <TouchableOpacity style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} activeOpacity={1} onPress={() => setPermissionDenied(false)} />
          <View style={styles.permDeniedBox}>
            <View style={styles.permDeniedIcon}>
              <Ionicons name="notifications-off" size={28} color={Colors.live} />
            </View>
            <Text style={styles.permDeniedTitle}>通知が許可されていません</Text>
            <Text style={styles.permDeniedBody}>
              アラームを使用するには、設定から通知を有効にしてください。
            </Text>
            <TouchableOpacity style={styles.permDeniedSettingsBtn} onPress={() => { Linking.openSettings(); setPermissionDenied(false) }}>
              <Ionicons name="settings-outline" size={14} color={Colors.background} />
              <Text style={styles.permDeniedSettingsText}>設定を開く</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.permDeniedCloseBtn} onPress={() => setPermissionDenied(false)}>
              <Text style={styles.permDeniedCloseText}>閉じる</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  )
}

const MatchCard = React.memo(function MatchCard({ match, onAlarmPress }: { match: Match; onAlarmPress: (match: Match) => void }) {
  const { getMatchAlarm } = useAlarms()
  const { isFollowed } = useFollowedPlayers()
  const isLive = match.status === 'live'
  const isFinished = match.status === 'finished'
  const isScheduled = match.status === 'scheduled'
  const isPostponed = match.status === 'postponed'
  const alarm = getMatchAlarm(match.id)

  const STATUS_ORDER: Record<string, number> = { starter: 0, bench: 1, not_selected: 2, unknown: 3 }
  const byStatus = (a: PlayerMatchInfo, b: PlayerMatchInfo) => {
    const statusDiff = (STATUS_ORDER[a.status] ?? 3) - (STATUS_ORDER[b.status] ?? 3)
    if (statusDiff !== 0) return statusDiff
    return (isFollowed(a.player.id) ? 0 : 1) - (isFollowed(b.player.id) ? 0 : 1)
  }

  const homePlayers = match.japanesePlayers.filter((p) => p.player.team === match.homeTeam).sort(byStatus)
  const awayPlayers = match.japanesePlayers.filter((p) => p.player.team === match.awayTeam).sort(byStatus)

  const hasFollowedPlayer = match.japanesePlayers.some((p) => isFollowed(p.player.id))
  const hasBenchInLive = isLive && match.japanesePlayers.some(
    (p) => isFollowed(p.player.id) && (p.status === 'bench' || p.status === 'unknown')
  )

  const alarmLabel = alarm
    ? alarm.alarmTiming === 'lineup'
      ? '発表時'
      : alarm.minutesBefore === 0
        ? '開始時'
        : `${alarm.minutesBefore}分前`
    : null

  return (
    <View style={styles.card}>
      <View style={styles.cardTop}>
        <View style={styles.leagueRow}>
          {isLive && (
            <View style={styles.liveBadge}>
              <Text style={styles.liveText}>
                LIVE {formatLiveMinute(match.currentMinute, match.liveStatus, match.extraMinute)}
              </Text>
            </View>
          )}
          {isFinished && <Text style={styles.finishedText}>終了</Text>}
          {isPostponed && <Text style={styles.postponedText}>延期</Text>}
          {(isScheduled || isPostponed) && (
            <Text style={[styles.timeText, isPostponed && styles.postponedText]}>
              {formatMatchTime(match.date)}
            </Text>
          )}
        </View>

        <View style={styles.scoreRow}>
          <View style={styles.teamSide}>
            {match.homeLogoUrl && (
              <Image source={{ uri: match.homeLogoUrl }} style={styles.teamLogo} contentFit="contain" />
            )}
            <Text style={styles.teamNameHome} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>
              {match.homeTeam}
            </Text>
          </View>
          <View style={styles.scoreCenterBox}>
            {(isLive || isFinished) ? (
              <Text style={styles.scoreText}>{match.homeScore} - {match.awayScore}</Text>
            ) : (
              <Text style={styles.vsText}>vs</Text>
            )}
          </View>
          <View style={styles.teamSideAway}>
            <Text style={styles.teamNameAway} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>
              {match.awayTeam}
            </Text>
            {match.awayLogoUrl && (
              <Image source={{ uri: match.awayLogoUrl }} style={styles.teamLogo} contentFit="contain" />
            )}
          </View>
        </View>
      </View>

      {/* 選手リスト: 常に2列+中央線 */}
      <View style={styles.playersRow}>
        <View style={styles.playersCol}>
          {homePlayers.map((info) => (
            <PlayerCell key={info.player.id} info={info} isLive={isLive} isFinished={isFinished} followed={isFollowed(info.player.id)} />
          ))}
        </View>
        <View style={styles.playersDivider} />
        <View style={styles.playersCol}>
          {awayPlayers.map((info) => (
            <PlayerCell key={info.player.id} info={info} isLive={isLive} isFinished={isFinished} followed={isFollowed(info.player.id)} />
          ))}
        </View>
      </View>

      {/* アラームボタン */}
      {((isScheduled && hasFollowedPlayer) || hasBenchInLive) && (() => {
        const hoursUntil = (new Date(match.date).getTime() - Date.now()) / 3600000
        const canSetAlarm = isLive || alarm || hoursUntil <= 24

        if (!canSetAlarm) {
          const availableAt = new Date(new Date(match.date).getTime() - 24 * 3600000)
          const month = availableAt.getMonth() + 1
          const day = availableAt.getDate()
          const hour = availableAt.getHours().toString().padStart(2, '0')
          const min = availableAt.getMinutes().toString().padStart(2, '0')
          return (
            <View style={[styles.alarmBar, styles.alarmBarLocked]}>
              <Ionicons name="alarm-outline" size={14} color={Colors.textDim} />
              <Text style={[styles.alarmBarText, styles.alarmBarTextLocked]}>
                {month}/{day} {hour}:{min} からアラームを設定できます
              </Text>
            </View>
          )
        }

        return (
          <TouchableOpacity
            style={[styles.alarmBar, alarm && styles.alarmBarSet]}
            onPress={() => onAlarmPress(match)}
            activeOpacity={0.75}
          >
            <Ionicons
              name={alarm ? 'alarm' : 'alarm-outline'}
              size={14}
              color={alarm ? Colors.background : Colors.textSecondary}
            />
            <Text style={[styles.alarmBarText, alarm && styles.alarmBarTextSet]}>
              {alarm
                ? isLive
                  ? 'アラーム設定済み（途中出場時）'
                  : `アラーム設定済み（${alarmLabel}）`
                : isLive
                  ? '途中出場アラームを設定する'
                  : 'アラームを設定する'}
            </Text>
            <Ionicons
              name="chevron-forward"
              size={12}
              color={alarm ? Colors.background : Colors.textDim}
            />
          </TouchableOpacity>
        )
      })()}
    </View>
  )
})

function PlayerCell({
  info,
  isLive,
  isFinished,
  followed,
}: {
  info: PlayerMatchInfo
  isLive: boolean
  isFinished: boolean
  followed: boolean
}) {
  const statusColor =
    info.status === 'starter' && info.minuteIn == null ? Colors.starter :
    info.status === 'bench' || info.minuteIn != null ? Colors.bench :
    info.status === 'not_selected' ? Colors.notSelected :
    Colors.textSecondary

  const statusLabel =
    info.status === 'starter' && info.minuteIn == null ? '先発' :
    info.status === 'bench' || info.minuteIn != null ? '控え' :
    info.status === 'not_selected' ? '招集外' :
    '不明'

  const hasSub = info.minuteIn != null || info.minuteOut != null
  const subColor = info.status === 'starter' && info.minuteIn == null ? Colors.starter : Colors.bench
  const subTimeText =
    info.minuteIn != null && info.minuteOut != null
      ? `${info.minuteIn}'〜${info.minuteOut}'`
      : info.minuteIn != null
        ? `${info.minuteIn}'〜`
        : `〜${info.minuteOut}'`

  const statsItems: string[] = []
  if (info.goalMinutes.length > 0) {
    statsItems.push(`ゴール ${info.goalMinutes.map(m => `${m}'`).join(' ')}`)
  }
  if (info.assistMinutes.length > 0) {
    statsItems.push(`アシスト ${info.assistMinutes.map(m => `${m}'`).join(' ')}`)
  }

  return (
    <View style={styles.playerCell}>
      <View style={styles.playerNameRow}>
        {followed
          ? <Ionicons name="star" size={9} color={statusColor} style={styles.statusIcon} />
          : <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
        }
        <Text style={styles.playerName}>{info.player.name}</Text>
        {hasSub ? (
          <Text style={[styles.statusLabel, { color: subColor }]}>
            {statusLabel}{' '}{subTimeText}
          </Text>
        ) : (isLive || isFinished || info.status !== 'unknown') && (
          <Text style={[styles.statusLabel, { color: statusColor }]}>{statusLabel}</Text>
        )}
      </View>
      {statsItems.map((s, i) => (
        <Text key={i} style={styles.statsText}>{s}</Text>
      ))}
    </View>
  )
}

function isOptionAvailable(opt: AlarmOption, matchDate: string, matchStatus?: string): boolean {
  if (opt.alarmTiming === 'lineup') return true
  // 開始時（minutesBefore=0）: 試合がまだ始まっていなければ遅延でも選択可能
  if (opt.minutesBefore === 0 && (matchStatus === 'scheduled' || matchStatus === 'postponed')) return true
  const alarmTime = new Date(matchDate).getTime() - opt.minutesBefore * 60 * 1000
  return alarmTime > Date.now()
}

function firstAvailableOption(matchDate: string, matchStatus?: string): AlarmOption {
  return ALARM_OPTIONS.find((o) => isOptionAvailable(o, matchDate, matchStatus)) ?? ALARM_OPTIONS[1]
}

function AlarmModal({ match, onClose }: { match: Match; onClose: () => void }) {
  const { addAlarm, getMatchAlarm, deleteAlarm, alarmDefault } = useAlarms()
  const { isFollowed } = useFollowedPlayers()
  const existing = getMatchAlarm(match.id)
  const isLive = match.status === 'live'

  const [selectedOption, setSelectedOption] = useState<AlarmOption>(() => {
    if (existing) {
      return ALARM_OPTIONS.find((o) => isSameOption(o, existing.alarmTiming, existing.minutesBefore))
        ?? firstAvailableOption(match.date, match.status)
    }
    const defOpt = ALARM_OPTIONS.find((o) => isSameOption(o, alarmDefault.alarmTiming, alarmDefault.minutesBefore))
    if (defOpt && isOptionAvailable(defOpt, match.date, match.status)) return defOpt
    return firstAvailableOption(match.date, match.status)
  })
  const [notifySubstitution, setNotifySubstitution] = useState(existing?.notifySubstitution ?? true)
  const snooze = false

  const followedPlayers = match.japanesePlayers.filter((p) => isFollowed(p.player.id))
  const followedPlayerIds = followedPlayers.map((p) => p.player.id)
  const [selectedPlayerIds, setSelectedPlayerIds] = useState<string[]>(
    existing?.selectedPlayerIds ?? followedPlayerIds
  )
  const togglePlayer = (id: string) => {
    if (followedPlayers.length <= 1) return
    setSelectedPlayerIds((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]
    )
  }

  const slideAnim = useRef(new Animated.Value(0)).current
  const fadeAnim = useRef(new Animated.Value(0)).current

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 200, useNativeDriver: true }),
      Animated.spring(slideAnim, { toValue: 1, useNativeDriver: true, bounciness: 0, speed: 20 }),
    ]).start()
  }, [])

  const handleClose = () => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 0, duration: 180, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 220, useNativeDriver: true }),
    ]).start(() => onClose())
  }

  const sheetTranslateY = slideAnim.interpolate({ inputRange: [0, 1], outputRange: [800, 0] })

  const matchTimeStr = formatMatchTime(match.date)
  const previewTime =
    selectedOption.alarmTiming === 'lineup'
      ? 'スタメン発表時'
      : selectedOption.minutesBefore === 0
        ? `試合開始時 (${matchTimeStr})`
        : `${formatAlarmTime(match.date, selectedOption.minutesBefore)} (${selectedOption.minutesBefore}分前)`

  const handleSave = () => {
    const alarm: Alarm = {
      id: existing?.id ?? `alarm-${match.id}`,
      matchId: match.id,
      homeTeam: match.homeTeam,
      awayTeam: match.awayTeam,
      league: match.league,
      matchDate: match.date,
      alarmTiming: isLive ? 'before_kickoff' : selectedOption.alarmTiming,
      minutesBefore: isLive ? 0 : selectedOption.minutesBefore,
      notifySubstitution: isLive ? true : notifySubstitution,
      snooze,
      playerIds: followedPlayerIds,
      selectedPlayerIds,
    }
    addAlarm(alarm)
    handleClose()
  }

  const handleDelete = () => {
    if (existing) deleteAlarm(existing.id)
    handleClose()
  }

  return (
    <Modal visible transparent animationType="none" onRequestClose={handleClose}>
      <Animated.View style={[styles.modalOverlay, { opacity: fadeAnim }]}>
        <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={handleClose} />
      </Animated.View>
      <Animated.View style={[styles.modalSheet, { transform: [{ translateY: sheetTranslateY }] }]}>
        <View style={styles.modalHandle} />

        <View style={styles.modalHeader}>
          <Text style={styles.modalTitle}>{match.homeTeam} vs {match.awayTeam}</Text>
          <Text style={styles.modalSubtitle}>{match.league} · 試合開始 {matchTimeStr}</Text>
        </View>

        <Text style={styles.modalLabel}>アラームをする選手</Text>
        <View style={styles.playerSelectGrid}>
          {followedPlayers.map((info) => {
            const active = selectedPlayerIds.includes(info.player.id)
            const disabled = followedPlayers.length <= 1
            return (
              <TouchableOpacity
                key={info.player.id}
                style={[styles.playerSelectChip, active && styles.playerSelectChipActive]}
                onPress={() => togglePlayer(info.player.id)}
                activeOpacity={disabled ? 1 : 0.75}
              >
                <Text style={[styles.playerSelectChipText, active && styles.playerSelectChipTextActive]}>
                  {info.player.name}
                </Text>
              </TouchableOpacity>
            )
          })}
        </View>

        {!isLive && (
          <>
            <Text style={styles.modalLabel}>先発時のアラームのタイミング</Text>
            <View style={styles.optionGrid}>
              {ALARM_OPTIONS.map((opt) => {
                const active = isSameOption(opt, selectedOption.alarmTiming, selectedOption.minutesBefore)
                const available = isOptionAvailable(opt, match.date, match.status)
                return (
                  <TouchableOpacity
                    key={opt.label}
                    style={[styles.optionBtn, active && styles.optionBtnActive, !available && styles.optionBtnDisabled]}
                    onPress={() => available && setSelectedOption(opt)}
                    activeOpacity={available ? 0.75 : 1}
                  >
                    <Text style={[styles.optionBtnText, active && styles.optionBtnTextActive, !available && styles.optionBtnTextDisabled]}>
                      {opt.label}
                    </Text>
                  </TouchableOpacity>
                )
              })}
            </View>
            <View style={styles.previewRow}>
              <Ionicons name="alarm" size={14} color={Colors.primary} />
              <Text style={styles.previewText}>{previewTime}</Text>
            </View>
          </>
        )}

        {isLive && (
          <View style={styles.liveNotice}>
            <Ionicons name="information-circle" size={14} color={Colors.textSecondary} />
            <Text style={styles.liveNoticeText}>試合中のためフォロー選手の途中出場時のアラームのみを設定できます</Text>
          </View>
        )}

        {!isLive && (
          <>
            <View style={styles.switchRow}>
              <Text style={styles.switchLabelText}>途中出場時もアラーム</Text>
              <Switch
                value={notifySubstitution}
                onValueChange={setNotifySubstitution}
                trackColor={{ false: Colors.border, true: Colors.primary }}
                thumbColor={Colors.text}
                ios_backgroundColor={Colors.border}
              />
            </View>
            <Text style={styles.switchHint}>控えの場合、途中出場時点でアラームが鳴ります</Text>
          </>
        )}

        <View style={styles.alarmCaution}>
          <Ionicons name="warning-outline" size={13} color={Colors.textDim} />
          <View style={{ flex: 1 }}>
            <Text style={styles.alarmCautionText}>
              通信環境や端末の状態によっては、アラームが鳴らなかったり時刻がずれる場合があります
            </Text>
            <TouchableOpacity onPress={() => { handleClose(); router.push('/alarm-help') }} activeOpacity={0.7}>
              <Text style={styles.alarmCautionLink}>詳しくはこちら →</Text>
            </TouchableOpacity>
          </View>
        </View>

        <TouchableOpacity style={styles.saveBtn} onPress={handleSave}>
          <Text style={styles.saveBtnText}>{existing ? 'アラームを更新' : 'アラームを設定'}</Text>
        </TouchableOpacity>

        {existing && (
          <TouchableOpacity style={styles.deleteBtn} onPress={handleDelete}>
            <Text style={styles.deleteBtnText}>アラームを削除</Text>
          </TouchableOpacity>
        )}
      </Animated.View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  header: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 4 },
  headerTitle: { fontSize: 28, fontWeight: '800', color: Colors.text },

  // フォロー切替
  toggleRow: {
    flexDirection: 'row', marginHorizontal: 16, marginTop: 12, marginBottom: 4,
    backgroundColor: Colors.surface, borderRadius: 10, padding: 3,
  },
  toggleBtn: { flex: 1, paddingVertical: 8, borderRadius: 8, alignItems: 'center' },
  toggleBtnActive: { backgroundColor: Colors.surfaceHigh },
  toggleText: { fontSize: 13, fontWeight: '600', color: Colors.textSecondary },
  toggleTextActive: { color: Colors.text },

  // ステータスタブ
  statusTabRow: {
    flexDirection: 'row', paddingHorizontal: 16, marginTop: 8, marginBottom: 4,
    gap: 4,
  },
  statusTab: {
    flex: 1, paddingVertical: 8, borderRadius: 8, alignItems: 'center',
    borderBottomWidth: 2, borderBottomColor: 'transparent',
  },
  statusTabActive: { borderBottomColor: Colors.primary },
  statusTabText: { fontSize: 12, fontWeight: '600', color: Colors.textSecondary },
  statusTabTextActive: { color: Colors.primary },

  list: { paddingHorizontal: 16, paddingBottom: 24 },
  dateSectionHeader: {
    backgroundColor: Colors.background,
    paddingTop: 16, paddingBottom: 6,
  },
  dateSectionTitle: {
    fontSize: 13, fontWeight: '800', color: Colors.text,
  },
  leagueGroup: { marginBottom: 4 },
  leagueHeader: {
    fontSize: 11, fontWeight: '700', color: Colors.textDim,
    marginTop: 4, marginBottom: 4,
  },

  emptyWrap: { flex: 1, paddingTop: 60, alignItems: 'center', gap: 12 },
  emptyText: { fontSize: 14, color: Colors.textDim, textAlign: 'center' },
  retryBtn: { backgroundColor: Colors.surfaceHigh, paddingHorizontal: 20, paddingVertical: 8, borderRadius: 8 },
  retryText: { fontSize: 13, color: Colors.textSecondary, fontWeight: '600' },

  card: { backgroundColor: Colors.surface, borderRadius: 12, marginBottom: 10, overflow: 'hidden' },
  cardTop: { padding: 12 },
  leagueRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8, gap: 8 },
  leagueText: { fontSize: 11, color: Colors.textSecondary, flex: 1 },
  liveBadge: { backgroundColor: Colors.liveBackground, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4 },
  liveText: { fontSize: 11, fontWeight: '800', color: Colors.live },
  finishedText: { fontSize: 11, color: Colors.textSecondary },
  postponedText: { fontSize: 11, fontWeight: '700', color: Colors.live },
  timeText: { fontSize: 13, fontWeight: '700', color: Colors.text },
  scoreRow: { flexDirection: 'row', alignItems: 'center' },
  teamSide: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 },
  teamSideAway: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 6 },
  teamLogo: { width: 24, height: 24, flexShrink: 0 },
  teamNameHome: { flex: 1, fontSize: 14, fontWeight: '800', color: Colors.text },
  teamNameAway: { flex: 1, fontSize: 14, fontWeight: '800', color: Colors.text, textAlign: 'right' },
  scoreCenterBox: { width: 72, alignItems: 'center', justifyContent: 'center' },
  scoreText: { fontSize: 20, fontWeight: '800', color: Colors.text, textAlign: 'center' },
  vsText: { fontSize: 13, color: Colors.textSecondary, textAlign: 'center' },

  playersRow: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: Colors.border },
  playersCol: { flex: 1, padding: 10, gap: 10 },
  playersDivider: { width: 1, backgroundColor: Colors.border },
  playerCell: { gap: 2 },
  playerNameRow: { flexDirection: 'row', alignItems: 'center', gap: 5, flexWrap: 'wrap' },
  statusDot: { width: 7, height: 7, borderRadius: 4, marginTop: 2, flexShrink: 0 },
  playerName: { fontSize: 13, fontWeight: '700', color: Colors.text },
  statusIcon: { marginTop: 2, flexShrink: 0 },
  statusLabel: { fontSize: 11, fontWeight: '700' },
  statsText: { fontSize: 11, color: Colors.textSecondary },
  minuteText: { fontSize: 10, color: Colors.textDim },

  alarmBar: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    borderTopWidth: 1, borderTopColor: Colors.border,
    paddingHorizontal: 14, paddingVertical: 10,
    backgroundColor: Colors.surfaceHigh,
  },
  alarmBarSet: { backgroundColor: Colors.primary },
  alarmBarLocked: { backgroundColor: 'transparent' },
  alarmBarText: { flex: 1, fontSize: 13, color: Colors.textSecondary, fontWeight: '600' },
  alarmBarTextLocked: { color: Colors.textDim },
  alarmBarTextSet: { color: Colors.background },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)' },
  modalSheet: {
    backgroundColor: Colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 20, paddingBottom: 44,
  },
  modalHandle: { width: 36, height: 4, backgroundColor: Colors.border, borderRadius: 2, alignSelf: 'center', marginBottom: 20 },
  modalHeader: { marginBottom: 18, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: Colors.border },
  modalTitle: { fontSize: 18, fontWeight: '800', color: Colors.text },
  modalSubtitle: { fontSize: 12, color: Colors.textSecondary, marginTop: 3 },
  modalPlayers: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 },
  modalPlayerChip: { backgroundColor: Colors.surfaceHigh, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  modalPlayerName: { fontSize: 12, color: Colors.text, fontWeight: '600' },
  modalLabel: { fontSize: 13, fontWeight: '700', color: Colors.text, marginBottom: 10 },

  optionGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  optionBtn: {
    paddingHorizontal: 14, paddingVertical: 9, borderRadius: 10,
    backgroundColor: Colors.surfaceHigh, borderWidth: 1.5, borderColor: Colors.border,
  },
  optionBtnActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  optionBtnDisabled: { opacity: 0.3 },
  optionBtnText: { fontSize: 13, color: Colors.textSecondary, fontWeight: '600' },
  optionBtnTextActive: { color: Colors.background },
  optionBtnTextDisabled: { color: Colors.textDim },

  previewRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: 'rgba(0,230,118,0.08)', borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 10, marginBottom: 12,
  },
  previewText: { fontSize: 14, fontWeight: '700', color: Colors.primary },

  behaviorBox: {
    backgroundColor: Colors.surfaceHigh, borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 10, marginBottom: 12, gap: 6,
  },
  behaviorRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  behaviorDot: { width: 7, height: 7, borderRadius: 4, flexShrink: 0 },
  behaviorLabel: { fontSize: 12, color: Colors.textSecondary, width: 46 },
  behaviorArrow: { fontSize: 12, color: Colors.textDim },
  behaviorValue: { fontSize: 12, fontWeight: '600', color: Colors.text },

  switchRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 12, borderTopWidth: 1, borderTopColor: Colors.border,
  },
  switchLabelText: { flex: 1, fontSize: 14, color: Colors.text, fontWeight: '600' },
  switchHint: { fontSize: 11, color: Colors.textDim, marginTop: -6, marginBottom: 12, lineHeight: 16 },

  playerSelectGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  playerSelectChip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, borderWidth: 1, borderColor: Colors.border, backgroundColor: 'transparent' },
  playerSelectChipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  playerSelectChipText: { fontSize: 13, color: Colors.textSecondary, fontWeight: '600' },
  playerSelectChipTextActive: { color: Colors.background },

  liveNotice: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 6,
    backgroundColor: Colors.surfaceHigh, borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 10, marginBottom: 12,
  },
  liveNoticeText: { flex: 1, fontSize: 12, color: Colors.textSecondary, lineHeight: 18 },

  alarmCaution: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 6,
    marginTop: 12, marginBottom: 4,
  },
  alarmCautionText: { fontSize: 11, color: Colors.textDim, lineHeight: 16 },
  alarmCautionLink: { fontSize: 11, color: Colors.primary, marginTop: 4 },

  saveBtn: { backgroundColor: Colors.primary, borderRadius: 14, paddingVertical: 15, alignItems: 'center', marginBottom: 10, marginTop: 12 },
  saveBtnText: { fontSize: 16, fontWeight: '800', color: Colors.background },
  deleteBtn: { alignItems: 'center', paddingVertical: 10 },
  deleteBtnText: { fontSize: 14, color: Colors.live, fontWeight: '600' },

  // 通知権限拒否モーダル
  permDeniedContainer: {
    flex: 1, justifyContent: 'center', alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.6)', paddingHorizontal: 32,
  },
  permDeniedBox: {
    width: '100%', backgroundColor: Colors.surface, borderRadius: 16,
    padding: 24, alignItems: 'center',
  },
  permDeniedIcon: {
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: 'rgba(244,67,54,0.12)',
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 16,
  },
  permDeniedTitle: { fontSize: 17, fontWeight: '800', color: Colors.text, marginBottom: 10, textAlign: 'center' },
  permDeniedBody: { fontSize: 13, color: Colors.textSecondary, lineHeight: 20, textAlign: 'center', marginBottom: 24 },
  permDeniedSettingsBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: Colors.primary, borderRadius: 12,
    paddingVertical: 13, paddingHorizontal: 24, marginBottom: 10, width: '100%', justifyContent: 'center',
  },
  permDeniedSettingsText: { fontSize: 14, fontWeight: '800', color: Colors.background },
  permDeniedCloseBtn: { paddingVertical: 10, width: '100%', alignItems: 'center' },
  permDeniedCloseText: { fontSize: 14, color: Colors.textSecondary, fontWeight: '600' },
})
