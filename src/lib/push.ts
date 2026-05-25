import webpush from "web-push";
import { createClient } from "@supabase/supabase-js";
import { sendFcmPush } from "./push-fcm";

// Configure VAPID (only if keys are available, trim whitespace)
const vapidPublic = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim();
const vapidPrivate = process.env.VAPID_PRIVATE_KEY?.trim();
let vapidConfigured = false;

if (vapidPublic && vapidPrivate) {
  try {
    webpush.setVapidDetails(
      "mailto:contato@kindar.com.br",
      vapidPublic,
      vapidPrivate
    );
    vapidConfigured = true;
  } catch (e) {
    console.warn("[PUSH] Failed to configure VAPID:", e);
  }
}

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

interface PushPayload {
  title: string;
  body: string;
  url?: string;
  /**
   * Semântica HÍBRIDA — backward-compat com chamadores legados:
   * - APNs: usado como `thread-id` (AGRUPA visualmente, NÃO substitui)
   * - FCM:  usado como `android.notification.tag` (SUBSTITUI notif anterior)
   *
   * Casos legítimos de `tag`: status updates onde só a versão mais recente
   * importa (ex: "swap pendente" → "swap aprovada" — replace OK).
   *
   * Pra notifs sequenciais que NÃO devem se sobrescrever (chat, ações
   * múltiplas em sequência), use `threadId` em vez de `tag`.
   */
  tag?: string;
  /**
   * iOS APNs `thread-id` SEM mapear pra FCM tag (não substitui Android).
   * Agrupa visualmente na Central de Notificações iOS mas cada notif fica
   * visível. Padrão WhatsApp/iMessage pra conversas e ações sequenciais.
   *
   * Bug histórico 2026-05-22: chat usava `tag` → mensagens consecutivas no
   * Android substituíam a anterior, user perdia mensagem. Migrado pra
   * `threadId` desde então.
   */
  threadId?: string;
  icon?: string;
  actions?: Array<{ action: string; title: string }>;
  /**
   * iOS only: APNs `interruptionLevel: 'time-sensitive'` (iOS 15+).
   * Atravessa Foco/DND quando o app declara o entitlement
   * `com.apple.developer.usernotifications.time-sensitive`.
   * Use APENAS pra reminders reais de eventos agendados (Apple pode
   * reverter no review se usar pra marketing). Default false.
   */
  timeSensitive?: boolean;
  /**
   * Android only: id do channel FCM (criado via Notifications.setNotification
   * ChannelAsync no native). Default 'default' (channel principal).
   * Pra reminders premium use 'activity_reminders' (importance MAX, som
   * distinto, vibration pattern reconhecível).
   */
  androidChannelId?: string;
  /**
   * APNs/iOS category id pra Notification Action Buttons (quick actions).
   * O app native registra via Notifications.setNotificationCategoryAsync.
   * Sem cat = sem botões inline. Não-fatal se cat não existir no device.
   */
  iosCategoryId?: string;
}

interface PushSubscriptionData {
  endpoint: string;
  p256dh: string;
  auth: string;
}

// ============================================================
// STORAGE: uses notifications table with type='system' and
// title='push_sub' to store push subscriptions.
// message column stores JSON: {endpoint, p256dh, auth}
// This avoids needing a new table.
// ============================================================

/**
 * Save a push subscription for a user
 */
export async function savePushSubscription(
  userId: string,
  subscription: PushSubscriptionData
) {
  const supabase = getAdminClient();
  const subJson = JSON.stringify(subscription);

  // Check if this subscription already exists for this user
  const { data: existing } = await supabase
    .from("notifications")
    .select("id, message")
    .eq("user_id", userId)
    .eq("type", "system")
    .eq("title", "push_sub");

  // Check if endpoint already stored
  if (existing) {
    for (const row of existing) {
      try {
        const stored = JSON.parse(row.message);
        if (stored.endpoint === subscription.endpoint) {
          // Update keys if changed
          if (stored.p256dh !== subscription.p256dh || stored.auth !== subscription.auth) {
            await supabase
              .from("notifications")
              .update({ message: subJson })
              .eq("id", row.id);
          }
          return; // Already exists
        }
      } catch {
        // Invalid JSON, skip
      }
    }
  }

  // Insert new subscription
  await supabase.from("notifications").insert({
    user_id: userId,
    type: "system",
    title: "push_sub",
    message: subJson,
    link: null,
    is_read: true, // Hidden from notification UI
  });
}

