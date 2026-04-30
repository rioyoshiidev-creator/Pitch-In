import React, { useState } from 'react'
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  Image,
  useWindowDimensions,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import * as Notifications from 'expo-notifications'
import { Colors } from '../constants/colors'
import { useDevice } from '../context/DeviceContext'
import { AlarmService } from '../alarm/AlarmService'

const IMAGES = {
  follow:  require('../../assets/onboarding/follow.jpg'),
  matches: require('../../assets/onboarding/matches.jpg'),
  alarm:   require('../../assets/onboarding/alarm.jpg'),
}

type Step = 1 | 2 | 3 | 4 | 5
const TOTAL_STEPS = 5
const FIRST_PERMISSION_STEP = 4

const STEPS: { image: keyof typeof IMAGES; title: string; desc: string }[] = [
  {
    image: 'follow',
    title: '選手をフォローする',
    desc: '気になる日本人選手を登録しよう。\nあとから変更もできます。',
  },
  {
    image: 'matches',
    title: '試合をチェックする',
    desc: '日本人選手が出る試合が自動で表示。\n先発・控えの状況やゴール・アシストの情報も\nリアルタイムで確認できます。',
  },
  {
    image: 'alarm',
    title: 'アラームをセットする',
    desc: 'フォロー中の選手の試合のアラームをセットしよう。\n先発の場合は指定時刻に、控えの場合は\n途中出場したタイミングでアラームが鳴ります。',
  },
]

export default function OnboardingModal({
  visible,
  onFinish,
  howToOnly = false,
}: {
  visible: boolean
  onFinish: () => void
  howToOnly?: boolean
}) {
  const [step, setStep] = useState<Step>(1)
  const { setupDevice } = useDevice()

  React.useEffect(() => {
    if (visible) setStep(1)
  }, [visible])

  const goBack = () => setStep((s) => Math.max(1, s - 1) as Step)
  const goNext = () => setStep((s) => Math.min(TOTAL_STEPS, s + 1) as Step)
  const skipToPermission = () => setStep(FIRST_PERMISSION_STEP as Step)

  const handleNotificationPermission = async () => {
    await Notifications.requestPermissionsAsync()
    goNext()
  }

  const handleAlarmPermission = async () => {
    await AlarmService.requestPermissions().catch(() => {})
    await setupDevice().catch(() => {})
    // iOSシステムダイアログが完全に閉じてから遷移
    setTimeout(() => onFinish(), 600)
  }

  const isContentStep = step <= 3
  const isNotificationStep = step === 4
  const isAlarmStep = step === 5

  if (howToOnly) {
    return (
      <Modal visible={visible} animationType="slide" statusBarTranslucent>
        <View style={styles.container}>
          <View style={styles.header}>
            <TouchableOpacity style={styles.headerBtn} onPress={onFinish} activeOpacity={0.75}>
              <Ionicons name="close" size={22} color={Colors.text} />
            </TouchableOpacity>
            <Text style={styles.howToTitle}>使い方</Text>
            <View style={styles.headerBtn} />
          </View>
          <HowToCarousel />
          <View style={styles.bottomActions}>
            <TouchableOpacity style={[styles.primaryBtn, { flex: 1 }]} onPress={onFinish}>
              <Text style={styles.primaryBtnText}>閉じる</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    )
  }

  return (
    <Modal visible={visible} animationType="slide" statusBarTranslucent>
      <View style={styles.container}>

        {/* ヘッダー */}
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.headerBtn}
            onPress={step > 1 ? goBack : undefined}
            activeOpacity={step > 1 ? 0.75 : 1}
          >
            {step > 1 && <Ionicons name="arrow-back" size={22} color={Colors.text} />}
          </TouchableOpacity>
          <View style={styles.dots}>
            {Array.from({ length: TOTAL_STEPS }, (_, i) => (
              <View key={i} style={[styles.dot, step === i + 1 && styles.dotActive]} />
            ))}
          </View>
          {isContentStep ? (
            <TouchableOpacity style={styles.skipBtn} onPress={skipToPermission} activeOpacity={0.75}>
              <Text style={styles.skipText}>スキップ</Text>
            </TouchableOpacity>
          ) : (
            <View style={styles.headerBtn} />
          )}
        </View>

        {/* コンテンツ */}
        {isContentStep && <StepScreen stepIndex={step - 1} />}
        {isNotificationStep && <NotificationPermissionScreen />}
        {isAlarmStep && <AlarmPermissionScreen />}

        {/* ボタン */}
        <View style={styles.bottomActions}>
          <TouchableOpacity
            style={[styles.primaryBtn, { flex: 1 }]}
            onPress={
              isAlarmStep ? handleAlarmPermission
              : isNotificationStep ? handleNotificationPermission
              : goNext
            }
          >
            <Text style={styles.primaryBtnText}>
              {isAlarmStep ? '許可して始める' : isNotificationStep ? '通知を許可する' : '次へ'}
            </Text>
            {isContentStep && <Ionicons name="arrow-forward" size={16} color={Colors.background} />}
          </TouchableOpacity>
        </View>

      </View>
    </Modal>
  )
}

