import React, { useState, useEffect } from 'react'
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Switch,
  ActivityIndicator,
  Modal,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { useLocalSearchParams } from 'expo-router'
import { Colors } from '../../src/constants/colors'
import { fetchAllPlayers } from '../../src/lib/api'
import { useFollowedPlayers } from '../../src/context/FollowedPlayersContext'
import { useAlarms } from '../../src/context/AlarmContext'
import type { FollowedPlayer } from '../../src/types'

type NotifyKey = 'notifyLineup' | 'notifySubstitution' | 'notifyGoal' | 'notifyAssist'

type Tab = 'following' | 'search'

export default function PlayersScreen() {
  const { setup } = useLocalSearchParams<{ setup?: string }>()
  const [activeTab, setActiveTab] = useState<Tab>(setup === '1' ? 'search' : 'following')
  const { followedPlayers, addPlayer, removePlayer, toggleNotify, isFollowed, isFull } = useFollowedPlayers()
  const [allPlayers, setAllPlayers] = useState<FollowedPlayer[]>([])
  const [playersLoading, setPlayersLoading] = useState(false)
  const [playersFetched, setPlayersFetched] = useState(false)

  // 初回「選手を追加」タブ表示時のみfetch
  useEffect(() => {
    if (activeTab === 'search' && !playersFetched) {
      setPlayersLoading(true)
      fetchAllPlayers()
        .then((data) => { setAllPlayers(data); setPlayersFetched(true) })
        .catch(() => {})
        .finally(() => setPlayersLoading(false))
    }
  }, [activeTab, playersFetched])

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>選手</Text>
        <View style={styles.countBadge}>
          <Text style={styles.countText}>{followedPlayers.length}/3</Text>
        </View>
      </View>

      <View style={styles.toggleRow}>
        <TouchableOpacity
          style={[styles.toggleBtn, activeTab === 'following' && styles.toggleBtnActive]}
          onPress={() => setActiveTab('following')}
        >
          <Text style={[styles.toggleText, activeTab === 'following' && styles.toggleTextActive]}>
            フォロー中
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.toggleBtn, activeTab === 'search' && styles.toggleBtnActive]}
          onPress={() => setActiveTab('search')}
        >
          <Text style={[styles.toggleText, activeTab === 'search' && styles.toggleTextActive]}>
            選手を追加
          </Text>
        </TouchableOpacity>
      </View>

      {activeTab === 'following' ? (
        <FollowingTab
          players={followedPlayers}
          onRemove={removePlayer}
          onToggleNotify={toggleNotify}
          onAddTap={() => setActiveTab('search')}
        />
      ) : (
        <SearchTab
          onAdd={addPlayer}
          onRemove={removePlayer}
          isFollowed={isFollowed}
          isFull={isFull}
          followedPlayers={followedPlayers}
          allPlayers={allPlayers}
          loading={playersLoading}
        />
      )}
    </SafeAreaView>
  )
}

