import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  SafeAreaView,
  Platform,
} from 'react-native';
import * as Notifications from 'expo-notifications';
import { AlarmService } from './src/alarm/AlarmService';
import { registerBackgroundAlarmTask } from './src/alarm/BackgroundTask';

// ───────────────────────────────────────────────
// ログ
// ───────────────────────────────────────────────
type LogEntry = { time: string; message: string; isError?: boolean };

function useLog() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const addLog = useCallback((message: string, isError = false) => {
    const time = new Date().toLocaleTimeString('ja-JP');
    setLogs((prev) => [{ time, message, isError }, ...prev]);
  }, []);
  const clearLog = useCallback(() => setLogs([]), []);
  return { logs, addLog, clearLog };
}

// ───────────────────────────────────────────────
// メイン
// ───────────────────────────────────────────────
export default function App() {
  const { logs, addLog, clearLog } = useLog();
  const [pushToken, setPushToken] = useState<string>('');
  const [permStatus, setPermStatus] = useState<string>('未確認');
  const [canBypassDnD, setCanBypassDnD] = useState<boolean>(false);
  const [scheduledCount, setScheduledCount] = useState<number>(0);

  // 通知の受信・タップを監視
  useEffect(() => {
    const receivedSub = Notifications.addNotificationReceivedListener((n) => {
      addLog(`[受信] ${n.request.content.title} — ${n.request.content.body}`);
    });
    const responseSub = Notifications.addNotificationResponseReceivedListener((r) => {
      addLog(`[タップ] ${r.notification.request.content.title}`);
    });
    return () => {
      receivedSub.remove();
      responseSub.remove();
    };
  }, [addLog]);

  // バックグラウンドタスクを登録
  useEffect(() => {
    registerBackgroundAlarmTask()
      .then(() => addLog('バックグラウンドタスク登録済み'))
      .catch((e) => addLog(`タスク登録失敗: ${e}`, true));
  }, [addLog]);

  const refreshScheduledCount = async () => {
    const list = await AlarmService.getScheduled();
    setScheduledCount(list.length);
  };

  // ── ① 権限申請 ──────────────────────────────
  const handleRequestPermission = async () => {
    try {
      const result = await AlarmService.requestPermissions();
      setPermStatus(result.status);
      setCanBypassDnD(result.canBypassDnD);
      addLog(
        `権限: ${result.status} | DND突破: ${result.canBypassDnD ? '✓ 可能' : '✗ 不可（Critical Alert 要エンタイトルメント）'}`
      );
    } catch (e) {
      addLog(`権限申請失敗: ${e}`, true);
    }
  };

  // ── ② Push Token 取得 ────────────────────────
  const handleGetToken = async () => {
    try {
      const token = await AlarmService.getPushToken();
      setPushToken(token);
      addLog(`Push Token: ${token}`);
    } catch (e) {
      addLog(`Token 取得失敗: ${e}`, true);
    }
  };

  // ── ③ 10秒後アラーム（スタメン想定）───────────
  const handleAlarmIn10s = async () => {
    try {
      const id = await AlarmService.scheduleAlarm({
        title: '⚽ スタメン確認！',
        body: '三笘薫が今日スタメン出場します（10秒テスト）',
        delaySeconds: 10,
      });
      await refreshScheduledCount();
      addLog(`スタメンアラームセット [ID: ${id.slice(0, 8)}…] → 10秒後に発火`);
    } catch (e) {
      addLog(`アラームセット失敗: ${e}`, true);
    }
  };

  // ── ④ 即時アラーム（途中出場想定）─────────────
  const handleImmediateAlarm = async () => {
    try {
      const id = await AlarmService.scheduleAlarm({
        title: '⚽ 途中出場！',
        body: '三笘薫が60分から途中出場しました（即時テスト）',
        delaySeconds: 0,
      });
      await refreshScheduledCount();
      addLog(`途中出場アラーム即時発火 [ID: ${id.slice(0, 8)}…]`);
    } catch (e) {
      addLog(`即時アラーム失敗: ${e}`, true);
    }
  };

  // ── ⑤ バックグラウンドフロー模擬 ───────────────
  // アプリがバックグラウンドにいる状態でこのボタンを押した直後に
  // ホームに戻ると、3秒後にバックグラウンドタスク相当の通知が届く
  const handleSimulateBackgroundPush = async () => {
    try {
      const id = await AlarmService.scheduleAlarm({
        title: '⚽ [BG模擬] 途中出場！',
        body: 'バックグラウンドプッシュ受信を模擬しています（3秒後）',
        delaySeconds: 3,
      });
      await refreshScheduledCount();
      addLog('BG模擬アラームセット → 今すぐホームに戻ってください（3秒後発火）');
    } catch (e) {
      addLog(`BG模擬失敗: ${e}`, true);
    }
  };

  // ── ⑥ 全キャンセル ──────────────────────────
  const handleCancelAll = async () => {
    await AlarmService.cancelAll();
    await refreshScheduledCount();
    addLog('全アラームキャンセル');
  };

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>PitchIn</Text>
        <Text style={styles.subtitle}>アラームフロー 動作確認</Text>

        {/* ステータスバッジ */}
        <View style={styles.statusRow}>
          <Badge label={`権限: ${permStatus}`} ok={permStatus === 'granted'} />
          <Badge label={`DND突破: ${canBypassDnD ? '可' : '不可'}`} ok={canBypassDnD} />
          <Badge label={`予約中: ${scheduledCount}件`} ok={scheduledCount > 0} neutral />
        </View>

        {/* Push Token */}
        {pushToken ? (
          <View style={styles.tokenBox}>
            <Text style={styles.tokenLabel}>Push Token（スクリプトに貼る）</Text>
            <Text style={styles.tokenText} selectable>{pushToken}</Text>
          </View>
        ) : null}

        {/* セットアップ */}
        <Section title="① セットアップ">
          <Btn label="通知権限を申請" onPress={handleRequestPermission} />
          <Btn label="Push Token を取得" onPress={handleGetToken} />
        </Section>

        {/* アラームテスト */}
        <Section title="② アラームテスト（フォアグラウンド）">
          <Btn
            label="10秒後にアラーム（スタメン）"
            onPress={handleAlarmIn10s}
            color="#1976D2"
          />
          <Btn
            label="即時アラーム（途中出場）"
            onPress={handleImmediateAlarm}
            color="#E65100"
          />
        </Section>

        {/* バックグラウンドフロー */}
        <Section title="③ バックグラウンドフロー模擬">
          <Btn
            label="BG模擬アラームをセット → ホームへ戻る"
            onPress={handleSimulateBackgroundPush}
            color="#6A1B9A"
          />
          <Text style={styles.hint}>
            ボタンを押した後すぐにホームボタンでアプリをバックグラウンドへ。
            3秒後にアラームが届くか確認する。
          </Text>
          <Text style={styles.hint}>
            ※ 本番フローでは send-test-push.js でサーバーから silent push を送信する。
          </Text>
        </Section>

        {/* キャンセル */}
        <Section title="④ リセット">
          <Btn label="全アラームをキャンセル" onPress={handleCancelAll} color="#757575" />
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
  );
}