// ── 各ステップ画面 ────────────────────────────────────────────────

function NotificationPermissionScreen() {
  return (
    <View style={[styles.stepContainer, { justifyContent: 'center' }]}>
      <View style={styles.permissionIconWrap}>
        <Ionicons name="notifications-outline" size={72} color={Colors.primary} />
      </View>
      <Text style={styles.stepTitle}>通知を許可する</Text>
      <Text style={styles.stepDesc}>
        スタメン発表や選手のゴール・アシストなど{'\n'}リアルタイムの情報をお知らせするために{'\n'}通知の許可が必要です。
      </Text>
    </View>
  )
}

function AlarmPermissionScreen() {
  return (
    <View style={[styles.stepContainer, { justifyContent: 'center' }]}>
      <View style={styles.permissionIconWrap}>
        <Ionicons name="alarm-outline" size={72} color={Colors.primary} />
      </View>
      <Text style={styles.stepTitle}>アラームを許可する</Text>
      <Text style={styles.stepDesc}>
        深夜・早朝の試合でも確実に起こすために{'\n'}アラームの許可が必要です。
      </Text>
      <View style={styles.permissionBox}>
        <Text style={styles.permissionBoxTitle}>下記が原因でアラームが鳴らなくなります</Text>
        <View style={styles.permissionRow}>
          <Ionicons name="warning-outline" size={16} color={Colors.primary} />
          <View style={{ flex: 1 }}>
            <Text style={styles.warnItemTitle}>アプリの強制終了（タスクキル）</Text>
            <Text style={styles.permissionText}>バックグラウンドで動いたままにしてください</Text>
          </View>
        </View>
        <View style={styles.permissionRow}>
          <Ionicons name="warning-outline" size={16} color={Colors.primary} />
          <View style={{ flex: 1 }}>
            <Text style={styles.warnItemTitle}>バックグラウンドApp更新がオフ</Text>
            <Text style={styles.permissionText}>設定 → 一般 → バックグラウンドApp更新 → Pitch-In をオン</Text>
          </View>
        </View>
        <Text style={styles.permissionBoxFooter}>詳細は設定画面の「アラームが鳴らない時」から確認できます。</Text>
      </View>
    </View>
  )
}

function StepScreen({ stepIndex }: { stepIndex: number }) {
  const { width, height } = useWindowDimensions()
  const imgWidth = width - 48
  const imgHeight = Math.min(imgWidth * 1.8, height * 0.50)

  return (
    <View style={styles.stepContainer}>
      <View style={{ width: imgWidth, height: imgHeight, marginBottom: 24 }}>
        {STEPS.map((s, i) => (
          <Image
            key={s.image}
            source={IMAGES[s.image]}
            style={[
              styles.screenshot,
              { width: imgWidth, height: imgHeight, position: 'absolute', opacity: stepIndex === i ? 1 : 0, marginBottom: 0 },
            ]}
            resizeMode="contain"
          />
        ))}
      </View>
      <Text style={styles.stepTitle}>{STEPS[stepIndex].title}</Text>
      <Text style={styles.stepDesc}>{STEPS[stepIndex].desc}</Text>
    </View>
  )
}

// ── howToOnly 用カルーセル ────────────────────────────────────────

