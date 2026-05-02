import React, { createContext, useContext, useEffect, useRef, useState } from 'react'
import { AppState, AppStateStatus } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import * as Notifications from 'expo-notifications'
import { AlarmService } from '../alarm/AlarmService'
import { registerDevice } from '../lib/api'

const DEVICE_ID_KEY = 'device_id'

interface DeviceContextValue {
  deviceId: string | null
  pushToken: string | null
  setupDevice: () => Promise<void>
}

const DeviceContext = createContext<DeviceContextValue>({
  deviceId: null,
  pushToken: null,
  setupDevice: async () => {},
})

export function DeviceProvider({ children }: { children: React.ReactNode }) {
  const [deviceId, setDeviceId] = useState<string | null>(null)
  const [pushToken, setPushToken] = useState<string | null>(null)
  const appState = useRef(AppState.currentState)

  useEffect(() => {
    // 起動時は許可済みかどうかだけチェック。未確認なら何もしない（オンボーディングに任せる）
    Notifications.getPermissionsAsync().then(({ status }) => {
      if (status === 'granted') setupDevice()
    })

    // フォアグラウンド復帰時に再チェック（設定から通知をONにした場合に対応）
    const subscription = AppState.addEventListener('change', (nextState: AppStateStatus) => {
      if (appState.current !== 'active' && nextState === 'active') {
        Notifications.getPermissionsAsync().then(({ status }) => {
          if (status === 'granted') setupDevice()
        })
      }
      appState.current = nextState
    })

    return () => subscription.remove()
  }, [])

  async function setupDevice() {
    try {
      const token = await AlarmService.getPushToken()
      setPushToken(token)

      const stored = await AsyncStorage.getItem(DEVICE_ID_KEY)
      if (stored) {
        setDeviceId(stored)
        return
      }

      const id = await registerDevice(token)
      await AsyncStorage.setItem(DEVICE_ID_KEY, id)
      setDeviceId(id)
    } catch (err) {
      console.warn('[DeviceContext] setup failed:', err)
    }
  }

  return (
    <DeviceContext.Provider value={{ deviceId, pushToken, setupDevice }}>
      {children}
    </DeviceContext.Provider>
  )
}

export function useDevice() {
  return useContext(DeviceContext)
}
