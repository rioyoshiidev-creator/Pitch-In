#!/usr/bin/env node
/**
 * テスト用 Silent Push 送信スクリプト
 *
 * 使い方:
 *   node scripts/send-test-push.js <ExponentPushToken> [eventType]
 *
 * 引数:
 *   ExponentPushToken  アプリの「Push Token を取得」ボタンで表示される値
 *   eventType          "starter"（スタメン）または "sub"（途中出場）[省略時: sub]
 *
 * 例:
 *   node scripts/send-test-push.js ExponentPushToken[xxxx-xxxx] sub
 *
 * 動作:
 *   content-available: 1 の silent push を Expo Push API 経由で送信する。
 *   アプリがバックグラウンドで起動し BackgroundTask が実行されてアラームが発火する。
 */

const [, , pushToken, eventType = 'sub'] = process.argv;

if (!pushToken) {
  console.error('エラー: Push Token が指定されていません');
  console.error('Usage: node scripts/send-test-push.js <ExponentPushToken> [starter|sub]');
  process.exit(1);
}

if (!['starter', 'sub'].includes(eventType)) {
  console.error('エラー: eventType は "starter" または "sub" を指定してください');
  process.exit(1);
}

const payload = {
  to: pushToken,

  // Silent push: title/body を入れない → ユーザーに通知バナーを出さない
  // バックグラウンドタスクがアラームを鳴らす
  title: undefined,
  body: undefined,

  // iOS にバックグラウンド起動を要求するフラグ
  _contentAvailable: true,

  // バックグラウンドタスクへ渡すデータ
  data: {
    playerName: eventType === 'starter' ? '三笘薫' : '久保建英',
    eventType,           // 'starter' | 'sub'
    matchId: 'test-match-001',
  },

  priority: 'high',
  channelId: 'alarm',
};

async function send() {
  console.log('送信内容:');
  console.log(JSON.stringify(payload, null, 2));
  console.log('');

  const res = await fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(payload),
  });

  const json = await res.json();

  if (json.data?.status === 'ok') {
    console.log('✓ 送信成功');
    console.log('  デバイスでアラームが発火するはずです。');
    console.log('  アプリがフォアグラウンドの場合はバックグラウンドに戻してください。');
  } else {
    console.error('✗ 送信失敗:');
    console.error(JSON.stringify(json, null, 2));

    if (json.data?.details?.error === 'DeviceNotRegistered') {
      console.error('\n→ Push Token が無効です。アプリで再取得してください。');
    }
  }
}

send().catch((e) => {
  console.error('ネットワークエラー:', e.message);
  process.exit(1);
});
