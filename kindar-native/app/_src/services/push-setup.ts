/**
 * Push notifications setup — APNs (iOS) + FCM (Android) via expo-notifications.
 *
 * Fluxo:
 * 1. registerForPushNotificationsAsync(): pede permissao, pega APNs/FCM token.
 * 2. POSTa token pro PWA via /api/push/register-apns (APNs) ou /api/push/subscribe (web push nao se aplica aqui).
 * 3. Backend salva em push_subscriptions table.
 * 4. setupNotificationHandler(): define comportamento em foreground + deep link no tap.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { supabase } from '../lib/supabase';

const WEB_URL = process.env.EXPO_PUBLIC_WEB_URL || 'https://kindar.com.br';

/** Configure how notifications are handled while app is foregrounded. */
export function setupNotificationHandler() {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
    }),
  });
}

/**
 * Request permission + get push token. Sends to backend to register on push_subscriptions.
 * Returns null if user denies permission or not on a physical device.
 */
export async function registerForPushNotificationsAsync(): Promise<string | null> {
  if (Platform.OS === 'web') {
    // expo-notifications on web does not support native APNs/FCM tokens
    return null;
  }

  const { status: existing } = await Notifications.getPermissionsAsync();
  let finalStatus = existing;

  if (existing !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }
  if (finalStatus !== 'granted') {
    return null;
  }

  let token: string | null = null;
  try {
    if (Platform.OS === 'ios') {
      // APNs raw device token — the PWA /api/push/register-apns expects this.
      const apns = await Notifications.getDevicePushTokenAsync();
      token = apns.data as string;
    } else if (Platform.OS === 'android') {
      // Android uses FCM; the native side uses the FCM token.
      // PWA /api/push/register-apns expects APNs string; for Android we'd
      // need a /api/push/register-fcm companion — for now, still register
      // with the same endpoint and let the backend detect platform via
      // user-agent or add a field. Minimal viable: getDevicePushTokenAsync
      // returns an FCM token on Android.
      const fcm = await Notifications.getDevicePushTokenAsync();
      token = fcm.data as string;
    }
  } catch (e) {
    console.warn('[push-setup] failed to obtain token:', e);
    return null;
  }

  if (!token) return null;

  // Android channel config (required since Android 8)
  if (Platform.OS === 'android') {
    try {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Kindar',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#C07055',
      });
    } catch {
      // non-fatal
    }
  }

  // Register with PWA backend. Idempotente — backend dedupa por (user, token).
  // Retry leve em caso de falha de rede pra cobrir flapping de conexao no
  // primeiro foreground apos login (cenario do Gustavo: app abriu sem internet,
  // registro falhou, ninguem chamou de novo). 2 tentativas com 2s entre.
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) return token;
    const url = `${WEB_URL}/api/push/register-apns`;
    const body = JSON.stringify({ token, platform: Platform.OS });

    let lastErr: unknown = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
          },
          body,
        });
        if (res.ok) {
          lastErr = null;
          break;
        }
        // Backend retornou erro — registra mas nao falha o app
        lastErr = new Error(`push register HTTP ${res.status}`);
      } catch (e) {
        lastErr = e;
      }
      if (attempt === 0) await new Promise(r => setTimeout(r, 2000));
    }
    if (lastErr) {
      console.warn('[push-setup] failed to register token with backend (after retry):', lastErr);
    }
  } catch (e) {
    console.warn('[push-setup] failed to register token with backend:', e);
  }

  return token;
}

/**
 * Listen for taps on notifications. On tap, navigate to the deep link
 * embedded in the notification's data payload (url field).
 */
export function addNotificationResponseListener(
  onTap: (url: string) => void
): () => void {
  const sub = Notifications.addNotificationResponseReceivedListener(response => {
    const url = (response.notification.request.content.data as any)?.url as string | undefined;
    if (url) onTap(url);
  });
  return () => sub.remove();
}

/** Clear the app icon badge — call this after user opens the inbox. */
export async function clearBadge() {
  try {
    await Notifications.setBadgeCountAsync(0);
  } catch {
    // non-fatal
  }
}
