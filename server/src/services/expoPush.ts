import { Expo, ExpoPushMessage } from 'expo-server-sdk'

const expo = new Expo()

export type PushEventType = 'starter' | 'bench' | 'not_called_up' | 'substitution' | 'goal' | 'assist'

interface PushPayload {
  pushTokens: string[]
  playerName: string
  eventType: PushEventType
  matchId: string
}

function buildMessage(playerName: string, eventType: PushEventType): { title: string; body: string } {
  switch (eventType) {
    case 'starter':
      return {
        title: 'スタメン発表',
        body: `${playerName} が先発出場します`,
      }
    case 'bench':
      return {
        title: 'スタメン発表',
        body: `${playerName} は控えスタートです`,
      }
    case 'not_called_up':
      return {
        title: 'スタメン発表',
        body: `${playerName} は今節の招集外です`,
      }
    case 'substitution':
      return {
        title: '途中出場',
        body: `${playerName} が途中出場しました`,
      }
    case 'goal':
      return {
        title: 'ゴール',
        body: `${playerName} が得点しました`,
      }
    case 'assist':
      return {
        title: 'アシスト',
        body: `${playerName} がアシストしました`,
      }
  }
}

export async function sendPushNotifications({ pushTokens, playerName, eventType, matchId }: PushPayload) {
  const validTokens = pushTokens.filter((t) => Expo.isExpoPushToken(t))
  if (validTokens.length === 0) return

  const { title, body } = buildMessage(playerName, eventType)

  const messages: ExpoPushMessage[] = validTokens.map((to) => ({
    to,
    title,
    body,
    data: { matchId, playerName, eventType },
    sound: 'default',
    priority: 'high',
  }))

  const chunks = expo.chunkPushNotifications(messages)
  for (const chunk of chunks) {
    try {
      await expo.sendPushNotificationsAsync(chunk)
    } catch (err) {
      console.error('[Push] 送信エラー:', err)
    }
  }
}

export async function sendSilentPush(pushToken: string, data: Record<string, unknown>) {
  if (!Expo.isExpoPushToken(pushToken)) return
  try {
    await expo.sendPushNotificationsAsync([{
      to: pushToken,
      data: { ...data, _isAlarmTrigger: true },
      _contentAvailable: true,
      priority: 'high',
    }])
  } catch (err) {
    console.error('[Silent Push] 送信エラー:', err)
  }
}
