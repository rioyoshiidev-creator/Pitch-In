import { Stack } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { useEffect } from 'react'
import * as Notifications from 'expo-notifications'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { Colors } from '../src/constants/colors'
import { AlarmProvider } from '../src/context/AlarmContext'
import { DeviceProvider } from '../src/context/DeviceContext'
import { FollowedPlayersProvider } from '../src/context/FollowedPlayersContext'
import { OnboardingProvider } from '../src/context/OnboardingContext'
import VersionGate from '../src/components/VersionGate'
import { registerBackgroundAlarmTask } from '../src/alarm/BackgroundTask'
import { AlarmService } from '../src/alarm/AlarmService'
import { ALARM_SOUND_KEY } from '../src/constants/alarmSounds'

export default function RootLayout() {
  useEffect(() => {
    registerBackgroundAlarmTask().catch(() => {})

    const sub = Notifications.addNotificationReceivedListener(async (notification) => {
      const data = notification.request.content.data
      if (!data?._isAlarmTrigger) return

      const playerName = (data.playerName as string) ?? '選手'
      const eventType = (data.eventType as string) ?? 'sub'
      const fireAt = data.fireAt as string | undefined
      const snooze = data.snooze === true

      const delaySeconds = fireAt
        ? Math.max(0, Math.round((new Date(fireAt).getTime() - Date.now()) / 1000))
        : 0

      const title = eventType === 'starter' ? 'スタメン確認' : '途中出場'
      const body = eventType === 'starter'
        ? `${playerName} が今日スタメン出場します`
        : `${playerName} が途中出場しました`

      const sound = await AsyncStorage.getItem(ALARM_SOUND_KEY).catch(() => null)

      AlarmService.scheduleAlarm({ title, body, delaySeconds, snooze, sound: sound ?? undefined }).catch(() => {})
    })

    return () => sub.remove()
  }, [])
  return (
    <VersionGate>
    <DeviceProvider>
    <FollowedPlayersProvider>
    <AlarmProvider>
    <OnboardingProvider>
      <StatusBar style="light" />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: Colors.background } }}>
        <Stack.Screen name="(tabs)" options={{ headerBackTitle: '' }} />
        <Stack.Screen name="test/index" options={{ headerShown: true, title: 'アラームテスト', headerStyle: { backgroundColor: Colors.surface }, headerTintColor: Colors.text }} />
        <Stack.Screen name="terms" options={{ headerShown: true, headerBackTitle: '' }} />
        <Stack.Screen name="privacy" options={{ headerShown: true, headerBackTitle: '' }} />
        <Stack.Screen name="contact" options={{ headerShown: true, headerBackTitle: '' }} />
        <Stack.Screen name="alarm-help" options={{ headerShown: true, headerBackTitle: '' }} />
      </Stack>
    </OnboardingProvider>
    </AlarmProvider>
    </FollowedPlayersProvider>
    </DeviceProvider>
    </VersionGate>
  )
}