function FollowingTab({
  players,
  onRemove,
  onToggleNotify,
  onAddTap,
}: {
  players: FollowedPlayer[]
  onRemove: (id: string) => void
  onToggleNotify: (id: string, key: NotifyKey) => void
  onAddTap: () => void
}) {
  const { getAlarmsForPlayer, deleteAlarm } = useAlarms()
  const [confirmPlayer, setConfirmPlayer] = useState<FollowedPlayer | null>(null)

  const handleRemoveRequest = (player: FollowedPlayer) => {
    const relatedAlarms = getAlarmsForPlayer(player.id)
    if (relatedAlarms.length > 0) {
      setConfirmPlayer(player)
    } else {
      onRemove(player.id)
    }
  }

  const handleConfirmRemove = () => {
    if (!confirmPlayer) return
    const relatedAlarms = getAlarmsForPlayer(confirmPlayer.id)
    relatedAlarms.forEach((a) => deleteAlarm(a.id))
    onRemove(confirmPlayer.id)
    setConfirmPlayer(null)
  }

  return (
    <>
      <ScrollView contentContainerStyle={styles.list}>
        {players.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Ionicons name="people-outline" size={48} color={Colors.textDim} />
            <Text style={styles.emptyText}>フォロー中の選手はいません</Text>
            <TouchableOpacity style={styles.emptyAddBtn} onPress={onAddTap}>
              <Text style={styles.emptyAddBtnText}>選手を追加する</Text>
            </TouchableOpacity>
          </View>
        ) : (
          players.map((player) => (
            <FollowedPlayerCard
              key={player.id}
              player={player}
              onRemove={() => handleRemoveRequest(player)}
              onToggle={(key) => onToggleNotify(player.id, key)}
            />
          ))
        )}
      </ScrollView>

      {/* フォロー解除確認モーダル */}
      <Modal visible={!!confirmPlayer} transparent animationType="fade" onRequestClose={() => setConfirmPlayer(null)}>
        <View style={styles.confirmContainer}>
          <TouchableOpacity style={StyleSheet.absoluteFillObject} activeOpacity={1} onPress={() => setConfirmPlayer(null)} />
          <View style={styles.confirmBox}>
            <Text style={styles.confirmTitle}>{confirmPlayer?.name} をフォロー解除</Text>
            <Text style={styles.confirmMessage}>
              この選手のアラームが設定されています。{'\n'}フォロー解除するとアラームも削除されます。
            </Text>
            <View style={styles.confirmButtons}>
              <TouchableOpacity style={styles.confirmCancel} onPress={() => setConfirmPlayer(null)}>
                <Text style={styles.confirmCancelText}>キャンセル</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.confirmDelete} onPress={handleConfirmRemove}>
                <Text style={styles.confirmDeleteText}>削除する</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </>
  )
}

function SearchTab({
  onAdd,
  onRemove,
  isFollowed,
  isFull,
  followedPlayers,
  allPlayers,
  loading,
}: {
  onAdd: (player: FollowedPlayer) => void
  onRemove: (id: string) => void
  isFollowed: (id: string) => boolean
  isFull: boolean
  followedPlayers: FollowedPlayer[]
  allPlayers: FollowedPlayer[]
  loading: boolean
}) {
  const { getAlarmsForPlayer, deleteAlarm } = useAlarms()
  const [searchQuery, setSearchQuery] = useState('')

  const handleRemove = (id: string) => {
    getAlarmsForPlayer(id).forEach((a) => deleteAlarm(a.id))
    onRemove(id)
  }

  const displayPlayers = allPlayers.filter((p) => {
    if (!searchQuery) return true
    return (
      p.name.includes(searchQuery) ||
      p.team.includes(searchQuery) ||
      p.league.includes(searchQuery)
    )
  })

  return (
    <View style={styles.searchContainer}>
      <View style={styles.searchBar}>
        <Ionicons name="search" size={16} color={Colors.textDim} />
        <TextInput
          style={styles.searchInput}
          placeholder="名前・チーム・リーグで検索"
          placeholderTextColor={Colors.textDim}
          value={searchQuery}
          onChangeText={setSearchQuery}
          clearButtonMode="while-editing"
        />
      </View>

      <ScrollView contentContainerStyle={styles.list} keyboardShouldPersistTaps="handled">
        {loading ? (
          <ActivityIndicator color={Colors.primary} style={{ marginTop: 24 }} />
        ) : displayPlayers.length === 0 ? (
          <Text style={styles.empty}>該当する選手が見つかりません</Text>
        ) : (
          displayPlayers.map((player) => {
            const followed = isFollowed(player.id)
            return (
              <SuggestionRow
                key={player.id}
                player={player}
                followed={followed}
                onAction={() => followed ? handleRemove(player.id) : onAdd(player)}
                disabled={!followed && isFull}
              />
            )
          })
        )}
      </ScrollView>
    </View>
  )
}

