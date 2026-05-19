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
 *
 * SERVER-ONLY: this module imports next/headers (via posthog-server) and
 * Node-only crypto (via push). The `server-only` marker fails fast at
 * build time if a Client Component ever imports it directly; callers
 * (school.ts service etc.) reach this via dynamic import so the bundler
 * doesn't pull it into client chunks.
 */
import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendPushToUser } from "@/lib/push";
import { captureServerEvent } from "@/lib/posthog-server";
import { getServerT } from "@/i18n/server";
import { getUsersLocale } from "@/lib/locale-utils";
import type { Locale } from "@/i18n";

export type CollabPriority = "info" | "important" | "urgent";

export type CollabRecordType =
  | "school_log"
  | "expense"
  // Saúde (migration 00080): 5 tabelas adotam a Foundation.
  // Doses/sintomas/growth/info ficam fora pra evitar spam (vide CLAUDE.md
  // "Saúde Foundation adoption" — adoção #3).
  | "medical_appointment"
  | "illness_episode"
  | "active_medication"
  | "child_allergy"
  | "vaccination_record"
  // Tamanhos (migration 00086): adoção #7. info priority por default.
  | "child_size"
  // future:
  // | "decision"
  // | "calendar_event"
  ;

interface NotifyCollabCreateArgs {
  recordType: CollabRecordType;
  recordId: string;
  groupId: string;
  actorUserId: string;
  priority: CollabPriority;
  /**
   * Push title — legacy string form. Use `titleKey` for localized pushes.
   * If both `title` and `titleKey` are provided, `titleKey` wins.
   */
  title?: string;
  /** Push body — legacy string form. Use `messageKey` for localized. */
  message?: string;
  /** Deep link for tap action — e.g. "/escola?highlight=<id>" */
  link?: string;
  /**
   * Localized push title. Translated PER RECIPIENT using their profile.locale.
   * Allows the same notification to fan out in different languages.
   * Example: titleKey="notifications.saude.appointmentTitle",
   *          titleVars={ actor: "Amanda" }
   */
  titleKey?: string;
  titleVars?: Record<string, string | number>;
  /** Localized push body. Same per-recipient resolution as titleKey. */
  messageKey?: string;
  messageVars?: Record<string, string | number>;
  /**
   * i18n key for the coalesced title (e.g.
   * "notifications.saude.coalescedSaudeCount"). Receives variables
   * { actor, count } at resolve time. When omitted, falls back to the
   * built-in coalescedTitle() helper which is pt-only.
   */
  coalescedTitleKey?: string;
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

    // i18n per recipient — resolves each user's locale once and renders
    // the push title/body/coalesced title in their language. Falls back
    // to legacy `title`/`message` strings when keys aren't provided.
    const recipientIds = members.map((m) => m.user_id);
    const localeByUser = await getUsersLocale(recipientIds);
    // Cache t() per locale so we only build the dictionary closure once
    // per locale, not once per recipient.
    const tByLocale = new Map<Locale, Awaited<ReturnType<typeof getServerT>>>();
    async function getT(locale: Locale) {
      const cached = tByLocale.get(locale);
      if (cached) return cached;
      const fn = await getServerT(locale);
      tByLocale.set(locale, fn);
      return fn;
    }

