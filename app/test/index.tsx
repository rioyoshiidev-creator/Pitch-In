import React, { useState, useEffect, useCallback } from 'react'
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  SafeAreaView,
  Platform,
  TextInput,
} from 'react-native'
import * as Notifications from 'expo-notifications'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { AlarmService } from '../../src/alarm/AlarmService'
import { registerBackgroundAlarmTask } from '../../src/alarm/BackgroundTask'

const ONBOARDING_DONE_KEY = '@pitchin/onboarding_done'

const BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000'

type LogEntry = { time: string; message: string; isError?: boolean }

function useLog() {
  const [logs, setLogs] = useState<LogEntry[]>([])
  const addLog = useCallback((message: string, isError = false) => {
    const time = new Date().toLocaleTimeString('ja-JP')
    setLogs((prev) => [{ time, message, isError }, ...prev])
  }, [])
  const clearLog = useCallback(() => setLogs([]), [])
  return { logs, addLog, clearLog }
}

export default function TestScreen() {
  const { logs, addLog, clearLog } = useLog()
  const [pushToken, setPushToken] = useState<string>('')
  const [permStatus, setPermStatus] = useState<string>('未確認')
  const [scheduledCount, setScheduledCount] = useState<number>(0)

  // 共通入力
  const [playerName, setPlayerName] = useState('三笘薫')
  const [delaySeconds, setDelaySeconds] = useState('10')

  // DB連動入力
  const [matchId, setMatchId] = useState('')
  const [playerId, setPlayerId] = useState('')

  useEffect(() => {
    const receivedSub = Notifications.addNotificationReceivedListener((n) => {
      addLog(`[受信] ${n.request.content.title} — ${n.request.content.body}`)
    })
    const responseSub = Notifications.addNotificationResponseReceivedListener((r) => {
      addLog(`[タップ] ${r.notification.request.content.title}`)
    })
    return () => { receivedSub.remove(); responseSub.remove() }
  }, [addLog])

  useEffect(() => {
    Notifications.getPermissionsAsync().then(({ status }) => {
      setPermStatus(status)
      addLog(`通知権限: ${status}`)
    })
    registerBackgroundAlarmTask()
      .then(() => addLog('BackgroundTask 登録済み'))
      .catch((e) => addLog(`BackgroundTask 登録失敗: ${e}`, true))
    AlarmService.getPushToken()
      .then((token) => { setPushToken(token); addLog(`Push Token: ${token}`) })
      .catch((e) => addLog(`Push Token 取得失敗: ${e}`, true))
    refreshScheduledCount()
  }, [])

  const refreshScheduledCount = async () => {
    const list = await AlarmService.getScheduled()
    setScheduledCount(list.length)
  }

  const postToServer = async (path: string, body: object): Promise<object | null> => {
    const url = `${BASE_URL}${path}`
    addLog(`→ POST ${url}`)
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) { addLog(`サーバーエラー ${res.status}: ${JSON.stringify(data)}`, true); return null }
      return data
    } catch (e) {
      addLog(`接続失敗: ${e}`, true)
      return null
    }
  }

  // ① サイレントプッシュ経由アラーム
  const handleSilentPush = async (eventType: 'starter' | 'sub') => {
    if (!pushToken) { addLog('Push Token が未取得です', true); return }
    const delay = parseInt(delaySeconds, 10) || 5
    const data = await postToServer('/test/silent-push', {
      push_token: pushToken,
      event_type: eventType,
      player_name: playerName,
      delay_seconds: delay,
    })
    if (!data) return
    addLog(`送信完了 → ${delay}秒後 (${(data as any).fireAt})`)
    addLog('⚠️ 今すぐホームに戻ってください！')
  }

  // ② プッシュ通知
  const handlePush = async (eventType: string, label: string) => {
    if (!pushToken) { addLog('Push Token が未取得です', true); return }
    const data = await postToServer('/test/push', {
      push_token: pushToken,
      event_type: eventType,
      player_name: playerName,
    })
    if (!data) return
    addLog(`${label} 通知を送信しました`)
  }

  // ③ DB連動
  const handleForceAlarm = async () => {
    if (!matchId.trim()) { addLog('match_id を入力してください', true); return }
    const delay = parseInt(delaySeconds, 10) || 5
    const data = await postToServer('/test/force-alarm', {
      match_id: matchId.trim(),
      delay_seconds: delay,
    }) as any
    if (!data) return
    addLog(`発火完了: ${data.fired}件のアラームに送信 → ${delay}秒後`)
    if (data.fired === 0) addLog('⚠️ alarms テーブルに is_enabled=true のレコードがありません', true)
    else addLog('⚠️ 今すぐホームに戻ってください！')
  }

  const handleFireSubAlarm = async () => {
    if (!matchId.trim() || !playerId.trim()) { addLog('match_id と player_id を入力してください', true); return }
    const data = await postToServer('/test/fire-sub-alarm', {
      match_id: matchId.trim(),
      player_id: playerId.trim(),
    })
    if (data) addLog(`途中出場アラーム発火完了`)
  }

  // ④ 状態確認
  const handleShowScheduled = async () => {
    const list = await AlarmService.getScheduled()
    setScheduledCount(list.length)
    if (list.length === 0) { addLog('予約中のアラームはありません'); return }
    list.forEach((n, i) => {
      const trigger = n.trigger as any
      const fireDate = trigger?.value ? new Date(trigger.value * 1000).toLocaleString('ja-JP') : '不明'
      addLog(`[${i + 1}] ${n.content.title} — ${n.content.body} → ${fireDate}`)
    })
  }

  // ⑤ ローカルアラーム（参考）
  const handleLocalAlarm = async () => {
    const delay = parseInt(delaySeconds, 10) || 5
    try {
      await AlarmService.scheduleAlarm({
        title: 'ローカルテスト',
        body: `${playerName} — ローカルアラーム`,
        delaySeconds: delay,
      })
      await refreshScheduledCount()
      addLog(`[ローカル] ${delay}秒後に発火`)
    } catch (e) {
      addLog(`失敗: ${e}`, true)
    }
  }

  const handleCancelAll = async () => {
    await AlarmService.cancelAll()
    await refreshScheduledCount()
    addLog('全アラームキャンセル')
  }

  const handleResetOnboarding = async () => {
    await AsyncStorage.removeItem(ONBOARDING_DONE_KEY).catch(() => {})
    addLog('オンボーディングをリセットしました。アプリを再起動してください。')
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">

        <View style={styles.statusRow}>
          <Badge label={`権限: ${permStatus}`} ok={permStatus === 'granted'} />
          <Badge label={`予約中: ${scheduledCount}件`} ok={scheduledCount > 0} neutral />
          <Badge label={pushToken ? 'Token: 取得済み' : 'Token: 未取得'} ok={!!pushToken} />
        </View>

        {/* 共通設定 */}
        <Section title="共通設定">
          <Label>選手名</Label>
          <Input value={playerName} onChangeText={setPlayerName} placeholder="三笘薫" />
          <Label>遅延秒数（アラーム用）</Label>
          <Input value={delaySeconds} onChangeText={setDelaySeconds} placeholder="10" keyboardType="numeric" />
        </Section>

        {/* ① サイレントプッシュ経由アラーム */}
        <Section title="① アラーム（サイレントプッシュ経由）">
          <Text style={styles.hint}>
            サーバー → silent push → BackgroundTask → AlarmKit{'\n'}
            ボタンを押したらすぐホームに戻ること
          </Text>
          <Btn label="スタメン確定アラーム" onPress={() => handleSilentPush('starter')} color="#1565C0" />
          <Btn label="途中出場アラーム" onPress={() => handleSilentPush('sub')} color="#E65100" />
        </Section>

        {/* ② プッシュ通知 */}
        <Section title="② プッシュ通知のみ（アラームなし）">
          <Text style={styles.hint}>サーバー → Expo Push API → 通常プッシュ通知</Text>
          <View style={styles.grid}>
            <Btn label="先発" onPress={() => handlePush('starter', '先発')} color="#2E7D32" small />
            <Btn label="控え" onPress={() => handlePush('bench', '控え')} color="#558B2F" small />
            <Btn label="招集外" onPress={() => handlePush('not_called_up', '招集外')} color="#827717" small />
            <Btn label="途中出場" onPress={() => handlePush('substitution', '途中出場')} color="#6A1B9A" small />
            <Btn label="ゴール" onPress={() => handlePush('goal', 'ゴール')} color="#C62828" small />
            <Btn label="アシスト" onPress={() => handlePush('assist', 'アシスト')} color="#AD1457" small />
          </View>
        </Section>

        {/* ③ DB連動 */}
        <Section title="③ DB連動（実データ使用）">
          <Text style={styles.hint}>
            アプリでアラームを設定した試合の match_id を入力{'\n'}
            match_players・notification_log を無視して強制発火
          </Text>
          <Label>match_id</Label>
          <Input value={matchId} onChangeText={setMatchId} placeholder="fixture-xxxxxxxx" />
          <Btn label="スタメンアラーム強制発火" onPress={handleForceAlarm} color="#1565C0" />
          <Label>player_id（途中出場用）</Label>
          <Input value={playerId} onChangeText={setPlayerId} placeholder="mitoma" />
          <Btn label="途中出場アラーム発火（match_id + player_id）" onPress={handleFireSubAlarm} color="#E65100" />
        </Section>

        {/* ④ 状態確認 */}
        <Section title="④ 状態確認">
          <Btn label="予約中アラームをログに表示" onPress={handleShowScheduled} color="#00695C" />
        </Section>

        {/* ⑤ ローカル（参考） */}
        <Section title="⑤ ローカルアラーム（サーバー不要・参考）">
          <Text style={styles.hint}>AlarmKit を直接呼ぶ。本番フローとは異なる</Text>
          <Btn label="ローカルアラーム発火" onPress={handleLocalAlarm} color="#546E7A" />
        </Section>

        {/* リセット */}
        <Section title="リセット">
          <Btn label="全アラームをキャンセル" onPress={handleCancelAll} color="#757575" />
          <Btn label="オンボーディングをリセット（再起動で再表示）" onPress={handleResetOnboarding} color="#4A148C" />
          <Btn label="ログをクリア" onPress={clearLog} color="#9E9E9E" />
        </Section>

        {/* ログ */}
        <Section title="ログ">
          {logs.length === 0 ? (
            <Text style={styles.emptyLog}>まだログがありません</Text>
          ) : (
            logs.map((log, i) => (
              <Text key={i} style={[styles.logText, log.isError && styles.logError]}>
                {log.time}  {log.message}
              </Text>
            ))
          )}
        </Section>

      </ScrollView>
    </SafeAreaView>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  )
}