function HowToCarousel() {
  const [idx, setIdx] = useState(0)
  const { width, height } = useWindowDimensions()
  const imgWidth = width - 48
  const imgHeight = Math.min(imgWidth * 1.8, height * 0.48)

  return (
    <View style={{ flex: 1, paddingHorizontal: 24 }}>
      <View style={{ width: imgWidth, height: imgHeight, marginBottom: 0 }}>
        {STEPS.map((s, i) => (
          <Image
            key={s.image}
            source={IMAGES[s.image]}
            style={[
              styles.screenshot,
              { width: imgWidth, height: imgHeight, position: 'absolute', opacity: idx === i ? 1 : 0, marginBottom: 0 },
            ]}
            resizeMode="contain"
          />
        ))}
      </View>
      <View style={styles.subDots}>
        {STEPS.map((_, i) => (
          <TouchableOpacity key={i} onPress={() => setIdx(i)}>
            <View style={[styles.subDot, idx === i && styles.subDotActive]} />
          </TouchableOpacity>
        ))}
      </View>
      <Text style={styles.stepTitle}>{STEPS[idx].title}</Text>
      <Text style={styles.stepDesc}>{STEPS[idx].desc}</Text>
      <View style={styles.howToNav}>
        <TouchableOpacity
          style={[styles.navBtn, idx === 0 && styles.navBtnDisabled]}
          onPress={() => setIdx((i) => Math.max(0, i - 1))}
          disabled={idx === 0}
        >
          <Ionicons name="arrow-back" size={18} color={idx === 0 ? Colors.textDim : Colors.text} />
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.navBtn, idx === STEPS.length - 1 && styles.navBtnDisabled]}
          onPress={() => setIdx((i) => Math.min(STEPS.length - 1, i + 1))}
          disabled={idx === STEPS.length - 1}
        >
          <Ionicons name="arrow-forward" size={18} color={idx === STEPS.length - 1 ? Colors.textDim : Colors.text} />
        </TouchableOpacity>
      </View>
    </View>
  )
}

// ── スタイル ──────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
    paddingTop: 56,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  headerBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  skipBtn: { height: 40, paddingHorizontal: 4, alignItems: 'center', justifyContent: 'center' },
  howToTitle: { fontSize: 16, fontWeight: '700', color: Colors.text },
  skipText: { fontSize: 13, color: Colors.textDim },
  dots: { flexDirection: 'row', gap: 6, alignItems: 'center' },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: Colors.border },
  dotActive: { backgroundColor: Colors.primary, width: 20 },

  stepContainer: {
    flex: 1,
    paddingHorizontal: 24,
    alignItems: 'center',
  },
  screenshot: {
    borderRadius: 16,
    marginBottom: 24,
  },
  stepTitle: { fontSize: 22, fontWeight: '800', color: Colors.text, marginBottom: 10, textAlign: 'center' },
  stepDesc: { fontSize: 14, color: Colors.textSecondary, lineHeight: 22, textAlign: 'center' },

  permissionIconWrap: { alignItems: 'center', marginBottom: 28 },
  permissionBox: { backgroundColor: Colors.surface, borderRadius: 14, padding: 16, gap: 12, marginTop: 48, width: '100%' },
  permissionBoxTitle: { fontSize: 12, fontWeight: '700', color: Colors.textDim, marginBottom: 2 },
  permissionRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  permissionText: { fontSize: 12, color: Colors.textSecondary, lineHeight: 18, marginTop: 2 },
  warnItemTitle: { fontSize: 13, fontWeight: '700', color: Colors.text },
  permissionBoxFooter: { fontSize: 12, color: Colors.textDim, lineHeight: 17, marginTop: 4 },

  subDots: { flexDirection: 'row', justifyContent: 'center', gap: 6, marginBottom: 14 },
  subDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: Colors.border },
  subDotActive: { backgroundColor: Colors.primary, width: 18 },

  howToNav: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 16 },
  navBtn: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: Colors.surface,
    alignItems: 'center', justifyContent: 'center',
  },
  navBtnDisabled: { opacity: 0.3 },

  bottomActions: {
    flexDirection: 'row',
    paddingHorizontal: 24, paddingTop: 12, paddingBottom: 44,
    borderTopWidth: 1, borderTopColor: Colors.border,
    backgroundColor: Colors.background,
  },
  primaryBtn: {
    paddingVertical: 15, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: Colors.primary,
    flexDirection: 'row', gap: 6,
  },
  primaryBtnText: { fontSize: 15, fontWeight: '800', color: Colors.background },
})