function FollowedPlayerCard({
  player,
  onRemove,
  onToggle,
}: {
  player: FollowedPlayer
  onRemove: () => void
  onToggle: (key: NotifyKey) => void
}) {
  return (
    <View style={styles.card}>
      {/* 選手情報ヘッダー */}
      <View style={styles.cardHeader}>
        <View style={styles.numberBadge}>
          <Text style={styles.numberText}>#{player.number}</Text>
        </View>
        <View style={styles.playerInfo}>
          <Text style={styles.playerName}>{player.name}</Text>
          <Text style={styles.playerMeta}>{player.team}</Text>
          <Text style={styles.playerMeta2}>{player.league}</Text>
        </View>
        <TouchableOpacity onPress={onRemove} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="close-circle" size={22} color={Colors.textDim} />
        </TouchableOpacity>
      </View>

      {/* 通知設定 */}
      <View style={styles.notifySection}>
        <Text style={styles.notifySectionTitle}>Push通知</Text>
        <NotifyRow
          label="スタメン発表"
          value={player.notifyLineup}
          onToggle={() => onToggle('notifyLineup')}
        />
        <NotifyRow
          label="途中出場"
          value={player.notifySubstitution}
          onToggle={() => onToggle('notifySubstitution')}
        />
        <NotifyRow
          label="得点"
          value={player.notifyGoal}
          onToggle={() => onToggle('notifyGoal')}
        />
        <NotifyRow
          label="アシスト"
          value={player.notifyAssist}
          onToggle={() => onToggle('notifyAssist')}
          isLast
        />
      </View>
    </View>
  )
}

function NotifyRow({
  label,
  value,
  onToggle,
  isLast = false,
}: {
  label: string
  value: boolean
  onToggle: () => void
  isLast?: boolean
}) {
  return (
    <View style={[styles.notifyRow, !isLast && styles.notifyRowBorder]}>
      <Text style={styles.notifyLabel}>{label}</Text>
      <Switch
        value={value}
        onValueChange={onToggle}
        trackColor={{ false: Colors.border, true: Colors.primary }}
        thumbColor={Colors.text}
        ios_backgroundColor={Colors.border}
        style={{ transform: [{ scaleX: 0.85 }, { scaleY: 0.85 }] }}
      />
    </View>
  )
}

