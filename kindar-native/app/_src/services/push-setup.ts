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
 * Registra channels Android (idempotente — Android dedupe por id).
 * Pode rodar a cada boot sem custo. Falha não é fatal (ex: iOS).
 *
 * Channels:
 *  - 'default'            (existente) — uso geral
 *  - 'activity_reminders' (novo)      — lembrete pré-evento das atividades
 *                                       com importance MAX, vibration
 *                                       reconhecível. Backend FCM passa
 *                                       channel_id='activity_reminders' no
 *                                       payload — vide src/lib/push-fcm.ts.
 *                                       Match com setNotificationCategory
 *                                       Async('activity_reminder', [...])
 *                                       pra quick actions (Fase futura).
 *
 * Pra app já instalado, o re-create com mesma config é no-op (Android só
 * permite mudar nome+description via system settings após primeiro create).
 */
export async function registerNotificationChannels() {
  if (Platform.OS !== 'android') return;
  try {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Kindar',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#C07055',
    });
    await Notifications.setNotificationChannelAsync('activity_reminders', {
      name: 'Lembretes de atividades',
      description: 'Avisos pouco antes de cada compromisso da criança, com o checklist do que preparar.',
      importance: Notifications.AndroidImportance.MAX,
      // Padrão reconhecível: pulso curto-longo-curto. Diferencia de push
      // genérico ("zumbido único") em ~200ms — premium tactile signature.
      vibrationPattern: [0, 500, 250, 500],
      lightColor: '#C07055',
      enableVibrate: true,
    });
  } catch {
    // non-fatal — push entrega via 'default' como fallback
  }
}

/**
 * Request permission + get push token. Sends to backend to register on push_subscriptions.
 * Returns null if user denies permission or not on a physical device.
 *
 * BEHAVIOR CHANGE 2026-05-22: deixou de chamar o hard prompt iOS direto.
 * Agora SÓ procede se permission já foi concedida (granted) ou se o
 * caller passou `forceRequest=true` (vindo do SoftPromptModal após user
 * clicar "Sim, ativar"). Sem isso, retorna null sem mostrar hard prompt.
 *
 * Industry rationale: 40-60% dos users clicam "Don't Allow" no hard prompt
 * iOS quando aparece sem contexto, e iOS NUNCA reaparece — perde push pra
 * sempre. Soft prompt pré-modal explicando o valor restaura opt-in pra
 * 60-70%.
 *
 * Fluxo recomendado:
 *   1. Caller checa `checkSoftPromptStatus()` em push-soft-prompt.ts
 *   2. Se 'show_modal' → mostra SoftPromptModal
 *   3. Se user clica "Sim" → chama `registerForPushNotificationsAsync({ forceRequest: true })`
 *   4. Se 'already_granted' → chama sem forceRequest (no-op de prompt)
 */
export async function registerForPushNotificationsAsync(
  opts: { forceRequest?: boolean } = {},
): Promise<string | null> {
  if (Platform.OS === 'web') {
    // expo-notifications on web does not support native APNs/FCM tokens
    return null;
  }

  const { status: existing } = await Notifications.getPermissionsAsync();
  let finalStatus = existing;

  if (existing !== 'granted') {
    if (!opts.forceRequest) {
      // Sem forceRequest, NÃO disparamos o hard prompt iOS — preserva
      // a opção de mostrar soft prompt antes. Caller decide quando
      // realmente pedir.
      return null;
    }
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
