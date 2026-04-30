import React, { useEffect, useState } from 'react'
import { View, Text, StyleSheet, TouchableOpacity, Linking, Modal } from 'react-native'
import Constants from 'expo-constants'
import { Ionicons } from '@expo/vector-icons'
import { Colors } from '../constants/colors'
import { fetchMinVersion } from '../lib/api'

function isOutdated(current: string, minimum: string): boolean {
  const parse = (v: string) => v.split('.').map(Number)
  const [cMaj, cMin, cPat] = parse(current)
  const [mMaj, mMin, mPat] = parse(minimum)
  if (cMaj !== mMaj) return cMaj < mMaj
  if (cMin !== mMin) return cMin < mMin
  return cPat < mPat
}

export default function VersionGate({ children }: { children: React.ReactNode }) {
  const [updateRequired, setUpdateRequired] = useState(false)

  useEffect(() => {
    fetchMinVersion().then((minVersion) => {
      const current = Constants.expoConfig?.version ?? '0.0.0'
      if (isOutdated(current, minVersion)) setUpdateRequired(true)
    }).catch(() => {})
  }, [])

  return (
    <>
      {children}
      <Modal visible={updateRequired} animationType="fade" statusBarTranslucent>
        <View style={styles.container}>
          <Ionicons name="arrow-up-circle" size={80} color={Colors.primary} />
          <Text style={styles.title}>アップデートが必要です</Text>
          <Text style={styles.body}>
            Pitch-In の新しいバージョンが利用可能です。{'\n'}
            続けてご利用いただくにはアップデートしてください。
          </Text>
          <TouchableOpacity
            style={styles.btn}
            onPress={() => Linking.openURL('https://apps.apple.com/app/id000000000')}
            activeOpacity={0.8}
          >
            <Text style={styles.btnText}>App Store でアップデート</Text>
          </TouchableOpacity>
        </View>
      </Modal>
    </>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 36,
    gap: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: Colors.text,
    textAlign: 'center',
  },
  body: {
    fontSize: 15,
    color: Colors.textSecondary,
    lineHeight: 24,
    textAlign: 'center',
  },
  btn: {
    marginTop: 8,
    backgroundColor: Colors.primary,
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 14,
  },
  btnText: {
    fontSize: 15,
    fontWeight: '800',
    color: Colors.background,
  },
})
