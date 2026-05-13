/**
 * Collaborative Records Foundation — Server Service
 *
 * Single source of truth for "collaborative record" behavior in Kindar.
 * Used by school today, will be adopted by Saúde, Decisões, Financeiro,
 * Calendário, Ocorrências.
 *
 * See migration 00077_collab_foundation.sql for the schema and CLAUDE.md
 * "Foundation: Collaborative Records" for the adoption checklist.
 *
 * Responsibilities:
 *   - Notify coparents on create with priority-aware push.
 *   - Push coalescing: a stable `tag` per (group, type, actor) so a burst
 *     of pushes within 60s collapses into one device notification —
 *     "Amanda adicionou 3 registros escolares" replaces the earlier popup.
 *   - Auto-mark creator as read (DB trigger handles for school_logs; this
 *     helper exists for modules that don't have a trigger yet).
 *   - Server-side analytics: notification_sent, urgent_created.
 *
 * Read receipts are written by the CLIENT calling the `mark_collab_read`
 * RPC when the user opens a record detail. Server doesn't auto-mark on
 * list fetch — that defeats the purpose of read receipts.
 */
import { createAdminClient } from "@/lib/supabase/admin";
import { sendPushToUser } from "@/lib/push";
import { captureServerEvent } from "@/lib/posthog-server";

export type CollabPriority = "info" | "important" | "urgent";

export type CollabRecordType =
  | "school_log"
  // future:
  // | "decision"
  // | "health_event"
  // | "expense"
  ;

interface NotifyCollabCreateArgs {
  recordType: CollabRecordType;
  recordId: string;
  groupId: string;
  actorUserId: string;
  priority: CollabPriority;
  /** Push title — "Amanda adicionou um registro escolar" */
  title: string;
  /** Push body — single-line description; "Prova de Inglês" */
  message: string;
  /** Deep link for tap action — e.g. "/escola?highlight=<id>" */
  link?: string;
}

const COALESCE_WINDOW_SECONDS = 60;

/**
 * Build a push tag that GROUPS pushes within the same coalesce window but
 * SEPARATES pushes across windows. Without the time bucket, a push sent
 * 5 minutes after a burst would replace the old aggregated notification
 * on the device — user loses history if they hadn't seen the first wave.
 *
 * Bucket = floor(now / window). Two pushes in the same bucket share the
 * tag and replace each other (coalesce). A push in the next bucket has a
 * new tag and stays as a separate notification.
 */
function coalesceTag(
  recipientId: string,
  recordType: CollabRecordType,
  actorUserId: string,
  groupId: string,
  bucket: number,
): string {
  return `${recordType}:${groupId}:${actorUserId}:${recipientId}:${bucket}`;
}

/**
 * Notify all non-actor group members (admin/member roles) that a
 * collaborative record was created. Implements push coalescing so a
 * burst of records within 60s shows as one aggregated notification
 * ("Amanda adicionou 3 registros escolares") instead of N popups.
 *
 * Always inserts the in-app notification row — coalescing only affects
 * the device push, not the inbox. The inbox shows individual entries.
 *
 * Fails silently: never throws. The originating action (createSchoolLog,
 * etc.) must not be reverted because of a notification failure.
 */