/**
 * Remove a push subscription
 */
export async function removePushSubscription(userId: string, endpoint: string) {
  const supabase = getAdminClient();

  const { data: subs } = await supabase
    .from("notifications")
    .select("id, message")
    .eq("user_id", userId)
    .eq("type", "system")
    .eq("title", "push_sub");

  if (!subs) return;

  for (const row of subs) {
    try {
      const stored = JSON.parse(row.message);
      if (stored.endpoint === endpoint) {
        await supabase.from("notifications").delete().eq("id", row.id);
        return;
      }
    } catch {
      // skip
    }
  }
}

/**
 * Get all push subscriptions for a user
 */
async function getUserSubscriptions(userId: string): Promise<PushSubscriptionData[]> {
  const supabase = getAdminClient();

  const { data } = await supabase
    .from("notifications")
    .select("message")
    .eq("user_id", userId)
    .eq("type", "system")
    .eq("title", "push_sub");

  if (!data) return [];

  const subs: PushSubscriptionData[] = [];
  for (const row of data) {
    try {
      const parsed = JSON.parse(row.message);
      if (parsed.endpoint && parsed.p256dh && parsed.auth) {
        subs.push(parsed);
      }
    } catch {
      // skip invalid
    }
  }
  return subs;
}

/**
 * Get all APNs tokens for a user (for native iOS push notifications)
 */
async function getUserApnsTokens(userId: string): Promise<string[]> {
  const supabase = getAdminClient();

  const { data } = await supabase
    .from("notifications")
    .select("id, message")
    .eq("user_id", userId)
    .eq("type", "system")
    .eq("title", "apns_token");

  if (!data) return [];
  return data.map((row) => row.message).filter(Boolean);
}

/**
 * Get all FCM tokens for a user (for native Android push notifications).
 * Stored under title='fcm_token' (separate from apns_token to allow
 * platform-specific routing in sendPushToUser).
 */
async function getUserFcmTokens(userId: string): Promise<string[]> {
  const supabase = getAdminClient();

  const { data } = await supabase
    .from("notifications")
    .select("id, message")
    .eq("user_id", userId)
    .eq("type", "system")
    .eq("title", "fcm_token");

  if (!data) return [];
  return data.map((row) => row.message).filter(Boolean);
}

async function removeFcmToken(userId: string, token: string) {
  const supabase = getAdminClient();
  const { data } = await supabase
    .from("notifications")
    .select("id, message")
    .eq("user_id", userId)
    .eq("type", "system")
    .eq("title", "fcm_token");

  if (!data) return;
  for (const row of data) {
    if (row.message === token) {
      await supabase.from("notifications").delete().eq("id", row.id);
      return;
    }
  }
}

/**
 * Result of a single device push attempt. Caller deletes the stored token
 * ONLY when `removeToken: true` — never on transient or env-missing errors.
 *
 * The previous boolean-only contract caused token wipes whenever:
 *   - APNS_* / FCM_* env vars were missing (e.g. preview deploy, env rotation)
 *   - Apple/Google returned 5xx
 *   - Network blip during fetch
 * After a single transient failure all push subscriptions for the user
 * disappeared, requiring them to reopen the app to re-register. Now we
 * only delete on confirmed-invalid (410, 400 BadDeviceToken, FCM UNREGISTERED).
 */
export type PushSendResult =
  | { delivered: true }
  | { delivered: false; removeToken: boolean; reason: string };

/**
 * Best-effort fetch of the user's unread notification count for the
 * iOS badge. Excludes the internal "push_sub" / "apns_token" / "fcm_token"
 * rows so the badge shows what the inbox actually shows. Returns 0 on
 * any error — never blocks the push.
 */
async function getUnreadBadgeCount(userId: string): Promise<number> {
  try {
    const supabase = getAdminClient();
    const { count } = await supabase
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("is_read", false)
      .neq("title", "push_sub")
      .neq("title", "apns_token")
      .neq("title", "fcm_token");
    return count ?? 0;
  } catch {
    return 0;
  }
}