// ───────────────────────────────────────────────
// 小コンポーネント
// ───────────────────────────────────────────────
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function Btn({
  label,
  onPress,
  color = '#2E7D32',
}: {
  label: string;
  onPress: () => void;
  color?: string;
}) {
  return (
    <TouchableOpacity style={[styles.btn, { backgroundColor: color }]} onPress={onPress}>
      <Text style={styles.btnText}>{label}</Text>
    </TouchableOpacity>
  );
}

function Badge({
  label,
  ok,
  neutral,
}: {
  label: string;
  ok: boolean;
  neutral?: boolean;
}) {
  const bg = neutral ? '#546E7A' : ok ? '#2E7D32' : '#B71C1C';
  return (
    <View style={[styles.badge, { backgroundColor: bg }]}>
      <Text style={styles.badgeText}>{label}</Text>
    </View>
  );
}

// ───────────────────────────────────────────────
// スタイル
// ───────────────────────────────────────────────
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#121212' },
  container: { padding: 16, paddingBottom: 40 },
  title: { fontSize: 26, fontWeight: '800', color: '#FFFFFF', textAlign: 'center', marginTop: 8 },
  subtitle: { fontSize: 13, color: '#90A4AE', textAlign: 'center', marginBottom: 16 },
  statusRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12 },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  badgeText: { color: '#FFFFFF', fontSize: 11, fontWeight: '600' },
  tokenBox: {
    backgroundColor: '#1E2A35',
    borderRadius: 8,
    padding: 10,
    marginBottom: 12,
  },
  tokenLabel: { color: '#90A4AE', fontSize: 11, marginBottom: 4 },
  tokenText: { color: '#80CBC4', fontSize: 11, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
  section: {
    backgroundColor: '#1E1E1E',
    borderRadius: 10,
    padding: 14,
    marginBottom: 12,
  },
  sectionTitle: { color: '#B0BEC5', fontSize: 12, fontWeight: '700', marginBottom: 10, textTransform: 'uppercase' },
  btn: {
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginBottom: 8,
    alignItems: 'center',
  },
  btnText: { color: '#FFFFFF', fontWeight: '700', fontSize: 14 },
  hint: { color: '#78909C', fontSize: 11, marginTop: 4, lineHeight: 16 },
  emptyLog: { color: '#546E7A', fontSize: 12, textAlign: 'center' },
  logText: { color: '#CFD8DC', fontSize: 11, lineHeight: 18, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
  logError: { color: '#EF9A9A' },
});