export async function notifyCollabCreate(args: NotifyCollabCreateArgs): Promise<void> {
  try {
    const admin = createAdminClient();

    // Co-parents to notify (exclude actor, exclude readonly roles).
    const { data: members } = await admin
      .from("group_members")
      .select("user_id, role")
      .eq("group_id", args.groupId)
      .neq("user_id", args.actorUserId)
      .in("role", ["admin", "member"]);

    if (!members || members.length === 0) return;

    const notificationType = `${args.recordType}_created`;
    // Time bucket pra rotacionar a tag de push: pushes na mesma janela
    // de 60s compartilham bucket e se substituem no device; pushes em
    // janelas diferentes ganham buckets distintos e não se sobrescrevem.
    const bucket = Math.floor(Date.now() / (COALESCE_WINDOW_SECONDS * 1000));
    // O caller passa um title constante por actor (ex: "Amanda adicionou
    // um registro escolar") que serve tanto como dedup-key da contagem
    // (eq exato abaixo) quanto como input pra coalescedTitle. Esse título
    // é hardcoded em pt-BR no service do módulo (school, etc) — gap
    // conhecido pra i18n do push body (Fase 2 quando precisar).

    await Promise.all(
      members.map(async (m) => {
        // Count recent notifications to this recipient FROM THE SAME ACTOR.
        // Matched por eq EXATO no title base (e.g. "Amanda adicionou um
        // registro escolar") em vez de prefix-like — assim "Amanda" não
        // colide com "Amanda Silva" quando ambas existem no grupo.
        // Coalesced titles têm forma diferente ("Amanda adicionou 2
        // registros escolares") e portanto não interferem na contagem.
        // Counting BEFORE insert: count=0 → individual push; ≥1 → agregado.
        const since = new Date(Date.now() - COALESCE_WINDOW_SECONDS * 1000).toISOString();
        const { count: recentCount } = await admin
          .from("notifications")
          .select("id", { count: "exact", head: true })
          .eq("user_id", m.user_id)
          .eq("type", notificationType)
          .eq("title", args.title)
          .gte("created_at", since);

        // Always create the in-app notification row (inbox shows all).
        await admin.from("notifications").insert({
          user_id: m.user_id,
          type: notificationType,
          title: args.title,
          message: args.message,
          link: args.link || null,
          is_read: false,
        });

        // Compose the push payload. After this insert there are
        // (recentCount + 1) recent notifications. Coalesce when >1.
        const totalRecent = (recentCount || 0) + 1;
        const isCoalesced = totalRecent > 1;
        const pushTitle = isCoalesced
          ? coalescedTitle(args.recordType, args.title, totalRecent)
          : args.title;
        const pushBody = isCoalesced ? "" : args.message;
        const pushLink = isCoalesced
          ? collabModuleHome(args.recordType)
          : (args.link || collabModuleHome(args.recordType));

        await sendPushToUser(m.user_id, {
          title: pushTitle,
          body: pushBody,
          url: pushLink,
          tag: coalesceTag(m.user_id, args.recordType, args.actorUserId, args.groupId, bucket),
        });

        // Telemetry — one event per recipient. Coalesced flag for analytics.
        captureServerEvent(m.user_id, "notification_sent", {
          record_type: args.recordType,
          actor_user_id: args.actorUserId,
          priority: args.priority,
          coalesced: isCoalesced,
          coalesced_count: totalRecent,
        });
      }),
    );

    // Actor-side telemetry — track urgent creations for the dashboard
    // metric the user asked for. Info/important not captured here to
    // keep PostHog usage focused.
    if (args.priority === "urgent") {
      captureServerEvent(args.actorUserId, "urgent_created", {
        record_type: args.recordType,
      });
    }
  } catch {
    // Silent: notification is best-effort, never block the create.
  }
}

/**
 * Aggregated push title for coalesced bursts. Derives the right plural
 * form from the actor-side title + record_type. Title is the singular
 * sentence — e.g. "Amanda adicionou um registro escolar" — we transform
 * to "Amanda adicionou 3 registros escolares".
 *
 * Per-record-type pluralization keeps copy natural. Add a case when a
 * new module adopts.
 */
function coalescedTitle(recordType: CollabRecordType, baseTitle: string, count: number): string {
  // Extract actor name from the front of `baseTitle` — convention is
  // "<Name> adicionou ..." — we keep "<Name> adicionou N registros..."
  // pattern stable.
  const actorPrefix = baseTitle.split(" adicionou")[0];
  switch (recordType) {
    case "school_log":
      return `${actorPrefix} adicionou ${count} registros escolares`;
    default:
      return `${actorPrefix} adicionou ${count} registros`;
  }
}

/**
 * Per-module deep link for coalesced pushes (which don't point to a
 * specific record). Each module adds its home route.
 */
function collabModuleHome(recordType: CollabRecordType): string {
  switch (recordType) {
    case "school_log":
      return "/escola";
    default:
      return "/dashboard";
  }
}

/**
 * Unread count for a (user, group, record_type) tuple. Used by the
 * dashboard badge and tab indicators.
 *
 * Definition of "unread": record exists in the module's table AND there
 * is no matching row in collab_reads for this user. Excludes records
 * created by the user (the auto-read trigger handles that).
 *
 * Returns 0 on any error — analytics/UX feature, never blocks render.
 */
export async function unreadCollabCount(args: {
  userId: string;
  groupId: string;
  recordType: CollabRecordType;
}): Promise<number> {
  try {
    const admin = createAdminClient();
    // Module-specific source table — keep this lookup explicit (not
    // dynamic SQL) so each adoption is a deliberate code change.
    let totalQuery;
    switch (args.recordType) {
      case "school_log":
        totalQuery = admin
          .from("school_logs")
          .select("id", { count: "exact", head: false })
          .eq("group_id", args.groupId);
        break;
      default:
        return 0;
    }
    const { data: rows } = await totalQuery;
    if (!rows || rows.length === 0) return 0;

    const ids = rows.map((r: { id: string }) => r.id);
    const { data: reads } = await admin
      .from("collab_reads")
      .select("record_id")
      .eq("record_type", args.recordType)
      .eq("user_id", args.userId)
      .in("record_id", ids);

    const readSet = new Set((reads || []).map((r: { record_id: string }) => r.record_id));
    return ids.filter((id) => !readSet.has(id)).length;
  } catch {
    return 0;
  }
}