function Label({ children }: { children: React.ReactNode }) {
  return <Text style={styles.label}>{children}</Text>
}

function Input({ value, onChangeText, placeholder, keyboardType }: {
  value: string
  onChangeText: (v: string) => void
  placeholder?: string
  keyboardType?: 'default' | 'numeric'
}) {
  return (
    <TextInput
      style={styles.input}
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor="#546E7A"
      keyboardType={keyboardType ?? 'default'}
      autoCapitalize="none"
      autoCorrect={false}
    />
  )
}

function Btn({ label, onPress, color = '#2E7D32', small }: {
  label: string
  onPress: () => void
  color?: string
  small?: boolean
}) {
  return (
    <TouchableOpacity
      style={[styles.btn, { backgroundColor: color }, small && styles.btnSmall]}
      onPress={onPress}
    >
      <Text style={[styles.btnText, small && styles.btnTextSmall]}>{label}</Text>
    </TouchableOpacity>
  )
}

function Badge({ label, ok, neutral }: { label: string; ok: boolean; neutral?: boolean }) {
  const bg = neutral ? '#546E7A' : ok ? '#2E7D32' : '#B71C1C'
  return (
    <View style={[styles.badge, { backgroundColor: bg }]}>
      <Text style={styles.badgeText}>{label}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#121212' },
  container: { padding: 16, paddingBottom: 40 },
  statusRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12 },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  badgeText: { color: '#FFFFFF', fontSize: 11, fontWeight: '600' },

  section: { backgroundColor: '#1E1E1E', borderRadius: 10, padding: 14, marginBottom: 12 },
  sectionTitle: { color: '#B0BEC5', fontSize: 12, fontWeight: '700', marginBottom: 8, textTransform: 'uppercase' },

  label: { color: '#78909C', fontSize: 11, fontWeight: '600', marginBottom: 4, marginTop: 4 },
  input: {
    backgroundColor: '#2A2A2A', borderRadius: 8,
    paddingHorizontal: 12, paddingVertical: 10,
    color: '#FFFFFF', fontSize: 13,
    marginBottom: 8,
  },

  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  btn: { borderRadius: 8, paddingVertical: 12, paddingHorizontal: 16, marginBottom: 8, alignItems: 'center' },
  btnSmall: { paddingVertical: 9, paddingHorizontal: 12, marginBottom: 0 },
  btnText: { color: '#FFFFFF', fontWeight: '700', fontSize: 14 },
  btnTextSmall: { fontSize: 13 },

  hint: { color: '#78909C', fontSize: 11, marginBottom: 8, lineHeight: 16 },
  emptyLog: { color: '#546E7A', fontSize: 12, textAlign: 'center' },
  logText: { color: '#CFD8DC', fontSize: 11, lineHeight: 18, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
  logError: { color: '#EF9A9A' },
})
