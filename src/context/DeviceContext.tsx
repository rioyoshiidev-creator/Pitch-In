import React, { createContext, useContext, useEffect, useState } from 'react'
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

  useEffect(() => {
    // 起動時は許可済みかどうかだけチェック。未確認なら何もしない（オンボーディングに任せる）
    Notifications.getPermissionsAsync().then(({ status }) => {
      if (status === 'granted') setupDevice()
    })
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
