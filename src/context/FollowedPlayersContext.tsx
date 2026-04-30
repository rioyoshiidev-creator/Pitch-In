import React, { createContext, useContext, useEffect, useRef, useState } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { FollowedPlayer } from '../types'
import { useDevice } from './DeviceContext'
import { syncFollowedPlayersToServer } from '../lib/api'

const STORAGE_KEY = 'followed_players'

type NotifyKey = 'notifyLineup' | 'notifySubstitution' | 'notifyGoal' | 'notifyAssist'

interface FollowedPlayersContextValue {
  followedPlayers: FollowedPlayer[]
  addPlayer: (player: FollowedPlayer) => void
  removePlayer: (id: string) => void
  toggleNotify: (id: string, key: NotifyKey) => void
  isFollowed: (id: string) => boolean
  isFull: boolean
}

const FollowedPlayersContext = createContext<FollowedPlayersContextValue | null>(null)

export function FollowedPlayersProvider({ children }: { children: React.ReactNode }) {
  const [followedPlayers, setFollowedPlayers] = useState<FollowedPlayer[]>([])
  const [loaded, setLoaded] = useState(false)
  const { deviceId } = useDevice()
  const syncTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // 起動時にローカルストレージから復元
  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((raw) => {
      if (raw) {
        try { setFollowedPlayers(JSON.parse(raw)) } catch {}
      }
      setLoaded(true)
    })
  }, [])

  // 変更をローカル保存 + サーバー同期（デバウンス 1 秒）
  useEffect(() => {
    if (!loaded) return
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(followedPlayers))

    if (!deviceId) return
    if (syncTimer.current) clearTimeout(syncTimer.current)
    syncTimer.current = setTimeout(() => {
      syncFollowedPlayersToServer(deviceId, followedPlayers).catch((err) => {
        console.warn('[FollowedPlayers] sync failed:', err)
      })
    }, 1000)
  }, [followedPlayers, loaded, deviceId])

  const addPlayer = (player: FollowedPlayer) => {
    if (followedPlayers.length >= 3) return
    setFollowedPlayers((prev) => [...prev, { ...player, notifyLineup: true }])
  }

  const removePlayer = (id: string) =>
    setFollowedPlayers((prev) => prev.filter((p) => p.id !== id))

  const toggleNotify = (id: string, key: NotifyKey) =>
    setFollowedPlayers((prev) =>
      prev.map((p) => (p.id === id ? { ...p, [key]: !p[key] } : p))
    )

  const isFollowed = (id: string) => followedPlayers.some((p) => p.id === id)
  const isFull = followedPlayers.length >= 3

  return (
    <FollowedPlayersContext.Provider value={{ followedPlayers, addPlayer, removePlayer, toggleNotify, isFollowed, isFull }}>
      {children}
    </FollowedPlayersContext.Provider>
  )
}

export function useFollowedPlayers() {
  const ctx = useContext(FollowedPlayersContext)
  if (!ctx) throw new Error('useFollowedPlayers must be used within FollowedPlayersProvider')
  return ctx
}