function SuggestionRow({
  player,
  followed,
  onAction,
  disabled,
}: {
  player: FollowedPlayer
  followed: boolean
  onAction: () => void
  disabled: boolean
}) {
  return (
    <View style={[styles.suggestion, !followed && disabled && styles.suggestionDisabled]}>
      <View style={styles.numberBadge}>
        <Text style={styles.numberText}>#{player.number}</Text>
      </View>
      <View style={styles.playerInfo}>
        <Text style={styles.playerName}>{player.name}</Text>
        <Text style={styles.playerMeta}>{player.team}</Text>
        <Text style={styles.playerMeta2}>{player.league}</Text>
      </View>
      {followed ? (
        <TouchableOpacity
          onPress={onAction}
          style={styles.followedBtn}
        >
          <Ionicons name="checkmark" size={14} color={Colors.primary} />
          <Text style={styles.followedBtnText}>フォロー中</Text>
        </TouchableOpacity>
      ) : (
        <TouchableOpacity
          onPress={onAction}
          disabled={disabled}
          style={[styles.addBtn, disabled && styles.addBtnDisabled]}
        >
          <Ionicons name="add" size={18} color={disabled ? Colors.textDim : Colors.background} />
          <Text style={[styles.addBtnText, disabled && styles.addBtnTextDisabled]}>追加</Text>
        </TouchableOpacity>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 8, paddingBottom: 4, gap: 10 },
  headerTitle: { fontSize: 28, fontWeight: '800', color: Colors.text, flex: 1 },
  countBadge: { backgroundColor: Colors.surface, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10 },
  countText: { fontSize: 13, fontWeight: '700', color: Colors.textSecondary },

  toggleRow: {
    flexDirection: 'row', marginHorizontal: 16, marginVertical: 12,
    backgroundColor: Colors.surface, borderRadius: 10, padding: 3,
  },
  toggleBtn: { flex: 1, paddingVertical: 8, borderRadius: 8, alignItems: 'center' },
  toggleBtnActive: { backgroundColor: Colors.surfaceHigh },
  toggleText: { fontSize: 13, fontWeight: '600', color: Colors.textSecondary },
  toggleTextActive: { color: Colors.text },

  list: { paddingHorizontal: 16, paddingBottom: 24 },

  emptyContainer: { alignItems: 'center', marginTop: 60, gap: 12 },
  emptyText: { fontSize: 14, color: Colors.textSecondary },
  emptyAddBtn: { backgroundColor: Colors.primary, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 10 },
  emptyAddBtnText: { fontSize: 14, fontWeight: '700', color: Colors.background },

  searchContainer: { flex: 1 },
  searchBar: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: Colors.surface, borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 10,
    marginHorizontal: 16, marginBottom: 10,
  },
  searchInput: { flex: 1, fontSize: 14, color: Colors.text },

  proBanner: {
    backgroundColor: 'rgba(255,215,0,0.1)', borderRadius: 10, padding: 10,
    borderWidth: 1, borderColor: 'rgba(255,215,0,0.3)',
    marginHorizontal: 16, marginBottom: 10,
  },
  proBannerText: { fontSize: 13, color: Colors.proBadge, fontWeight: '600', textAlign: 'center' },

  empty: { fontSize: 13, color: Colors.textDim, textAlign: 'center', paddingVertical: 24 },

  card: {
    backgroundColor: Colors.surface, borderRadius: 12, marginBottom: 10, overflow: 'hidden',
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', padding: 12, gap: 10 },
  numberBadge: { width: 38, height: 38, borderRadius: 19, backgroundColor: Colors.surfaceHigh, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  numberText: { fontSize: 11, fontWeight: '800', color: Colors.primary },
  playerInfo: { flex: 1 },
  playerName: { fontSize: 15, fontWeight: '700', color: Colors.text },
  playerMeta: { fontSize: 12, color: Colors.textSecondary, marginTop: 1 },
  playerMeta2: { fontSize: 11, color: Colors.textDim, marginTop: 1 },
  notifySection: { borderTopWidth: 1, borderTopColor: Colors.border, paddingHorizontal: 12 },
  notifySectionTitle: { fontSize: 10, fontWeight: '700', color: Colors.textDim, paddingTop: 8, paddingBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 },
  notifyRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 7 },
  notifyRowBorder: { borderBottomWidth: 1, borderBottomColor: Colors.border },
  notifyLabel: { flex: 1, fontSize: 13, color: Colors.text },
  sectionLabel: {
    fontSize: 11, fontWeight: '700', color: Colors.textDim,
    textTransform: 'uppercase', letterSpacing: 0.5,
    marginTop: 12, marginBottom: 6,
  },
  suggestion: { backgroundColor: Colors.surface, borderRadius: 12, marginBottom: 8, flexDirection: 'row', alignItems: 'center', padding: 12, gap: 10 },
  suggestionDisabled: { opacity: 0.4 },
  addBtn: { flexDirection: 'row', alignItems: 'center', gap: 2, backgroundColor: Colors.primary, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 8 },
  addBtnDisabled: { backgroundColor: Colors.surfaceHigh },
  addBtnText: { fontSize: 12, fontWeight: '700', color: Colors.background },
  addBtnTextDisabled: { color: Colors.textDim },
  followedBtn: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: 'rgba(0,230,118,0.12)', paddingHorizontal: 10, paddingVertical: 7, borderRadius: 8 },
  followedBtnText: { fontSize: 12, fontWeight: '700', color: Colors.primary },

  // 確認モーダル
  confirmContainer: {
    flex: 1, justifyContent: 'center', alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.6)', paddingHorizontal: 32,
  },
  confirmBox: {
    width: '100%', backgroundColor: Colors.surface, borderRadius: 16, padding: 24,
  },
  confirmTitle: { fontSize: 17, fontWeight: '800', color: Colors.text, marginBottom: 10 },
  confirmMessage: { fontSize: 14, color: Colors.textSecondary, lineHeight: 22, marginBottom: 24 },
  confirmButtons: { flexDirection: 'row', gap: 10 },
  confirmCancel: {
    flex: 1, paddingVertical: 14, borderRadius: 12, alignItems: 'center',
    backgroundColor: Colors.surfaceHigh,
  },
  confirmCancelText: { fontSize: 15, fontWeight: '700', color: Colors.textSecondary },
  confirmDelete: {
    flex: 1, paddingVertical: 14, borderRadius: 12, alignItems: 'center',
    backgroundColor: 'rgba(244,67,54,0.15)',
  },
  confirmDeleteText: { fontSize: 15, fontWeight: '700', color: Colors.live },
})
