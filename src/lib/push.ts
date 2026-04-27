import webpush from "web-push";
import { createClient } from "@supabase/supabase-js";

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
  tag?: string;
  icon?: string;
  actions?: Array<{ action: string; title: string }>;
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
 * Send a push notification via APNs (Apple Push Notification service).
 * Uses HTTP/2 APNs API with a .p8 signing key.
 *
 * Requires env vars: APNS_KEY_ID, APNS_TEAM_ID, APNS_KEY_P8, APNS_BUNDLE_ID
 */
async function sendApnsPush(token: string, payload: PushPayload): Promise<boolean> {
  const keyId = process.env.APNS_KEY_ID;
  const teamId = process.env.APNS_TEAM_ID;
  const keyP8 = process.env.APNS_KEY_P8;
  const bundleId = process.env.APNS_BUNDLE_ID || "com.kindar.app";

  if (!keyId || !teamId || !keyP8) {
    // APNs not configured — skip silently
    return false;
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
        badge: 1,
        ...(payload.tag ? { "thread-id": payload.tag } : {}),
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

    return res.ok;
  } catch (err) {
    console.warn("[APNs] Failed to send:", err);
    return false;
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

    // Send via APNs (native iOS)
    const apnsTokens = await getUserApnsTokens(userId);
    if (apnsTokens.length > 0) {
      await Promise.allSettled(
        apnsTokens.map(async (token) => {
          const sent = await sendApnsPush(token, payload);
          if (!sent) {
            // Token might be invalid, remove it
            await removeApnsToken(userId, token);
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
 * Also insert into notifications table for in-app history + send push
 */
export async function createNotificationWithPush(
  userId: string,
  type: string,
  title: string,
  message: string,
  link?: string
) {
  const supabase = getAdminClient();

  // Insert in-app notification
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

  // Send push. Tag is unique per notification so the OS doesn't collapse
  // multiple alerts of the same type (e.g. several swap requests in a row).
  // (Angelino fix 2e263a5)
  await sendPushToUser(userId, {
    title,
    body: message,
    url: link || "/dashboard",
    tag: `${type}-${Date.now()}`,
  });
}