/**
 * Send a push notification via APNs (Apple Push Notification service).
 * Uses HTTP/2 APNs API with a .p8 signing key.
 *
 * Requires env vars: APNS_KEY_ID, APNS_TEAM_ID, APNS_KEY_P8, APNS_BUNDLE_ID
 */
async function sendApnsPush(
  token: string,
  payload: PushPayload,
  badge: number,
): Promise<PushSendResult> {
  const keyId = process.env.APNS_KEY_ID;
  const teamId = process.env.APNS_TEAM_ID;
  const keyP8 = process.env.APNS_KEY_P8;
  const bundleId = process.env.APNS_BUNDLE_ID || "com.kindar.app";

  if (!keyId || !teamId || !keyP8) {
    // APNs not configured — keep tokens for when env is restored.
    return { delivered: false, removeToken: false, reason: "env_missing" };
  }

  try {
    // Dynamic import to avoid issues when crypto is not available
    const crypto = await import("crypto");

    // Create JWT for APNs authentication
    const header = Buffer.from(JSON.stringify({ alg: "ES256", kid: keyId })).toString("base64url");
    const now = Math.floor(Date.now() / 1000);
    const claims = Buffer.from(JSON.stringify({ iss: teamId, iat: now })).toString("base64url");
    const signingInput = `${header}.${claims}`;

    const key = crypto.createPrivateKey(keyP8.replace(/\\n/g, "\n"));
    const sign = crypto.createSign("SHA256");
    sign.update(signingInput);
    const signature = sign.sign(key);

    // Convert DER signature to raw r||s format for ES256
    const r = signature.subarray(4, 4 + signature[3]);
    const sOffset = 4 + signature[3] + 2;
    const s = signature.subarray(sOffset, sOffset + signature[sOffset - 1]);
    const rawSig = Buffer.concat([
      Buffer.alloc(32 - r.length), r,
      Buffer.alloc(32 - s.length), s,
    ]).toString("base64url");

    const jwt = `${signingInput}.${rawSig}`;

    // Use production APNs URL
    const apnsUrl = `https://api.push.apple.com/3/device/${token}`;

    const apnsPayload = {
      aps: {
        alert: { title: payload.title, body: payload.body },
        sound: "default",
        // Real unread count instead of a hardcoded 1. Apple resets the badge
        // to whatever the latest push specifies — so once user opens the
        // inbox and rows flip is_read=true, the next push (with badge=0
        // when there's no other unread) clears the dot. Hardcoded 1 made
        // the badge stick at 1 forever after the first push of a session.
        badge,
        // thread-id prioriza payload.threadId (iOS-only, não-substituível)
        // sobre payload.tag (legacy, mapeado dual com FCM replacement).
        ...(payload.threadId
          ? { "thread-id": payload.threadId }
          : payload.tag
            ? { "thread-id": payload.tag }
            : {}),
        // iOS 15+: atravessa Foco/DND quando entitlement
        // `com.apple.developer.usernotifications.time-sensitive` ativo.
        // Apple aceita silenciosamente se sem entitlement (push vira
        // normal) — não quebra app antigo sem rebuild.
        ...(payload.timeSensitive ? { "interruption-level": "time-sensitive" } : {}),
        // Notification Categories pra Action Buttons (long-press).
        ...(payload.iosCategoryId ? { category: payload.iosCategoryId } : {}),
      },
      url: payload.url || "/dashboard",
    };

    const res = await fetch(apnsUrl, {
      method: "POST",
      headers: {
        authorization: `bearer ${jwt}`,
        "apns-topic": bundleId,
        "apns-push-type": "alert",
        "apns-priority": "10",
        "content-type": "application/json",
      },
      body: JSON.stringify(apnsPayload),
    });

    if (res.ok) return { delivered: true };

    // Apple's permanent-failure signals — see
    // https://developer.apple.com/documentation/usernotifications/sending_notification_requests_to_apns
    //   410 Gone           → device unregistered the app
    //   400 BadDeviceToken → token is bogus
    // 5xx + everything else = transient → keep token for next attempt.
    if (res.status === 410) {
      return { delivered: false, removeToken: true, reason: "unregistered" };
    }
    if (res.status === 400) {
      try {
        const body = (await res.json()) as { reason?: string };
        if (body?.reason === "BadDeviceToken") {
          return { delivered: false, removeToken: true, reason: "bad_token" };
        }
      } catch {
        // body parse failed — treat as transient.
      }
    }
    return { delivered: false, removeToken: false, reason: `http_${res.status}` };
  } catch (err) {
    console.warn("[APNs] Failed to send:", err);
    // Network/crypto error — never delete; will retry on next push.
    return { delivered: false, removeToken: false, reason: "network_error" };
  }
}

