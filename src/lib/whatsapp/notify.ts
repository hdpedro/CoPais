/* ------------------------------------------------------------------ */
/* WhatsApp Notifications                                             */
/* Send notifications to group members who have WhatsApp linked        */
/* ------------------------------------------------------------------ */

import { createAdminClient } from "@/lib/supabase/admin";
import { sendTextMessage } from "./client";

/**
 * Notify other group members via WhatsApp about an event.
 * Only sends to members who have verified WhatsApp links.
 * Fire-and-forget — errors are logged but never thrown.
 */
export async function notifyGroupViaWhatsApp(
  groupId: string,
  excludeUserId: string,
  message: string
): Promise<void> {
  try {
    const admin = createAdminClient();

    // Get all group members except the sender
    const { data: members } = await admin
      .from("group_members")
      .select("user_id")
      .eq("group_id", groupId)
      .neq("user_id", excludeUserId);

    if (!members || members.length === 0) return;

    const userIds = members.map((m) => m.user_id);

    // Get WhatsApp links for these members
    const { data: waLinks } = await admin
      .from("whatsapp_phone_links")
      .select("phone_number, user_id")
      .in("user_id", userIds)
      .eq("is_active", true)
      .not("verified_at", "is", null);

    if (!waLinks || waLinks.length === 0) return;

    // Check notification preferences
    const { data: prefs } = await admin
      .from("whatsapp_notification_preferences")
      .select("user_id, expense_notifications, event_reminders, custody_alerts")
      .in("user_id", waLinks.map((l) => l.user_id));

    const prefsMap = new Map(
      (prefs || []).map((p) => [p.user_id, p])
    );

    // Send to each linked member
    await Promise.allSettled(
      waLinks.map(async (link) => {
        // Check if user has disabled notifications (default: enabled)
        const userPrefs = prefsMap.get(link.user_id);
        if (userPrefs?.expense_notifications === false) return;

        const phone = link.phone_number.replace("+", "");
        await sendTextMessage(phone, message);
      })
    );
  } catch (error) {
    console.error("[WA-NOTIFY] Error:", error instanceof Error ? error.message : error);
  }
}
