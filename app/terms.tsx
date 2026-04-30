import { ScrollView, Text, StyleSheet, View, Pressable } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Stack, router } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { Colors } from '../src/constants/colors'

const LAST_UPDATED = '2026年4月26日'

export default function TermsScreen() {
  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <Stack.Screen options={{
        title: '利用規約',
        headerStyle: { backgroundColor: Colors.surface },
        headerTintColor: Colors.text,
        headerLeft: () => (
          <Pressable onPress={router.back} style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1, padding: 4 })}>
            <Ionicons name="chevron-back" size={26} color={Colors.text} />
          </Pressable>
        ),
      }} />
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.updated}>最終更新日：{LAST_UPDATED}</Text>

        <Section title="1. サービスの概要">
          Pitch-In（以下「本アプリ」）は、海外で活躍する日本人サッカー選手の試合情報の確認、アラームの設定、プッシュ通知の受信ができるサービスです。
        </Section>

        <Section title="2. 利用条件">
          {'・iOS 26以降のデバイスでご利用ください。\n・本アプリの利用は無料です（将来的に有料機能を追加する場合があります）。'}
        </Section>

        <Section title="3. アラーム・通知に関する免責">
          {'・アラームの時刻は多少ずれることがあります。\n・スタメン発表がアラーム設定時刻より遅い場合、スタメン発表のタイミングでアラームが鳴ります。\n・通信環境・端末の状態によりアラームが鳴らない場合があります。\n・試合情報は外部APIから取得しており、情報の正確性を保証するものではありません。'}
        </Section>

        <Section title="4. 禁止事項">
          {'・本アプリの不正利用・リバースエンジニアリング\n・サーバーへの過度なアクセス'}
        </Section>

        <Section title="5. サービスの変更・終了">
          予告なくサービスの内容を変更、または提供を終了する場合があります。
        </Section>

        <Section title="6. 準拠法">
          本規約は日本法に準拠します。
        </Section>

        <Section title="7. お問い合わせ">
          rio.yoshii.dev@gmail.com
        </Section>
      </ScrollView>
    </SafeAreaView>
  )
}

function Section({ title, children }: { title: string; children: string }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <Text style={styles.body}>{children}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  container: { padding: 20, paddingBottom: 48 },
  updated: { fontSize: 12, color: Colors.textDim, marginBottom: 24 },
  section: { marginBottom: 24 },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: Colors.text, marginBottom: 8 },
  body: { fontSize: 14, color: Colors.textSecondary, lineHeight: 22 },
})