/**
 * Remove an expired APNs token
 */
async function removeApnsToken(userId: string, token: string) {
  const supabase = getAdminClient();
  const { data } = await supabase
    .from("notifications")
    .select("id, message")
    .eq("user_id", userId)
    .eq("type", "system")
    .eq("title", "apns_token");

  if (!data) return;
  for (const row of data) {
    if (row.message === token) {
      await supabase.from("notifications").delete().eq("id", row.id);
      return;
    }
  }
}

/**
 * Send push notification to a specific user (all their devices: web + APNs)
 */
export async function sendPushToUser(userId: string, payload: PushPayload) {
  try {
    // Send via web-push (VAPID)
    const subscriptions = await getUserSubscriptions(userId);
    if (subscriptions.length > 0 && vapidConfigured) {
      const jsonPayload = JSON.stringify(payload);
      await Promise.allSettled(
        subscriptions.map(async (sub) => {
          try {
            await webpush.sendNotification(
              {
                endpoint: sub.endpoint,
                keys: {
                  p256dh: sub.p256dh,
                  auth: sub.auth,
                },
              },
              jsonPayload
            );
          } catch (err: unknown) {
            const statusCode = (err as { statusCode?: number })?.statusCode;
            if (statusCode === 410 || statusCode === 404) {
              await removePushSubscription(userId, sub.endpoint);
            }
          }
        })
      );
    }

    // Send via APNs (native iOS) — only delete tokens flagged as permanently
    // invalid (410 Unregistered / 400 BadDeviceToken). Transient errors and
    // env-not-configured keep the token alive for the next attempt.
    const apnsTokens = await getUserApnsTokens(userId);
    if (apnsTokens.length > 0) {
      // One unread count per push fanout — same value across all of the
      // user's iOS devices so the badge stays consistent after multi-device
      // sync. Cheap query (head:true count, indexed user_id + is_read).
      const badge = await getUnreadBadgeCount(userId);
      await Promise.allSettled(
        apnsTokens.map(async (token) => {
          const r = await sendApnsPush(token, payload, badge);
          if (!r.delivered && r.removeToken) {
            await removeApnsToken(userId, token);
          }
        })
      );
    }

    // Send via FCM (native Android) — same delete-only-on-permanent-invalid
    // policy. UNREGISTERED + INVALID_ARGUMENT (token-shaped) are removable;
    // every other failure (env-missing, oauth, 5xx, network) is transient.
    const fcmTokens = await getUserFcmTokens(userId);
    if (fcmTokens.length > 0) {
      await Promise.allSettled(
        fcmTokens.map(async (token) => {
          const r = await sendFcmPush(token, payload);
          if (!r.delivered && r.removeToken) {
            await removeFcmToken(userId, token);
          }
        })
      );
    }
  } catch {
    console.warn("[PUSH] Failed to send push to user", userId);
  }
}

/**
 * Send push to multiple users
 */
export async function sendPushToUsers(userIds: string[], payload: PushPayload) {
  await Promise.allSettled(
    userIds.map((userId) => sendPushToUser(userId, payload))
  );
}

/**
 * Mapeamento `type` de notification → categoria de preference. Tipos não
 * mapeados defaultam pra "category_disabled = false" (i.e., sempre passa) —
 * preservar backward-compat e não bloquear sem opt-out explícito.
 *
 * Sincronizado com NotificationCategory em services/notification-prefs.ts.
 * Importante manter os strings idênticos pro JSONB persistido na profile
 * continuar fazendo sentido conforme tipos novos aparecem.
 */
