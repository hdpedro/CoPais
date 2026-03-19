import webpush from "web-push";
import { createClient } from "@supabase/supabase-js";

// Configure VAPID (only if keys are available)
if (process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(
    "mailto:contato@2lares.com.br",
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );
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

/**
 * Send push notification to a specific user (all their devices)
 */
export async function sendPushToUser(userId: string, payload: PushPayload) {
  try {
    const supabase = getAdminClient();

    const { data: subscriptions, error } = await supabase
      .from("push_subscriptions")
      .select("*")
      .eq("user_id", userId);

    // If table doesn't exist or query fails, skip silently
    if (error || !subscriptions || subscriptions.length === 0) return;

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
            await supabase
              .from("push_subscriptions")
              .delete()
              .eq("id", sub.id);
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
 * Also insert into notifications table for in-app history
 */
export async function createNotificationWithPush(
  userId: string,
  type: string,
  title: string,
  message: string,
  link?: string
) {
  const supabase = getAdminClient();

  // Insert in-app notification (notifications table exists from initial schema)
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
    // Don't crash if notifications table has issues
  }

  // Send push
  await sendPushToUser(userId, {
    title,
    body: message,
    url: link || "/dashboard",
    tag: type,
  });
}
