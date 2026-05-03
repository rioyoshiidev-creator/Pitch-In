import React, { useState, useEffect, useRef } from 'react'
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Switch,
  Modal,
  Animated,
} from 'react-native'
import { router } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { Colors } from '../../src/constants/colors'
import { useAlarms } from '../../src/context/AlarmContext'
import { useFollowedPlayers } from '../../src/context/FollowedPlayersContext'
import { fetchMatches } from '../../src/lib/api'
import { formatMatchDate, formatMatchTime, formatAlarmTime, isMatchOver } from '../../src/utils/date'
import type { Alarm, AlarmTiming, Match } from '../../src/types'

type AlarmOption = { label: string; alarmTiming: AlarmTiming; minutesBefore: number }
const ALARM_OPTIONS: AlarmOption[] = [
  { label: '発表時', alarmTiming: 'lineup', minutesBefore: 0 },
  { label: '開始時', alarmTiming: 'before_kickoff', minutesBefore: 0 },
  { label: '5分前', alarmTiming: 'before_kickoff', minutesBefore: 5 },
  { label: '10分前', alarmTiming: 'before_kickoff', minutesBefore: 10 },
  { label: '15分前', alarmTiming: 'before_kickoff', minutesBefore: 15 },
  { label: '20分前', alarmTiming: 'before_kickoff', minutesBefore: 20 },
  { label: '25分前', alarmTiming: 'before_kickoff', minutesBefore: 25 },
  { label: '30分前', alarmTiming: 'before_kickoff', minutesBefore: 30 },
]

function isSameOption(opt: AlarmOption, timing: AlarmTiming, minutes: number) {
  return opt.alarmTiming === timing && opt.minutesBefore === minutes
}

function isOptionAvailable(opt: AlarmOption, matchDate: string): boolean {
  if (opt.alarmTiming === 'lineup') return true
  // 開始時: 元の試合時刻から3時間以内なら選択可能（遅延対応）
  if (opt.minutesBefore === 0) {
    return new Date(matchDate).getTime() + 3 * 60 * 60 * 1000 > Date.now()
  }
  const alarmTime = new Date(matchDate).getTime() - opt.minutesBefore * 60 * 1000
  return alarmTime > Date.now()
}

function firstAvailableOption(matchDate: string): AlarmOption {
  return ALARM_OPTIONS.find((o) => isOptionAvailable(o, matchDate)) ?? ALARM_OPTIONS[1]
}

function isAlarmLive(alarm: Alarm): boolean {
  const matchTime = new Date(alarm.matchDate).getTime()
  return matchTime <= Date.now() && !isMatchOver(alarm.matchDate)
}

function isAlarmEditable(alarm: Alarm, matches: Match[]): boolean {
  if (alarm.subOnly) return false
  const match = matches.find((m) => m.id === alarm.matchId)
  if (!match) return true
  const lineupAnnounced = match.japanesePlayers.some((p) => p.status !== 'unknown')
  if (!lineupAnnounced) return true
  const idsToCheck = alarm.selectedPlayerIds ?? alarm.playerIds ?? []
  if (idsToCheck.length === 0) return true
  return idsToCheck.some((id) => {
    const p = match.japanesePlayers.find((jp) => jp.player.id === id)
    return p?.status === 'bench'
  })
}

export default function AlarmsScreen() {
  const { alarms, toggleSnooze, deleteAlarm, addAlarm } = useAlarms()
  const [editTarget, setEditTarget] = useState<Alarm | null>(null)
  const [matches, setMatches] = useState<Match[]>([])
  const activeAlarms = alarms.filter((a) => !isMatchOver(a.matchDate))

  useEffect(() => {
    fetchMatches().then(({ matches }) => setMatches(matches)).catch(() => {})
  }, [])

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>アラーム</Text>
      </View>

      <ScrollView contentContainerStyle={styles.list}>
        {activeAlarms.length === 0 && (
          <View style={styles.emptyContainer}>
            <Ionicons name="alarm-outline" size={52} color={Colors.textDim} />
            <Text style={styles.emptyText}>アラームはありません</Text>
            <Text style={styles.emptyHint}>
              試合画面の「アラームを設定する」から設定できます
            </Text>
          </View>
        )}
        {activeAlarms.map((alarm) => (
          <AlarmCard
            key={alarm.id}
            alarm={alarm}
            canEdit={isAlarmEditable(alarm, matches)}
            onToggleSnooze={() => toggleSnooze(alarm.id)}
            onDelete={() => deleteAlarm(alarm.id)}
            onEdit={() => setEditTarget(alarm)}
          />
        ))}
      </ScrollView>

      {editTarget && (
        <AlarmEditModal
          alarm={editTarget}
          onClose={() => setEditTarget(null)}
          onSave={(updated) => {
            addAlarm(updated)
            setEditTarget(null)
          }}
          onDelete={() => {
            deleteAlarm(editTarget.id)
            setEditTarget(null)
          }}
        />
      )}
    </SafeAreaView>
  )
}