    await Promise.all(
      members.map(async (m) => {
        const locale = localeByUser.get(m.user_id) ?? ("pt" as Locale);
        const t = args.titleKey || args.messageKey || args.coalescedTitleKey
          ? await getT(locale)
          : null;

        // Resolve per-recipient strings. Keys win over literal strings.
        const recipientTitle = args.titleKey && t
          ? t(args.titleKey, args.titleVars)
          : (args.title ?? "");
        const recipientMessage = args.messageKey && t
          ? t(args.messageKey, args.messageVars)
          : (args.message ?? "");

        // Dedup key for coalescing — uses the LOCALIZED title so different
        // languages don't share a count. (In practice same user gets pushes
        // in same locale always, so this is correct.)
        const since = new Date(Date.now() - COALESCE_WINDOW_SECONDS * 1000).toISOString();
        const { count: recentCount } = await admin
          .from("notifications")
          .select("id", { count: "exact", head: true })
          .eq("user_id", m.user_id)
          .eq("type", notificationType)
          .eq("title", recipientTitle)
          .gte("created_at", since);

        // Always create the in-app notification row (inbox shows all).
        await admin.from("notifications").insert({
          user_id: m.user_id,
          type: notificationType,
          title: recipientTitle,
          message: recipientMessage,
          link: args.link || null,
          is_read: false,
        });

        // Compose the push payload. After this insert there are
        // (recentCount + 1) recent notifications. Coalesce when >1.
        const totalRecent = (recentCount || 0) + 1;
        const isCoalesced = totalRecent > 1;
        let pushTitle = recipientTitle;
        if (isCoalesced) {
          if (args.coalescedTitleKey && t) {
            pushTitle = t(args.coalescedTitleKey, {
              ...(args.titleVars ?? {}),
              count: totalRecent,
            });
          } else {
            pushTitle = coalescedTitle(args.recordType, recipientTitle, totalRecent);
          }
        }
        const pushBody = isCoalesced ? "" : recipientMessage;
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
          recipient_locale: locale,
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
  // Extract actor name. Convention é título começando com "<Name> <verb>"
  // — pra expenses o verbo é "registrou" (em vez de "adicionou"). Tentamos
  // ambos pra extrair o prefix correto.
  const actorPrefix =
    baseTitle.split(" adicionou")[0]?.split(" registrou")[0] ?? baseTitle;
  switch (recordType) {
    case "school_log":
      return `${actorPrefix} adicionou ${count} registros escolares`;
    case "expense":
      return `${actorPrefix} registrou ${count} despesas`;
    case "medical_appointment":
      return `${actorPrefix} agendou ${count} consultas`;
    case "illness_episode":
      return `${actorPrefix} registrou ${count} episódios de saúde`;
    case "active_medication":
      return `${actorPrefix} iniciou ${count} medicamentos`;
    case "child_allergy":
      return `${actorPrefix} cadastrou ${count} alergias`;
    case "vaccination_record":
      return `${actorPrefix} registrou ${count} vacinas`;
    case "child_size":
      return `${actorPrefix} atualizou ${count} tamanhos`;
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
    case "expense":
      return "/despesas";
    case "medical_appointment":
      // FIX 2026-05-17: era `/saude/agenda` (404). Rota correta: `/saude/consultas`.
      return "/saude/consultas";
    case "illness_episode":
      return "/saude/doencas";
    case "active_medication":
      return "/saude/medicamentos";
    case "child_allergy":
      return "/saude/alergias";
    case "vaccination_record":
      return "/saude/vacinas";
    case "child_size":
      // Tamanhos vivem no perfil da criança. Sem child_id no contexto do
      // coalesce, manda pra lista de filhos — user clica no nome certo.
      return "/criancas";
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
      case "expense":
        // Pra despesas, só "novas" são as que ainda esperam atenção do
        // user (pending ou cancel_pending). Aprovadas/rejeitadas/canceladas
        // são terminais — não fazem sentido como "novo".
        totalQuery = admin
          .from("expenses")
          .select("id", { count: "exact", head: false })
          .eq("group_id", args.groupId)
          .in("status", ["pending", "cancel_pending"]);
        break;
      // ── Saúde (5 record types) ──
      // Consultas: só upcoming/scheduled contam como "novo" — passadas/
      // canceladas viram histórico (terminal).
      case "medical_appointment":
        totalQuery = admin
          .from("medical_appointments")
          .select("id", { count: "exact", head: false })
          .eq("group_id", args.groupId)
          .in("status", ["scheduled"]);
        break;
      // Doenças: só episódios ativos importam pra "novo" — resolvidas
      // não voltam a ser awareness.
      case "illness_episode":
        totalQuery = admin
          .from("illness_episodes")
          .select("id", { count: "exact", head: false })
          .eq("group_id", args.groupId)
          .eq("status", "active");
        break;
      // Medicamentos ativos: status='active' filtra os em uso. Concluídos
      // (end_date no passado) viram histórico.
      case "active_medication":
        totalQuery = admin
          .from("active_medications")
          .select("id", { count: "exact", head: false })
          .eq("group_id", args.groupId)
          .eq("status", "active");
        break;
      // Alergias: todas relevantes (não tem terminal/ativa). Coparente
      // sempre precisa saber quem tem o quê.
      case "child_allergy":
        totalQuery = admin
          .from("child_allergies")
          .select("id", { count: "exact", head: false })
          .eq("group_id", args.groupId);
        break;
      // Vacinas: todas relevantes (cartão é histórico cumulativo).
      case "vaccination_record":
        totalQuery = admin
          .from("vaccination_records")
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
