import * as Notifications from 'expo-notifications'
import * as Device from 'expo-device'
import Constants from 'expo-constants'
import * as AlarmKit from 'expo-alarm-kit'

const APP_GROUP = 'group.com.pitchin.pitchin'

AlarmKit.configure(APP_GROUP)

Notifications.setNotificationHandler({
  handleNotification: async (notification) => {
    const isAlarmTrigger = notification.request.content.data?._isAlarmTrigger === true
    return {
      shouldShowAlert: !isAlarmTrigger,
      shouldPlaySound: !isAlarmTrigger,
      shouldSetBadge: false,
      shouldShowBanner: !isAlarmTrigger,
      shouldShowList: !isAlarmTrigger,
    }
  },
})

export interface AlarmOptions {
  title: string
  body: string
  /** 0 = 即時発火 */
  delaySeconds: number
  snooze?: boolean
  sound?: string
}

export interface PermissionResult {
  status: string
  canBypassDnD: boolean
}

export const AlarmService = {
  async requestPermissions(): Promise<PermissionResult> {
    const { status, ios } = await Notifications.requestPermissionsAsync({
      ios: {
        allowAlert: true,
        allowBadge: true,
        allowSound: true,
        allowCriticalAlerts: true,
      },
    })
    await AlarmKit.requestAuthorization()
    return {
      status,
      canBypassDnD: ios?.allowsCriticalAlerts ?? false,
    }
  },

  async getPushToken(): Promise<string> {
    if (!Device.isDevice) {
      throw new Error('Push Token は実機でのみ取得できます')
    }
    const projectId = Constants.expoConfig?.extra?.eas?.projectId as string | undefined
    if (!projectId) {
      throw new Error('projectId が未設定です')
    }
    const { data } = await Notifications.getExpoPushTokenAsync({ projectId })
    return data
  },

  async scheduleAlarm(options: AlarmOptions): Promise<string> {
    const { title, body, delaySeconds, snooze = false, sound } = options

    const alarmId = AlarmKit.generateUUID()
    const epochSeconds = Math.floor(Date.now() / 1000) + Math.max(delaySeconds, 1)
    await AlarmKit.scheduleAlarm({
      id: alarmId,
      epochSeconds,
      title: body,
      soundName: sound,
      launchAppOnDismiss: true,
      stopButtonLabel: '確認',
      doSnoozeIntent: false,
      snoozeButtonLabel: 'スヌーズ',
      snoozeDuration: 540,
      tintColor: '#00E676',
    })
    return alarmId
  },

  async cancelAll(): Promise<void> {
    const alarmIds = AlarmKit.getAllAlarms()
    await Promise.all(alarmIds.map((id) => AlarmKit.cancelAlarm(id).catch(() => {})))
    await Notifications.cancelAllScheduledNotificationsAsync()
  },

  async getScheduled() {
    return Notifications.getAllScheduledNotificationsAsync()
  },
}