function mapTypeToCategory(type: string): string | null {
  // Activity reminders / digest
  if (type === "activity_reminder" || type.startsWith("activity_reminder")) return "activity_reminders";
  if (type === "activity_digest") return "activity_digest";
  // Vaccine / health Foundation Collab
  if (type.startsWith("vaccine") || type === "health_vaccine_created") return "vaccine_alerts";
  if (
    type === "medical_appointment_created" ||
    type === "illness_episode_created" ||
    type === "active_medication_created" ||
    type === "child_allergy_created" ||
    type === "vaccination_record_created" ||
    type.startsWith("health_")
  ) return "health_collab";
  // Chat
  if (type === "chat_message" || type.startsWith("chat")) return "chat";
  // Foundation Collab por record_type
  if (type === "school_log_created") return "school_collab";
  if (type === "expense_created" || type.startsWith("expense_")) return "expense_collab";
  if (type.startsWith("decision_")) return "decisions";
  if (type.startsWith("swap_")) return "swap";
  if (type === "birthday_reminder") return "birthday";
  if (type === "retention" || type.startsWith("retention_")) return "retention";
  if (type.startsWith("balance_")) return "balance_operations";
  if (type.startsWith("settlement_")) return "settlements";
  // System / unknown — passa direto (sem opt-out)
  return null;
}

/**
 * Also insert into notifications table for in-app history + send push.
 *
 * Respeita `profiles.notification_prefs` (migration 00093):
 *  - mute_until (mute global temporário)
 *  - categories[<category>] = false (mute por tipo)
 *  - quiet_hours (silêncio noturno)
 *
 * Urgent (`opts.urgent=true`) bypassa tudo — info crítica de saúde deve
 * passar sempre.
 *
 * Inbox in-app SEMPRE recebe o row (user vê histórico mesmo se push foi
 * skipado). Só o push device-side é silenciado.
 */
export async function createNotificationWithPush(
  userId: string,
  type: string,
  title: string,
  message: string,
  link?: string,
  /**
   * Opções premium opt-in. Backward-compatible: chamadores antigos passam só
   * 5 args, comportamento idêntico. Pra activity reminders, passe
   * { timeSensitive: true, androidChannelId: 'activity_reminders',
   *   iosCategoryId: 'activity_reminder' }.
   */
  opts?: {
    timeSensitive?: boolean;
    androidChannelId?: string;
    iosCategoryId?: string;
    /** Bypass prefs (mute/quiet/cat). Use APENAS pra info crítica de saúde. */
    urgent?: boolean;
  },
) {
  const supabase = getAdminClient();

  // Insert in-app notification — SEMPRE, mesmo se push for skipado.
  // User pode abrir inbox e ver tudo, controle granular afeta só push.
  try {
    await supabase.from("notifications").insert({
      user_id: userId,
      type,
      title,
      message,
      link: link || null,
      is_read: false,
    });
  } catch {
    // Don't crash if insert fails
  }

  // Respeita preferências do user antes do push device-side.
  // Failure-open: se notification-prefs.ts falhar, push vai (preserve UX).
  const category = mapTypeToCategory(type);
  if (category) {
    try {
      const { shouldSendPush } = await import("@/lib/services/notification-prefs");
      const decision = await shouldSendPush(
        userId,
        category as Parameters<typeof shouldSendPush>[1],
        { isUrgent: !!opts?.urgent },
      );
      if (!decision.send) {
        // Telemetry — quanto mute realmente está acontecendo
        // (lazy import pra evitar circular dep). Best-effort.
        try {
          const { captureServerEvent } = await import("@/lib/posthog-server");
          captureServerEvent(userId, "notification_skipped", {
            type,
            category,
            reason: decision.reason,
          });
        } catch {
          // ignore
        }
        return;
      }
    } catch {
      // notification-prefs indisponível — segue com push (fail open)
    }
  }

  // Send push. Tag is unique per notification so the OS doesn't collapse
  // multiple alerts of the same type (e.g. several swap requests in a row).
  // (Angelino fix 2e263a5)
  await sendPushToUser(userId, {
    title,
    body: message,
    url: link || "/dashboard",
    tag: `${type}-${Date.now()}`,
    timeSensitive: opts?.timeSensitive,
    androidChannelId: opts?.androidChannelId,
    iosCategoryId: opts?.iosCategoryId,
  });
}
