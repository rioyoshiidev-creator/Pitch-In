import { ScrollView, Text, StyleSheet, View, Pressable } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Stack, router } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { Colors } from '../src/constants/colors'

export default function AlarmHelpScreen() {
  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <Stack.Screen options={{
        title: 'アラームが鳴らない時',
        headerStyle: { backgroundColor: Colors.surface },
        headerTintColor: Colors.text,
        headerLeft: () => (
          <Pressable onPress={router.back} style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1, padding: 4 })}>
            <Ionicons name="chevron-back" size={26} color={Colors.text} />
          </Pressable>
        ),
      }} />
      <ScrollView contentContainerStyle={styles.container}>

        <View style={styles.introBox}>
          <Ionicons name="information-circle-outline" size={18} color={Colors.primary} />
          <Text style={styles.introText}>
            アラームが鳴らない場合、以下の項目を順番に確認してください。
          </Text>
        </View>

        <CheckItem
          number="1"
          title="アプリを強制終了（タスクキル）していませんか？"
          body={'スワイプでアプリを完全に終了するとアラームが鳴らなくなります。\nアプリはバックグラウンドで動いたままにしておいてください。'}
        />
        <CheckItem
          number="2"
          title="バックグラウンドApp更新がオフになっていませんか？"
          body={'設定 → 一般 → バックグラウンドApp更新 → Pitch-In がオンになっているか確認してください。\nオフの場合、アプリがバックグラウンドにある時にサーバーからの通知を受け取れず、アラームが鳴らなくなります。'}
        />
        <CheckItem
          number="3"
          title="アラームの許可をオンにしていますか？"
          body={'設定 → Pitch-In → アラーム → オンになっているか確認してください。'}
        />
        <CheckItem
          number="4"
          title="iOSのバージョンを確認してください"
          body={'iOS 26以降が必要です。それ以前のバージョンではアラームが動作しない場合があります。'}
        />
        <CheckItem
          number="5"
          title="通信環境を確認してください"
          body={'アラームのスケジュールにはサーバーとの通信が必要です。電波が弱い環境ではアラームが設定されない場合があります。'}
        />

        <View style={styles.contactBox}>
          <Text style={styles.contactText}>
            上記を確認しても解決しない場合は、お問い合わせからご連絡ください。
          </Text>
        </View>

      </ScrollView>
    </SafeAreaView>
  )
}

function CheckItem({ number, title, body }: { number: string; title: string; body: string }) {
  return (
    <View style={styles.item}>
      <View style={styles.itemHeader}>
        <View style={styles.numberBadge}>
          <Text style={styles.numberText}>{number}</Text>
        </View>
        <Text style={styles.itemTitle}>{title}</Text>
      </View>
      <Text style={styles.itemBody}>{body}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  container: { padding: 20, paddingBottom: 48 },

  introBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: 'rgba(0,230,118,0.08)',
    borderRadius: 10,
    padding: 12,
    marginBottom: 20,
  },
  introText: { flex: 1, fontSize: 13, color: Colors.textSecondary, lineHeight: 19 },

  item: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
  },
  itemHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  numberBadge: {
    width: 24, height: 24, borderRadius: 12,
    backgroundColor: Colors.primary,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  numberText: { fontSize: 12, fontWeight: '800', color: Colors.background },
  itemTitle: { flex: 1, fontSize: 14, fontWeight: '700', color: Colors.text },
  itemBody: { fontSize: 13, color: Colors.textSecondary, lineHeight: 20 },

  contactBox: {
    marginTop: 8,
    padding: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  contactText: { fontSize: 13, color: Colors.textSecondary, lineHeight: 19, textAlign: 'center' },
})
