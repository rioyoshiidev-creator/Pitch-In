import React, { useState } from 'react'
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  Pressable,
  ScrollView,
  Keyboard,
  Linking,
  Alert,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Stack, router } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { Colors } from '../src/constants/colors'

const CATEGORIES = ['バグ・不具合の報告', '機能のご要望', 'その他'] as const
type Category = typeof CATEGORIES[number]

export default function ContactScreen() {
  const [category, setCategory] = useState<Category>('バグ・不具合の報告')
  const [message, setMessage] = useState('')

  const canSend = message.trim().length > 0

  const handleSend = () => {
    if (!canSend) return
    const subject = encodeURIComponent(`【Pitch-In】${category}`)
    const body = encodeURIComponent(message.trim())
    Linking.openURL(`mailto:rio.yoshii.dev@gmail.com?subject=${subject}&body=${body}`)
      .catch(() => Alert.alert('エラー', 'メールアプリを開けませんでした。'))
  }

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <Stack.Screen options={{
        title: 'お問い合わせ',
        headerStyle: { backgroundColor: Colors.surface },
        headerTintColor: Colors.text,
        headerLeft: () => (
          <Pressable onPress={router.back} style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1, padding: 4 })}>
            <Ionicons name="chevron-back" size={26} color={Colors.text} />
          </Pressable>
        ),
      }} />

      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Pressable onPress={Keyboard.dismiss}>
        <Text style={styles.label}>カテゴリ</Text>
        <View style={styles.categoryRow}>
          {CATEGORIES.map((c) => (
            <TouchableOpacity
              key={c}
              style={[styles.categoryBtn, category === c && styles.categoryBtnActive]}
              onPress={() => { Keyboard.dismiss(); setCategory(c) }}
              activeOpacity={0.7}
            >
              <Text style={[styles.categoryText, category === c && styles.categoryTextActive]}>
                {c}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.label}>お問い合わせ内容</Text>
        <TextInput
          style={styles.textArea}
          value={message}
          onChangeText={setMessage}
          placeholder="内容を入力してください"
          placeholderTextColor={Colors.textDim}
          multiline
          textAlignVertical="top"
        />

        <Text style={styles.note}>
          送信ボタンを押すとメールアプリが開きます。{'\n'}
          内容を確認してから送信してください。
        </Text>

        <TouchableOpacity
          style={[styles.sendBtn, !canSend && styles.sendBtnDisabled]}
          onPress={handleSend}
          disabled={!canSend}
          activeOpacity={0.8}
        >
          <Text style={styles.sendBtnText}>メールアプリで送信</Text>
        </TouchableOpacity>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  scroll: { padding: 20, paddingBottom: 48 },

  label: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.textSecondary,
    marginBottom: 10,
    marginTop: 20,
  },

  categoryRow: { gap: 8 },
  categoryBtn: {
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  categoryBtnActive: {
    backgroundColor: 'rgba(0,230,118,0.08)',
    borderColor: Colors.primary,
  },
  categoryText: { fontSize: 14, color: Colors.textSecondary },
  categoryTextActive: { color: Colors.primary, fontWeight: '700' },

  textArea: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 14,
    fontSize: 14,
    color: Colors.text,
    minHeight: 160,
    lineHeight: 22,
  },

  note: {
    fontSize: 12,
    color: Colors.textDim,
    lineHeight: 18,
    marginTop: 12,
    marginBottom: 24,
  },

  sendBtn: {
    backgroundColor: Colors.primary,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
  },
  sendBtnDisabled: { backgroundColor: Colors.surfaceHigh },
  sendBtnText: { fontSize: 15, fontWeight: '800', color: Colors.background },
})
