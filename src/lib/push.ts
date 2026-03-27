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
 * Send push notification to a specific user (all their devices)
 */
export async function sendPushToUser(userId: string, payload: PushPayload) {
  try {
    const subscriptions = await getUserSubscriptions(userId);
    if (subscriptions.length === 0) return;

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
          // If subscription expired (410 Gone or 404), remove it
          const statusCode = (err as { statusCode?: number })?.statusCode;
          if (statusCode === 410 || statusCode === 404) {
            await removePushSubscription(userId, sub.endpoint);
          }
        }
      })
    );
  } catch {
    // Push failure should never break the app
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

  // Send push
  await sendPushToUser(userId, {
    title,
    body: message,
    url: link || "/dashboard",
    tag: type,
  });
}
