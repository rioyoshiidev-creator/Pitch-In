import React, { createContext, useContext, useState, useEffect } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { router } from 'expo-router'
import OnboardingModal from '../components/OnboardingModal'

const ONBOARDING_DONE_KEY = '@pitchin/onboarding_done'

interface OnboardingContextValue {
  openOnboarding: () => void
  openHowTo: () => void
}

const OnboardingContext = createContext<OnboardingContextValue>({ openOnboarding: () => {}, openHowTo: () => {} })

export function useOnboarding() {
  return useContext(OnboardingContext)
}

export function OnboardingProvider({ children }: { children: React.ReactNode }) {
  const [visible, setVisible] = useState(false)
  const [howToOnly, setHowToOnly] = useState(false)

  useEffect(() => {
    AsyncStorage.getItem(ONBOARDING_DONE_KEY).then((done) => {
      if (!done) setVisible(true)
    }).catch(() => {
      setVisible(true)
    })
  }, [])

  const handleOnboardingFinish = async () => {
    const done = await AsyncStorage.getItem(ONBOARDING_DONE_KEY).catch(() => null)
    setVisible(false)
    if (!done) {
      await AsyncStorage.setItem(ONBOARDING_DONE_KEY, 'true').catch(() => {})
      router.navigate('/(tabs)/players?setup=1')
    }
  }

  return (
    <OnboardingContext.Provider value={{
      openOnboarding: () => { setHowToOnly(false); setVisible(true) },
      openHowTo: () => { setHowToOnly(true); setVisible(true) },
    }}>
      {children}
      <OnboardingModal
        visible={visible}
        howToOnly={howToOnly}
        onFinish={howToOnly ? () => setVisible(false) : handleOnboardingFinish}
      />
    </OnboardingContext.Provider>
  )
}