function AlarmCard({
  alarm,
  canEdit,
  onToggleSnooze,
  onDelete,
  onEdit,
}: {
  alarm: Alarm
  canEdit: boolean
  onToggleSnooze: () => void
  onDelete: () => void
  onEdit: () => void
}) {
  const { followedPlayers } = useFollowedPlayers()
  const matchTimeStr = formatMatchTime(alarm.matchDate)
  const matchDateStr = formatMatchDate(alarm.matchDate)
  const live = isAlarmLive(alarm)

  const isLineup = alarm.alarmTiming === 'lineup'
  const timeDisplay = isLineup
    ? 'スタメン発表時'
    : alarm.minutesBefore === 0
      ? matchTimeStr
      : formatAlarmTime(alarm.matchDate, alarm.minutesBefore)

  const timingLabel = isLineup
    ? 'スタメン発表時にアラーム'
    : alarm.minutesBefore === 0
      ? '試合開始時にアラーム'
      : `試合開始${alarm.minutesBefore}分前にアラーム`

  const targetIds = alarm.selectedPlayerIds ?? alarm.playerIds ?? []
  const playerNames = targetIds
    .map((id) => followedPlayers.find((p) => p.id === id)?.name)
    .filter((n): n is string => !!n)

  return (
    <View style={styles.card}>
      {/* 時刻 + 編集ボタン */}
      <View style={styles.cardTop}>
        <View style={styles.timeBlock}>
          {alarm.subOnly ? (
            <Text style={[styles.alarmTimeLineup, { color: Colors.text }]}>途中出場時にアラーム</Text>
          ) : (
            <>
              <Text style={[styles.alarmTime, isLineup && styles.alarmTimeLineup]}>
                {timeDisplay}
              </Text>
              <Text style={styles.alarmSub}>{timingLabel}</Text>
            </>
          )}
        </View>
        {canEdit && (
          <TouchableOpacity style={styles.editBtn} onPress={onEdit} activeOpacity={0.75}>
            <Ionicons name="pencil-outline" size={14} color={Colors.textSecondary} />
            <Text style={styles.editBtnText}>編集</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* 試合情報 */}
      <View style={styles.cardInfo}>
        <View style={styles.matchTitleRow}>
          <Text style={styles.matchTitle}>{alarm.homeTeam} vs {alarm.awayTeam}</Text>
          {live && (
            <View style={styles.liveBadge}>
              <Text style={styles.liveText}>LIVE</Text>
            </View>
          )}
        </View>
        <Text style={styles.matchMeta}>{matchDateStr} {matchTimeStr} · {alarm.league}</Text>
        {playerNames.length > 0 && (
          <Text style={styles.playerNames}>{playerNames.join('・')}</Text>
        )}
        {!alarm.subOnly && alarm.notifySubstitution && (
          <View style={styles.subBadge}>
            <Ionicons name="swap-horizontal" size={11} color={Colors.bench} />
            <Text style={styles.subBadgeText}>途中出場時もアラーム</Text>
          </View>
        )}
      </View>

      {/* 削除ボタン */}
      <TouchableOpacity style={styles.deleteBtn} onPress={onDelete} activeOpacity={0.75}>
        <Ionicons name="trash-outline" size={14} color={Colors.live} />
        <Text style={styles.deleteBtnText}>アラームを削除</Text>
      </TouchableOpacity>
    </View>
  )
}

function AlarmEditModal({
  alarm,
  onClose,
  onSave,
  onDelete,
}: {
  alarm: Alarm
  onClose: () => void
  onSave: (updated: Alarm) => void
  onDelete: () => void
}) {
  const live = isAlarmLive(alarm)
  const matchTimeStr = formatMatchTime(alarm.matchDate)

  const [selectedOption, setSelectedOption] = useState<AlarmOption>(
    ALARM_OPTIONS.find((o) => isSameOption(o, alarm.alarmTiming, alarm.minutesBefore)) ?? firstAvailableOption(alarm.matchDate)
  )
  const [notifySubstitution, setNotifySubstitution] = useState(alarm.notifySubstitution)
  const snooze = false

  const slideAnim = useRef(new Animated.Value(0)).current
  const fadeAnim = useRef(new Animated.Value(0)).current

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 200, useNativeDriver: true }),
      Animated.spring(slideAnim, { toValue: 1, useNativeDriver: true, bounciness: 0, speed: 20 }),
    ]).start()
  }, [])

  const animateClose = (callback: () => void) => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 0, duration: 180, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 220, useNativeDriver: true }),
    ]).start(() => callback())
  }

  const sheetTranslateY = slideAnim.interpolate({ inputRange: [0, 1], outputRange: [800, 0] })

  const previewTime =
    selectedOption.alarmTiming === 'lineup'
      ? 'スタメン発表時'
      : selectedOption.minutesBefore === 0
        ? `試合開始時 (${matchTimeStr})`
        : `${formatAlarmTime(alarm.matchDate, selectedOption.minutesBefore)} (${selectedOption.minutesBefore}分前)`

  const handleSave = () => {
    const updated = {
      ...alarm,
      alarmTiming: live ? 'before_kickoff' : selectedOption.alarmTiming,
      minutesBefore: live ? 0 : selectedOption.minutesBefore,
      notifySubstitution,
      snooze,
    }
    animateClose(() => onSave(updated as typeof alarm))
  }

  return (
    <Modal visible transparent animationType="none" onRequestClose={() => animateClose(onClose)}>
      <Animated.View style={[styles.modalOverlay, { opacity: fadeAnim }]}>
        <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={() => animateClose(onClose)} />
      </Animated.View>
      <Animated.View style={[styles.modalSheet, { transform: [{ translateY: sheetTranslateY }] }]}>
        <View style={styles.modalHandle} />

        <View style={styles.modalHeader}>
          <Text style={styles.modalTitle}>{alarm.homeTeam} vs {alarm.awayTeam}</Text>
          <Text style={styles.modalSubtitle}>{alarm.league} · 試合開始 {matchTimeStr}</Text>
        </View>

        {!live && (
          <>
            <Text style={styles.modalLabel}>アラームのタイミング</Text>
            <View style={styles.optionGrid}>
              {ALARM_OPTIONS.map((opt) => {
                const active = isSameOption(opt, selectedOption.alarmTiming, selectedOption.minutesBefore)
                const available = isOptionAvailable(opt, alarm.matchDate)
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

        {live && (
          <View style={styles.liveNotice}>
            <Ionicons name="information-circle" size={14} color={Colors.textSecondary} />
            <Text style={styles.liveNoticeText}>試合中のためベンチ選手の途中出場時のみアラームを設定できます</Text>
          </View>
        )}

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

        <View style={styles.alarmCaution}>
          <Ionicons name="warning-outline" size={13} color={Colors.textDim} />
          <View style={{ flex: 1 }}>
            <Text style={styles.alarmCautionText}>
              通信環境や端末の状態によってはアラームが鳴らない場合があります
            </Text>
            <TouchableOpacity onPress={() => animateClose(() => { onClose(); router.push('/alarm-help') })} activeOpacity={0.7}>
              <Text style={styles.alarmCautionLink}>詳しくはこちら →</Text>
            </TouchableOpacity>
          </View>
        </View>

        <TouchableOpacity style={styles.saveBtn} onPress={handleSave}>
          <Text style={styles.saveBtnText}>アラームを更新</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.modalDeleteBtn} onPress={() => animateClose(onDelete)}>
          <Text style={styles.modalDeleteBtnText}>アラームを削除</Text>
        </TouchableOpacity>
      </Animated.View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  header: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 4 },
  headerTitle: { fontSize: 28, fontWeight: '800', color: Colors.text },
  list: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 24 },
  emptyContainer: { alignItems: 'center', marginTop: 80, gap: 12 },
  emptyText: { fontSize: 16, color: Colors.textSecondary, fontWeight: '600' },
  emptyHint: { fontSize: 12, color: Colors.textDim, marginTop: 2, textAlign: 'center', lineHeight: 20 },

  card: { backgroundColor: Colors.surface, borderRadius: 12, marginBottom: 12, overflow: 'hidden' },

  cardTop: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingTop: 14, paddingBottom: 10, gap: 12 },
  timeBlock: { flex: 1 },
  alarmTime: { fontSize: 40, fontWeight: '200', color: Colors.text, letterSpacing: -1 },
  alarmTimeLineup: { fontSize: 22, fontWeight: '700', letterSpacing: 0, color: Colors.primary },
  alarmSub: { fontSize: 11, color: Colors.textSecondary, marginTop: 2 },

  editBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: Colors.surfaceHigh, borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 7,
  },
  editBtnText: { fontSize: 12, color: Colors.textSecondary, fontWeight: '600' },

  cardInfo: { paddingHorizontal: 14, paddingBottom: 12, gap: 3 },
  matchTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  matchTitle: { fontSize: 14, fontWeight: '700', color: Colors.text },
  liveBadge: {
    backgroundColor: Colors.liveBackground, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4,
  },
  liveText: { fontSize: 10, fontWeight: '800', color: Colors.live },
  matchMeta: { fontSize: 12, color: Colors.textSecondary },
  playerNames: { fontSize: 12, color: Colors.text, fontWeight: '600', marginTop: 2 },
  subBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6,
    alignSelf: 'flex-start', backgroundColor: 'rgba(255,152,0,0.12)',
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6,
  },
  subBadgeText: { fontSize: 11, color: Colors.bench, fontWeight: '600' },

  snoozeRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 14, paddingVertical: 10,
    backgroundColor: Colors.surfaceHigh,
  },
  snoozeLabel: { flex: 1, fontSize: 13, color: Colors.textSecondary },

  deleteBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 12,
    backgroundColor: 'rgba(244,67,54,0.08)',
    borderTopWidth: 1, borderTopColor: 'rgba(244,67,54,0.15)',
  },
  deleteBtnText: { fontSize: 13, color: Colors.live, fontWeight: '700' },

  // 編集モーダル
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)' },
  modalSheet: {
    backgroundColor: Colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 20, paddingBottom: 44,
  },
  modalHandle: { width: 36, height: 4, backgroundColor: Colors.border, borderRadius: 2, alignSelf: 'center', marginBottom: 20 },
  modalHeader: { marginBottom: 18, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: Colors.border },
  modalTitle: { fontSize: 18, fontWeight: '800', color: Colors.text },
  modalSubtitle: { fontSize: 12, color: Colors.textSecondary, marginTop: 3 },
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

  liveNotice: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 6,
    backgroundColor: Colors.surfaceHigh, borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 10, marginBottom: 12,
  },
  liveNoticeText: { flex: 1, fontSize: 12, color: Colors.textSecondary, lineHeight: 18 },

  switchRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 12, borderTopWidth: 1, borderTopColor: Colors.border,
  },
  switchLabelText: { flex: 1, fontSize: 14, color: Colors.text, fontWeight: '600' },
  switchHint: { fontSize: 11, color: Colors.textDim, marginTop: -6, marginBottom: 12, lineHeight: 16 },

  alarmCaution: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 6,
    marginTop: 12, marginBottom: 4,
  },
  alarmCautionText: { fontSize: 11, color: Colors.textDim, lineHeight: 16 },
  alarmCautionLink: { fontSize: 11, color: Colors.primary, marginTop: 2 },

  saveBtn: { backgroundColor: Colors.primary, borderRadius: 14, paddingVertical: 15, alignItems: 'center', marginBottom: 10, marginTop: 12 },
  saveBtnText: { fontSize: 16, fontWeight: '800', color: Colors.background },
  modalDeleteBtn: { alignItems: 'center', paddingVertical: 10 },
  modalDeleteBtnText: { fontSize: 14, color: Colors.live, fontWeight: '600' },
})
