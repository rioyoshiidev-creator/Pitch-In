import * as TaskManager from 'expo-task-manager';
import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AlarmService } from './AlarmService';
import { ALARM_SOUND_KEY } from '../constants/alarmSounds';

export const BACKGROUND_ALARM_TASK = 'PITCH_IN_BACKGROUND_ALARM';
export const FIRED_ALARMS_KEY = '@pitchin/fired_alarms';

TaskManager.defineTask(BACKGROUND_ALARM_TASK, async ({ data, error }) => {
  if (error) {
    console.error('[BackgroundTask] エラー:', error);
    return;
  }

  const payload = (data as any)?.data?.body ?? {}
  console.log('[BackgroundTask] payload:', JSON.stringify(payload));

  const playerName: string = payload.playerName ?? '選手';
  const eventType: 'starter' | 'sub' = payload.eventType ?? 'sub';
  const fireAt: string | undefined = payload.fireAt;
  const snooze: boolean = payload.snooze === true;
  const matchId: string | undefined = payload.matchId;

  const delaySeconds = fireAt
    ? Math.max(0, Math.round((new Date(fireAt).getTime() - Date.now()) / 1000))
    : 0;

  const title = eventType === 'starter' ? 'スタメン確認' : '途中出場';
  const body = eventType === 'starter'
    ? `${playerName} が今日スタメン出場します`
    : `${playerName} が途中出場しました`;

  const sound = await AsyncStorage.getItem(ALARM_SOUND_KEY).catch(() => null) ?? undefined;

  try {
    await AlarmService.scheduleAlarm({ title, body, delaySeconds, snooze, sound: sound ?? undefined });
    console.log(`[BackgroundTask] アラーム登録 delay=${delaySeconds}s snooze=${snooze}`);

    if (matchId) {
      const raw = await AsyncStorage.getItem(FIRED_ALARMS_KEY).catch(() => null);
      const fired: string[] = raw ? JSON.parse(raw) : [];
      if (!fired.includes(matchId)) {
        await AsyncStorage.setItem(FIRED_ALARMS_KEY, JSON.stringify([...fired, matchId]));
      }
    }
  } catch (e) {
    console.error('[BackgroundTask] アラーム登録失敗:', e);
  }
});

export async function registerBackgroundAlarmTask(): Promise<void> {
  const isRegistered = await TaskManager.isTaskRegisteredAsync(BACKGROUND_ALARM_TASK);
  if (!isRegistered) {
    await Notifications.registerTaskAsync(BACKGROUND_ALARM_TASK);
    console.log('[BackgroundTask] タスク登録完了');
  } else {
    console.log('[BackgroundTask] タスク登録済み');
  }
}
