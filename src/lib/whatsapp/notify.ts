/* ------------------------------------------------------------------ */
/* WhatsApp Notifications                                             */
/*                                                                     */
/* Send notifications to group members who have WhatsApp linked.       */
/* Respects per-type preferences in `whatsapp_notification_preferences`.*/
/* Fire-and-forget — errors are logged but never thrown.               */
/* ------------------------------------------------------------------ */

import { createAdminClient } from "@/lib/supabase/admin";
import { sendTextMessage, sendButtonMessage } from "./client";
import { encodeApproval, ApprovalEntity } from "./approvals";

export type NotificationKind =
  | "expense"
  | "event"
  | "custody"
  | "approval"
  | "daily_summary";

const PREF_COLUMN: Record<NotificationKind, string> = {
  expense: "expense_notifications",
  event: "event_reminders",
  custody: "custody_alerts",
  approval: "custody_alerts", // approvals follow the same toggle as custody alerts
  daily_summary: "daily_summary",
};

/* ------------------------------------------------------------------ */
/* Resolve recipients: phone numbers for active+verified WhatsApp      */
/* links, filtered by per-type preference.                             */
/* ------------------------------------------------------------------ */

interface Recipient {
  phone: string;
  userId: string;
}

async function resolveRecipients(
  groupId: string,
  excludeUserId: string,
  kind: NotificationKind,
): Promise<Recipient[]> {
  const admin = createAdminClient();

  const { data: members } = await admin
    .from("group_members")
    .select("user_id")
    .eq("group_id", groupId)
    .neq("user_id", excludeUserId);
  if (!members || members.length === 0) return [];
  const userIds = members.map((m) => m.user_id);

  const { data: waLinks } = await admin
    .from("whatsapp_phone_links")
    .select("phone_number, user_id")
    .in("user_id", userIds)
    .eq("is_active", true)
    .not("verified_at", "is", null);
  if (!waLinks || waLinks.length === 0) return [];

  const prefCol = PREF_COLUMN[kind];
  const { data: prefs } = await admin
    .from("whatsapp_notification_preferences")
    .select(
      "user_id, expense_notifications, event_reminders, custody_alerts, daily_summary",
    )
    .in("user_id", waLinks.map((l) => l.user_id));

  const optedOut = new Set(
    (prefs || [])
      .filter(
        (p) => (p as unknown as Record<string, unknown>)[prefCol] === false,
      )
      .map((p) => p.user_id),
  );

  return waLinks
    .filter((l) => !optedOut.has(l.user_id))
    .map((l) => ({
      phone: l.phone_number.replace("+", ""),
      userId: l.user_id,
    }));
}

/* ------------------------------------------------------------------ */
/* Plain text broadcast to group members                               */
/* ------------------------------------------------------------------ */

export async function notifyGroupViaWhatsApp(
  groupId: string,
  excludeUserId: string,
  message: string,
  kind: NotificationKind = "expense",
): Promise<void> {
  try {
    const recipients = await resolveRecipients(groupId, excludeUserId, kind);
    await Promise.allSettled(
      recipients.map((r) => sendTextMessage(r.phone, message)),
    );
  } catch (error) {
    console.error("[WA-NOTIFY] Error:", error instanceof Error ? error.message : error);
  }
}

/* ------------------------------------------------------------------ */
/* Approval request: send button card to a SPECIFIC user (target).     */
/* Caller passes the targetUserId (e.g. swap_request.target_user_id).  */
/* ------------------------------------------------------------------ */

export async function notifyApprovalRequest(args: {
  targetUserId: string;
  entity: ApprovalEntity;
  entityId: string;
  body: string;
  approveLabel?: string;
  rejectLabel?: string;
}): Promise<void> {
  try {
    const admin = createAdminClient();

    const { data: link } = await admin
      .from("whatsapp_phone_links")
      .select("phone_number, user_id")
      .eq("user_id", args.targetUserId)
      .eq("is_active", true)
      .not("verified_at", "is", null)
      .maybeSingle();
    if (!link) return;

    const { data: pref } = await admin
      .from("whatsapp_notification_preferences")
      .select("custody_alerts")
      .eq("user_id", args.targetUserId)
      .maybeSingle();
    if (pref && pref.custody_alerts === false) return;

    const phone = link.phone_number.replace("+", "");
    await sendButtonMessage(phone, args.body, [
      {
        id: encodeApproval({ verb: "approve", entity: args.entity, id: args.entityId }),
        title: args.approveLabel || "Aprovar",
      },
      {
        id: encodeApproval({ verb: "reject", entity: args.entity, id: args.entityId }),
        title: args.rejectLabel || "Recusar",
      },
    ]);
  } catch (error) {
    console.error(
      "[WA-NOTIFY] Approval error:",
      error instanceof Error ? error.message : error,
    );
  }
}
