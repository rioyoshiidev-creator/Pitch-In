import React, { useState } from 'react'
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Linking,
  Modal,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { router } from 'expo-router'
import { Colors } from '../../src/constants/colors'
import { useOnboarding } from '../../src/context/OnboardingContext'
import { useAlarms } from '../../src/context/AlarmContext'
import { ALARM_OPTIONS } from '../../src/constants/alarmOptions'

export default function SettingsScreen() {
  const { openHowTo } = useOnboarding()
  const { alarmDefault, setAlarmDefault } = useAlarms()
  const [alarmPickerVisible, setAlarmPickerVisible] = useState(false)
  const currentDefaultLabel =
    ALARM_OPTIONS.find(
      (o) => o.alarmTiming === alarmDefault.alarmTiming && o.minutesBefore === alarmDefault.minutesBefore
    )?.label ?? '30分前'

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>設定</Text>
      </View>

      <ScrollView contentContainerStyle={styles.list}>
        <View style={styles.preReleaseBanner}>
          <Text style={styles.preReleaseTitle}>プレリリース版</Text>
          <Text style={styles.preReleaseText}>
            現在、限定ユーザー向けのプレリリース版です。{'\n'}
            正式リリースは2026年8月を予定しています。
          </Text>
        </View>

        <Text style={styles.sectionLabel}>通知・アラーム</Text>
        <TouchableOpacity style={styles.row} onPress={() => setAlarmPickerVisible(true)} activeOpacity={0.7}>
          <View style={{ flex: 1 }}>
            <Text style={styles.rowLabel}>デフォルトのアラームタイミング</Text>
            <Text style={styles.rowSub}>{currentDefaultLabel}</Text>
          </View>
          <Text style={styles.rowChevron}>›</Text>
        </TouchableOpacity>
        <SettingRow label="通知・アラーム設定を開く" onPress={() => Linking.openSettings()} />

        <Text style={styles.sectionLabel}>ヘルプ</Text>
        <SettingRow label="使い方を見る" onPress={openHowTo} />
        <SettingRow label="アラームが鳴らない時" onPress={() => router.push('/alarm-help')} />

        <Text style={styles.sectionLabel}>その他</Text>
        <SettingRow label="利用規約" onPress={() => router.push('/terms')} />
        <SettingRow label="プライバシーポリシー" onPress={() => router.push('/privacy')} />
        <SettingRow label="お問い合わせ" onPress={() => router.push('/contact')} />

        <Text style={styles.sectionLabel}>デバッグ</Text>
        <SettingRow label="アラームテスト画面" onPress={() => router.push('/test')} />

        <Text style={styles.version}>Pitch-In v1.0.0 (pre-release)</Text>
      </ScrollView>

      {/* アラームタイミング選択モーダル */}
      <Modal visible={alarmPickerVisible} transparent animationType="fade">
        <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={() => setAlarmPickerVisible(false)}>
          <View style={styles.pickerSheet}>
            <Text style={styles.pickerTitle}>デフォルトのアラームタイミング</Text>
            <Text style={styles.pickerSub}>新しくアラームを設定するときの初期選択です</Text>
            {ALARM_OPTIONS.map((opt) => {
              const selected = opt.alarmTiming === alarmDefault.alarmTiming && opt.minutesBefore === alarmDefault.minutesBefore
              return (
                <TouchableOpacity
                  key={`${opt.alarmTiming}-${opt.minutesBefore}`}
                  style={[styles.pickerOption, selected && styles.pickerOptionSelected]}
                  onPress={() => {
                    setAlarmDefault({ alarmTiming: opt.alarmTiming, minutesBefore: opt.minutesBefore })
                    setAlarmPickerVisible(false)
                  }}
                >
                  <Text style={[styles.pickerOptionText, selected && styles.pickerOptionTextSelected]}>
                    {opt.label}
                  </Text>
                  {selected && <Ionicons name="checkmark" size={18} color={Colors.primary} />}
                </TouchableOpacity>
              )
            })}
          </View>
        </TouchableOpacity>
      </Modal>

    </SafeAreaView>
  )
}

function SettingRow({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <TouchableOpacity style={styles.row} onPress={onPress} activeOpacity={0.7}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowChevron}>›</Text>
    </TouchableOpacity>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  header: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 4 },
  headerTitle: { fontSize: 28, fontWeight: '800', color: Colors.text },
  list: { paddingHorizontal: 16, paddingBottom: 40 },

  preReleaseBanner: {
    backgroundColor: 'rgba(0,230,118,0.08)',
    borderRadius: 12,
    padding: 14,
    marginTop: 16,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: 'rgba(0,230,118,0.2)',
  },
  preReleaseTitle: { fontSize: 13, fontWeight: '800', color: Colors.primary, marginBottom: 4 },
  preReleaseText: { fontSize: 12, color: Colors.textSecondary, lineHeight: 18 },

  sectionLabel: {
    fontSize: 12, fontWeight: '700', color: Colors.textSecondary,
    marginTop: 24, marginBottom: 8,
  },

  row: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: Colors.surface, borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 14,
    marginBottom: 8,
  },
  rowLabel: { flex: 1, fontSize: 14, color: Colors.text },
  rowSub: { fontSize: 12, color: Colors.textSecondary, marginTop: 2 },
  rowChevron: { fontSize: 20, color: Colors.textDim },

  version: { fontSize: 11, color: Colors.textDim, textAlign: 'center', marginTop: 32 },

  overlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  pickerSheet: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 20, borderTopRightRadius: 20,
    paddingHorizontal: 20, paddingTop: 20, paddingBottom: 44,
    gap: 4,
  },
  pickerTitle: { fontSize: 16, fontWeight: '800', color: Colors.text, marginBottom: 4 },
  pickerSub: { fontSize: 12, color: Colors.textSecondary, marginBottom: 12 },
  pickerOption: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 14, paddingHorizontal: 12,
    borderRadius: 10,
  },
  pickerOptionSelected: { backgroundColor: 'rgba(0,230,118,0.08)' },
  pickerOptionText: { fontSize: 15, color: Colors.textSecondary },
  pickerOptionTextSelected: { color: Colors.text, fontWeight: '700' },
})
