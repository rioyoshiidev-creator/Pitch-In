import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react'
import { AppState } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { Alarm } from '../types'
import type { AlarmTiming } from '../types'
import { useDevice } from './DeviceContext'
import { upsertAlarmOnServer, deleteAlarmOnServer, fetchAlarmsFromServer } from '../lib/api'
import { FIRED_ALARMS_KEY } from '../alarm/BackgroundTask'

const DEFAULT_TIMING_KEY = '@pitchin/default_alarm_timing'
const DEFAULT_MINUTES_KEY = '@pitchin/default_alarm_minutes'

export interface AlarmDefault {
  alarmTiming: AlarmTiming
  minutesBefore: number
}

interface AlarmContextValue {
  alarms: Alarm[]
  addAlarm: (alarm: Alarm) => void
  toggleSnooze: (id: string) => void
  deleteAlarm: (id: string) => void
  getMatchAlarm: (matchId: string) => Alarm | undefined
  getAlarmsForPlayer: (playerId: string) => Alarm[]
  alarmDefault: AlarmDefault
  setAlarmDefault: (d: AlarmDefault) => void
}

const AlarmContext = createContext<AlarmContextValue | null>(null)

export function AlarmProvider({ children }: { children: React.ReactNode }) {
  const [alarms, setAlarms] = useState<Alarm[]>([])
  const [alarmDefault, setAlarmDefaultState] = useState<AlarmDefault>({
    alarmTiming: 'before_kickoff',
    minutesBefore: 5,
  })
  const { deviceId } = useDevice()
  const alarmsRef = useRef<Alarm[]>(alarms)
  alarmsRef.current = alarms

  useEffect(() => {
    AsyncStorage.multiGet([DEFAULT_TIMING_KEY, DEFAULT_MINUTES_KEY]).then(([[, timing], [, minutes]]) => {
      if (timing && minutes) {
        setAlarmDefaultState({ alarmTiming: timing as AlarmTiming, minutesBefore: Number(minutes) })
      }
    }).catch(() => {})
  }, [])

  // deviceId が確定したら Supabase からアラームを復元
  useEffect(() => {
    if (!deviceId) return
    fetchAlarmsFromServer(deviceId)
      .then((fetched) => {
        if (fetched.length > 0) setAlarms(fetched)
      })
      .catch(() => {})
  }, [deviceId])

  const removeFiredAlarms = useCallback(async () => {
    const raw = await AsyncStorage.getItem(FIRED_ALARMS_KEY).catch(() => null)
    if (!raw) return
    const firedMatchIds: string[] = JSON.parse(raw)
    if (firedMatchIds.length === 0) return
    setAlarms((prev) => {
      prev.filter((a) => firedMatchIds.includes(a.matchId)).forEach((a) => {
        if (a.serverId) deleteAlarmOnServer(a.serverId).catch(() => {})
      })
      return prev.filter((a) => !firedMatchIds.includes(a.matchId))
    })
    await AsyncStorage.removeItem(FIRED_ALARMS_KEY).catch(() => {})
  }, [])

  useEffect(() => {
    removeFiredAlarms()
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') removeFiredAlarms()
    })
    return () => sub.remove()
  }, [removeFiredAlarms])

  const setAlarmDefault = (d: AlarmDefault) => {
    setAlarmDefaultState(d)
    AsyncStorage.multiSet([[DEFAULT_TIMING_KEY, d.alarmTiming], [DEFAULT_MINUTES_KEY, String(d.minutesBefore)]]).catch(() => {})
  }

  const addAlarm = (alarm: Alarm) => {
    setAlarms((prev) => {
      const filtered = prev.filter((a) => a.matchId !== alarm.matchId)
      return [...filtered, alarm]
    })

    if (deviceId) {
      upsertAlarmOnServer(deviceId, alarm)
        .then((serverId) => {
          setAlarms((prev) =>
            prev.map((a) => (a.matchId === alarm.matchId ? { ...a, serverId } : a))
          )
        })
        .catch((err) => console.warn('[AlarmContext] sync failed:', err))
    }
  }

  const toggleSnooze = (id: string) => {
    setAlarms((prev) => {
      const updated = prev.map((a) => (a.id === id ? { ...a, snooze: !a.snooze } : a))
      const alarm = updated.find((a) => a.id === id)
      if (alarm && deviceId) {
        upsertAlarmOnServer(deviceId, alarm).catch((err) => console.warn('[AlarmContext] snooze sync failed:', err))
      }
      return updated
    })
  }

  const deleteAlarm = (id: string) => {
    const target = alarms.find((a) => a.id === id)
    setAlarms((prev) => prev.filter((a) => a.id !== id))

    if (target?.serverId) {
      deleteAlarmOnServer(target.serverId)
        .catch((err) => console.warn('[AlarmContext] delete sync failed:', err))
    }
  }

  const getMatchAlarm = (matchId: string) =>
    alarms.find((a) => a.matchId === matchId)

  const getAlarmsForPlayer = (playerId: string) =>
    alarms.filter((a) => a.playerIds?.includes(playerId) ?? false)

  return (
    <AlarmContext.Provider value={{ alarms, addAlarm, toggleSnooze, deleteAlarm, getMatchAlarm, getAlarmsForPlayer, alarmDefault, setAlarmDefault }}>
      {children}
    </AlarmContext.Provider>
  )
}

export function useAlarms() {
  const ctx = useContext(AlarmContext)
  if (!ctx) throw new Error('useAlarms must be used within AlarmProvider')
  return ctx
}
