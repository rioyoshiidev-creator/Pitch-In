import { ScrollView, Text, StyleSheet, View, Pressable } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Stack, router } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { Colors } from '../src/constants/colors'

const LAST_UPDATED = '2026年4月26日'

export default function PrivacyScreen() {
  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <Stack.Screen options={{
        title: 'プライバシーポリシー',
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

        <Section title="1. はじめに">
          Pitch-In（以下「本アプリ」）は、海外で活躍する日本人サッカー選手の試合情報を提供するアプリです。本プライバシーポリシーは、本アプリが収集する情報とその利用方法について説明します。
        </Section>

        <Section title="2. 収集する情報">
          {'・デバイストークン：プッシュ通知・アラームの送信に使用します。\n・フォロー選手の設定：お気に入り選手の登録情報（端末内に保存）。\n・アラーム設定：設定したアラーム情報（端末内およびサーバーに保存）。\n\n氏名・メールアドレス・位置情報などの個人を特定できる情報は一切収集しません。'}
        </Section>

        <Section title="3. 情報の利用目的">
          {'・試合開始前のアラーム通知\n・スタメン発表・得点のプッシュ通知\n・アプリのサービス改善'}
        </Section>

        <Section title="4. 第三者への提供">
          {'収集した情報を第三者に販売・提供することはありません。ただし、以下のサービスをインフラとして利用しています。\n\n・Supabase：データベース・バックエンド\n・Expo：プッシュ通知インフラ\n・API-Football：試合データの取得'}
        </Section>

        <Section title="5. データの保存・削除">
          デバイストークンおよびアラーム設定はアプリを削除することで端末から削除されます。サーバー上のデータの削除をご希望の場合はお問い合わせください。
        </Section>

        <Section title="6. お問い合わせ">
          プライバシーに関するお問い合わせは下記までご連絡ください。{'\n\n'}rio.yoshii.dev@gmail.com
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
