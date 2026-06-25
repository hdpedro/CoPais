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
import Constants from 'expo-constants';
import { supabase } from '../lib/supabase';
import { reportError } from '../lib/error-reporter';
import * as analytics from '../lib/analytics';

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
 * Registra categorias de quick actions (botões inline na notificação) — iOS
 * + Android. Idempotente, roda a cada boot. Match com `iosCategoryId`/
 * `data.categoryId` no payload (src/lib/push.ts + push-fcm.ts), com
 * OUTCOME_ACTIONS no public/sw.js e com FOLLOWUP_ACTIONS no cron
 * (services/activity-reminders.ts).
 *
 * 'activity_followup' = "Aconteceu?" → Sim / Não / Adiar. `opensAppToForeground
 * false`: tocar o botão NÃO abre o app — dispara o response listener (mesmo em
 * background), que chama POST /api/activities/outcome. Feedback Amanda: marcar
 * sem ter que abrir o app.
 */
export async function registerNotificationCategories() {
  try {
    await Notifications.setNotificationCategoryAsync('activity_followup', [
      { identifier: 'act_happened', buttonTitle: 'Sim', options: { opensAppToForeground: false } },
      { identifier: 'act_missed', buttonTitle: 'Não', options: { opensAppToForeground: false } },
      { identifier: 'act_snooze', buttonTitle: 'Adiar 1h', options: { opensAppToForeground: false } },
    ]);
  } catch {
    // non-fatal — sem categoria registrada o push vira normal (sem botões)
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
      // Android uses FCM. PWA endpoint detecta platform via field.
      const fcm = await Notifications.getDevicePushTokenAsync();
      token = fcm.data as string;
    }
  } catch (e) {
    // Falha aqui = capability iOS faltando no provisioning profile, ou push não
    // montado no Android. Sem visibilidade isso mata push pro device sem rastro.
    // Mas a MAIORIA dos throws aqui NÃO é bug de código nosso e nada que o app
    // faça resolve no momento — então classificamos pra não virar "erro vermelho"
    // recorrente (memory: nunca alarme à toa). 'info' grava no app_errors mas NÃO
    // pinga o Discord (/api/log-error pula notifyDiscord só pra 'info'); detecção
    // fleet-wide é por query agregada, não por evento. buildVersion (versionCode
    // do APK, imune a OTA) vai no metadata pra correlacionar.
    const msg = e instanceof Error ? e.message : String(e);
    const buildVersion = parseInt(String(Constants.nativeBuildVersion ?? ''), 10) || 0;
    const knownGoodBinary = buildVersion >= 37; // vc37+ embute google-services.json

    // (1) "FCM não montado neste binário" — Firebase não-init ou credencial/guia
    // do Expo faltando. ESPERADO em binário < vc37 (saiu sem google-services.json
    // — ver project_kindar_android_push_firebase) → 'info'. Num vc>=37 (que embute
    // o arquivo) isso seria REGRESSÃO real → mantém 'error' e aparece no feed.
    const isFirebaseNotInit = /FirebaseApp is not initialized/i.test(msg);
    const isFcmCredential =
      /fcm-credentials|MISSING_INSTANCEID_SERVICE|complete the guide/i.test(msg);
    const expectedUnconfigured =
      Platform.OS === 'android' && (isFirebaseNotInit || isFcmCredential) && !knownGoodBinary;

    // (2) Condição do APARELHO/SERVIÇO, independente do binário — nenhuma versão
    // do app emite token enquanto durar; some sozinha (user limpa o Google Play
    // Services / rede / FCM volta). Sempre 'info'.
    //   - TOO_MANY_REGISTRATIONS: o aparelho atingiu o teto de tokens FCM
    //     (~100/device, típico de device de teste muito reinstalado). IOException
    //     do getToken() do FCM. (bug Android 21/jun, 1 device.)
    //   - SERVICE_NOT_AVAILABLE / TIMEOUT: FCM/rede fora no momento; re-tenta
    //     sozinho no próximo foreground.
    const isFcmDeviceLimit = /TOO_MANY_REGISTRATIONS/i.test(msg);
    const isFcmTransient = /SERVICE_NOT_AVAILABLE|\bTIMEOUT\b/i.test(msg);
    const deviceServiceCondition = isFcmDeviceLimit || isFcmTransient;

    const nonActionable = expectedUnconfigured || deviceServiceCondition;
    reportError(e, {
      filePath: 'services/push-setup',
      severity: nonActionable ? 'info' : 'error',
      metadata: {
        phase: 'getDevicePushTokenAsync',
        platform: Platform.OS,
        buildVersion: buildVersion || null,
        firebaseNotInit: isFirebaseNotInit,
        fcmCredential: isFcmCredential,
        fcmDeviceLimit: isFcmDeviceLimit,
        fcmTransient: isFcmTransient,
      },
    });
    analytics.track('push_token_obtain_failed', {
      platform: Platform.OS,
      build_version: buildVersion || null,
      firebase_not_init: isFirebaseNotInit,
      fcm_credential: isFcmCredential,
      fcm_device_limit: isFcmDeviceLimit,
      fcm_transient: isFcmTransient,
    });
    return null;
  }

  if (!token) {
    // getDevicePushTokenAsync retornou sem throw mas com data vazio.
    // Conhecido em iOS 26.5+ se sistema ainda não terminou handshake APNs.
    reportError(new Error('push_token_empty: getDevicePushTokenAsync returned empty data'), {
      filePath: 'services/push-setup',
      severity: 'warning',
      metadata: { phase: 'token_empty', platform: Platform.OS },
    });
    analytics.track('push_token_empty', { platform: Platform.OS });
    return null;
  }
  analytics.track('push_token_obtained', { platform: Platform.OS });

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
    let lastStatus: number | null = null;
    let lastBody: string | null = null;
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
          lastStatus = res.status;
          break;
        }
        // Backend retornou erro — captura status + body pra diagnóstico
        lastStatus = res.status;
        try { lastBody = (await res.text()).slice(0, 500); } catch { lastBody = null; }
        lastErr = new Error(`push register HTTP ${res.status}`);
      } catch (e) {
        lastErr = e;
      }
      if (attempt === 0) await new Promise(r => setTimeout(r, 2000));
    }
    if (lastErr) {
      // Falha de REDE pura (fetch lançou, sem status HTTP) é transiente/esperada:
      // o app abriu offline; o registro re-tenta no próximo foreground (idempotente).
      // Não é erro de app → 'info' pra não poluir app_errors como 'error' (ruído
      // do device 14/jun "Network request failed"). HTTP error real (com status)
      // segue 'warning' (vale investigar o backend). analytics segue rastreando.
      reportError(lastErr, {
        filePath: 'services/push-setup',
        severity: lastStatus == null ? 'info' : 'warning',
        metadata: {
          phase: 'register_apns_backend',
          platform: Platform.OS,
          httpStatus: lastStatus,
          responseBody: lastBody,
          url,
        },
      });
      analytics.track('push_token_register_failed', { platform: Platform.OS, http_status: lastStatus });
    } else {
      analytics.track('push_token_register_succeeded', { platform: Platform.OS });
    }
  } catch (e) {
    // Idem: falha de rede transiente (TypeError "Network request failed") não é
    // erro de app — rebaixa pra 'info'. Outros throws seguem 'error'.
    const isNetwork = e instanceof TypeError && /network request failed/i.test(String(e.message));
    reportError(e, {
      filePath: 'services/push-setup',
      severity: isNetwork ? 'info' : 'error',
      metadata: { phase: 'register_apns_outer', platform: Platform.OS },
    });
  }

  return token;
}

/**
 * Listen for taps on notifications. On tap, navigate to the deep link
 * embedded in the notification's data payload (url field).
 */
export function addNotificationResponseListener(
  onResponse: (url: string | undefined, actionIdentifier: string) => void
): () => void {
  const sub = Notifications.addNotificationResponseReceivedListener(response => {
    const url = (response.notification.request.content.data as any)?.url as string | undefined;
    // actionIdentifier: DEFAULT_ACTION_IDENTIFIER no tap normal, ou
    // 'act_happened'/'act_missed'/'act_snooze' nos quick-action buttons.
    onResponse(url, response.actionIdentifier);
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
