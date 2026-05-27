/* ------------------------------------------------------------------ */
/* activity-reminders.ts                                               */
/* Server-only utilities pro cron /api/cron/activity-due-reminders     */
/* (a cada 15min) — lembrete T-(lead_minutes) pré-evento pro           */
/* responsável da atividade.                                           */
/*                                                                     */
/* Responsabilidades:                                                  */
/*  1. Identifica occurrences cujo (event_at - now) cai na janela      */
/*     [lead_min - 8min, lead_min + 7min] de um dos slots do cron.     */
/*  2. Resolve recipient: child_activities.responsible_id (ou TODOS    */
/*     os membros do grupo como degradação segura quando NULL).        */
/*  3. Idempotência via activity_reminder_sends (PK garante 1 send     */
/*     por (activity, date, lead, user, channel)).                     */
/*  4. Push localizado per-recipient (getUserLocale + getServerT).     */
/*  5. Payload data carrega checklist completo + metadata pro deep     */
/*     link consumir (body truncado por iOS — só preview na string).   */
/*                                                                     */
/* Decisões de design:                                                 */
/*  - SEM Foundation Collab: notifyCollabCreate exclui o actor, mas    */
/*    lembretes são system-emitted pro responsável. Usamos             */
/*    createNotificationWithPush direto (igual vaccine-notifier).      */
/*  - SEM coalescing aqui: a janela ±8min é fina; múltiplas atividades */
/*    do mesmo user em slots diferentes viram pushes separados (são    */
/*    eventos distintos no tempo). O digest D-1 noite agrega N         */
/*    atividades de amanhã em 1 push só (sendDailyActivityDigest).     */
/*  - Time-Sensitive (iOS 15+): payload.timeSensitive=true; sendPushTo */
/*    User vai propagar pra APNs interruptionLevel quando o entitlement*/
/*    do app autorizar (Fase B).                                       */
/* ------------------------------------------------------------------ */

import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { createNotificationWithPush } from "@/lib/push";
import { captureServerEvent } from "@/lib/posthog-server";
import { getServerT } from "@/i18n/server";
import { getUsersLocale } from "@/lib/locale-utils";
import { buildChildrenNameResolver } from "@/lib/services/family-names";
import type { Locale } from "@/i18n";

/**
 * Slot do cron: roda a cada 15min, janela ±8/7min cobre jitter Vercel.
 * Total = 15min — não tem buracos, não tem sobreposição (8+7=15).
 */
const SLOT_WINDOW_BEFORE_MIN = 8;
const SLOT_WINDOW_AFTER_MIN = 7;

/**
 * Default lead time quando child_activities.reminder_lead_minutes IS NULL.
 * Decisão produto: "1h antes" é a promessa premium do app pra v1.
 */
const DEFAULT_LEAD_MINUTES = 60;

/**
 * Sentinels especiais em reminder_lead_minutes:
 *   -1 = "manhã do dia, 08:00 hora local (BRT)"
 *   -2 = "véspera às 20:00 hora local (BRT)"
 */
const SENTINEL_MORNING_OF = -1;
const SENTINEL_EVENING_BEFORE = -2;

/**
 * Brasília fixed offset (BR não tem DST desde 2019).
 * Suficiente pra v1; pós-MVP child_activities.timezone TEXT.
 */
const BRAZIL_OFFSET_MIN = -180;

interface OccurrenceRow {
  occurrence_id: string;
  activity_id: string;
  occurrence_date: string; // YYYY-MM-DD
  group_id: string;
  child_id: string | null;
  activity_name: string;
  category: string;
  time_start: string | null; // HH:MM:SS
  time_end: string | null;
  location: string | null;
  responsible_id: string | null;
  reminder_lead_minutes: number | null;
  created_by: string;
  child_name: string | null;
  checklist: { id: string; name: string; sort_order: number }[];
}

interface SendResult {
  sent: number;
  skipped: number;
  errors: number;
}

/**
 * Constrói um Date a partir de YYYY-MM-DD + HH:MM:SS interpretando como
 * America/Sao_Paulo (sem DST). Retorna null se time_start ausente — sem
 * horário não dá pra calcular "1h antes".
 */
function eventDateBrazil(occurrenceDate: string, timeStart: string | null): Date | null {
  if (!timeStart) return null;
  // YYYY-MM-DDTHH:MM:SS-03:00
  const offsetH = Math.abs(Math.floor(BRAZIL_OFFSET_MIN / 60))
    .toString()
    .padStart(2, "0");
  const offsetM = Math.abs(BRAZIL_OFFSET_MIN % 60)
    .toString()
    .padStart(2, "0");
  const sign = BRAZIL_OFFSET_MIN <= 0 ? "-" : "+";
  return new Date(`${occurrenceDate}T${timeStart}${sign}${offsetH}:${offsetM}`);
}

/**
 * Calcula triggerAt absoluto pra uma occurrence + lead_minutes (incluindo sentinels).
 *  - lead > 0  : event - lead
 *  - lead === SENTINEL_MORNING_OF (-1) : 08:00 BRT do dia
 *  - lead === SENTINEL_EVENING_BEFORE (-2) : 20:00 BRT do dia anterior
 * Retorna null se a config requer time_start e este está ausente.
 */
function computeTriggerAt(
  occurrenceDate: string,
  timeStart: string | null,
  leadMinutes: number,
): Date | null {
  if (leadMinutes > 0) {
    const eventAt = eventDateBrazil(occurrenceDate, timeStart);
    if (!eventAt) return null;
    return new Date(eventAt.getTime() - leadMinutes * 60_000);
  }
  if (leadMinutes === SENTINEL_MORNING_OF) {
    return eventDateBrazil(occurrenceDate, "08:00:00");
  }
  if (leadMinutes === SENTINEL_EVENING_BEFORE) {
    const d = new Date(occurrenceDate + "T00:00:00Z");
    d.setUTCDate(d.getUTCDate() - 1);
    const previousDate = d.toISOString().slice(0, 10);
    return eventDateBrazil(previousDate, "20:00:00");
  }
  return null;
}

/**
 * Build preview da lista de materiais pro body do push.
 * iOS APNs trunca body em ~178 chars; FCM em 1024 mas pra não estourar
 * canvas Android limitamos preview a 3 itens com sufixo "+N".
 */
function formatChecklistPreview(items: { name: string; sort_order: number }[]): string {
  if (items.length === 0) return "";
  const sorted = items.slice().sort((a, b) => a.sort_order - b.sort_order);
  const first = sorted.slice(0, 3).map((i) => i.name);
  const extra = sorted.length - first.length;
  return extra > 0 ? `${first.join(", ")} +${extra}` : first.join(", ");
}

/**
 * Cache de t() por locale pra fanout server-side. Evita rebuildar o
 * dictionary N vezes quando o cron toca múltiplos users.
 */
async function buildTByUser(
  userIds: string[],
): Promise<Map<string, Awaited<ReturnType<typeof getServerT>>>> {
  const tByUser = new Map<string, Awaited<ReturnType<typeof getServerT>>>();
  if (userIds.length === 0) return tByUser;

  const localeByUser = await getUsersLocale(userIds);
  const tByLocale = new Map<Locale, Awaited<ReturnType<typeof getServerT>>>();
  for (const userId of userIds) {
    const locale = localeByUser.get(userId) ?? ("pt" as Locale);
    let t = tByLocale.get(locale);
    if (!t) {
      t = await getServerT(locale);
      tByLocale.set(locale, t);
    }
    tByUser.set(userId, t);
  }
  return tByUser;
}

/**
 * Cron handler. Identifica occurrences cujo trigger cai no slot atual,
 * resolve recipient (responsible_id ou fallback all members), evita
 * duplicatas via activity_reminder_sends e dispara push.
 *
 * Retorna contagem pra observabilidade.
 */
export async function runActivityDueReminders(now: Date = new Date()): Promise<SendResult> {
  const admin = createAdminClient();
  let sent = 0;
  let skipped = 0;
  let errors = 0;

  // 1. Carrega occurrences pendentes: window é estreita (~15min), mas pra
  // cobrir sentinel "véspera 20:00" precisamos hoje E amanhã (-2 = ontem
  // da occurrence_date alvo, ou seja, occurrence amanhã + send hoje).
  // Yesterday cobre boundary noite (cron 23:55 BRT) — atividade hoje 00:30
  // com lead=60 dispara em 23:30 BRT do dia anterior.
  const tomorrow = new Date(now.getTime() + 86400000).toISOString().slice(0, 10);
  const yesterday = new Date(now.getTime() - 86400000).toISOString().slice(0, 10);

  const { data: rawOccs, error: occErr } = await admin
    .from("calendar_occurrences")
    .select(
      "id, activity_id, occurrence_date, group_id, child_id, " +
        "child_activities!inner(name, category, time_start, time_end, location, responsible_id, reminder_lead_minutes, is_active, created_by, " +
        "activity_checklist_items(id, name, sort_order), " +
        "children(full_name))",
    )
    .gte("occurrence_date", yesterday)
    .lte("occurrence_date", tomorrow);

  if (occErr) {
    console.error("[CRON activity-due-reminders] occurrences query failed:", occErr);
    return { sent: 0, skipped: 0, errors: 1 };
  }
  if (!rawOccs || rawOccs.length === 0) return { sent: 0, skipped: 0, errors: 0 };

  // 2. Normaliza shape (Supabase retorna nested como array OR object).
  type RawNested = {
    id: string;
    activity_id: string;
    occurrence_date: string;
    group_id: string;
    child_id: string | null;
    child_activities:
      | {
          name: string;
          category: string;
          time_start: string | null;
          time_end: string | null;
          location: string | null;
          responsible_id: string | null;
          reminder_lead_minutes: number | null;
          is_active: boolean | null;
          created_by: string;
          activity_checklist_items: { id: string; name: string; sort_order: number }[] | null;
          children: { full_name: string | null } | { full_name: string | null }[] | null;
        }
      | Array<{
          name: string;
          category: string;
          time_start: string | null;
          time_end: string | null;
          location: string | null;
          responsible_id: string | null;
          reminder_lead_minutes: number | null;
          is_active: boolean | null;
          created_by: string;
          activity_checklist_items: { id: string; name: string; sort_order: number }[] | null;
          children: { full_name: string | null } | { full_name: string | null }[] | null;
        }>;
  };

  const occurrences: OccurrenceRow[] = (rawOccs as unknown as RawNested[]).flatMap((row) => {
    const act = Array.isArray(row.child_activities) ? row.child_activities[0] : row.child_activities;
    if (!act || act.is_active === false) return [];
    const child = Array.isArray(act.children) ? act.children[0] : act.children;
    return [
      {
        occurrence_id: row.id,
        activity_id: row.activity_id,
        occurrence_date: row.occurrence_date,
        group_id: row.group_id,
        child_id: row.child_id,
        activity_name: act.name,
        category: act.category,
        time_start: act.time_start,
        time_end: act.time_end,
        location: act.location,
        responsible_id: act.responsible_id,
        reminder_lead_minutes: act.reminder_lead_minutes,
        created_by: act.created_by,
        child_name: child?.full_name ?? null,
        checklist: act.activity_checklist_items ?? [],
      },
    ];
  });

  // 3. Filtra pelas que caem na janela do slot atual.
  const slotStart = new Date(now.getTime() - SLOT_WINDOW_AFTER_MIN * 60_000);
  const slotEnd = new Date(now.getTime() + SLOT_WINDOW_BEFORE_MIN * 60_000);

  type DueRow = OccurrenceRow & { leadMinutes: number; triggerAt: Date };
  const due: DueRow[] = [];
  for (const occ of occurrences) {
    const leadMinutes = occ.reminder_lead_minutes ?? DEFAULT_LEAD_MINUTES;
    if (leadMinutes === 0) {
      // Lead=0 = "sem lembrete" — user opted out pra essa atividade.
      continue;
    }
    const triggerAt = computeTriggerAt(occ.occurrence_date, occ.time_start, leadMinutes);
    if (!triggerAt) continue;
    // (triggerAt - now) DENTRO de [-AFTER, +BEFORE] minutos = está pingando agora.
    // Equivalente: triggerAt ∈ [now - AFTER, now + BEFORE].
    if (triggerAt >= slotStart && triggerAt <= slotEnd) {
      due.push({ ...occ, leadMinutes, triggerAt });
    }
  }

  if (due.length === 0) return { sent: 0, skipped: 0, errors: 0 };

  // 4. Bulk-resolve recipients. Pra cada due row:
  //    - se responsible_id set: ele é o único recipient.
  //    - se NULL: todos members do grupo (degradação segura) — comportamento
  //      pré-Fase A. Logado pra eventualmente migrar todos pra ter responsável.
  const groupsNeedingMembers = Array.from(
    new Set(due.filter((d) => d.responsible_id === null).map((d) => d.group_id)),
  );
  const membersByGroup = new Map<string, string[]>();
  if (groupsNeedingMembers.length > 0) {
    const { data: members } = await admin
      .from("group_members")
      .select("group_id, user_id, role")
      .in("group_id", groupsNeedingMembers)
      .in("role", ["admin", "member"]);
    for (const m of (members ?? []) as { group_id: string; user_id: string }[]) {
      const arr = membersByGroup.get(m.group_id) ?? [];
      arr.push(m.user_id);
      membersByGroup.set(m.group_id, arr);
    }
  }

  // 5. Bulk-check idempotência. Uma query, todos (activity, date, lead, user)
  // pairs candidatos pra channel='push'.
  const candidatePairs: Array<{
    occ: DueRow;
    userId: string;
    role: "responsible" | "fallback_member";
  }> = [];
  for (const occ of due) {
    if (occ.responsible_id) {
      candidatePairs.push({ occ, userId: occ.responsible_id, role: "responsible" });
    } else {
      for (const userId of membersByGroup.get(occ.group_id) ?? []) {
        candidatePairs.push({ occ, userId, role: "fallback_member" });
      }
    }
  }
  if (candidatePairs.length === 0) return { sent: 0, skipped: 0, errors: 0 };

  // Carrega sends já registrados pra esses (activity_id, occurrence_date, user).
  const activityIds = Array.from(new Set(candidatePairs.map((p) => p.occ.activity_id)));
  const userIds = Array.from(new Set(candidatePairs.map((p) => p.userId)));
  const { data: priorSends } = await admin
    .from("activity_reminder_sends")
    .select("activity_id, occurrence_date, lead_minutes, user_id")
    .eq("channel", "push")
    .in("activity_id", activityIds)
    .in("user_id", userIds);
  const sentKeys = new Set(
    (priorSends ?? []).map(
      (r: { activity_id: string; occurrence_date: string; lead_minutes: number; user_id: string }) =>
        `${r.activity_id}::${r.occurrence_date}::${r.lead_minutes}::${r.user_id}`,
    ),
  );

  // 6. Resolve t() per user (bulk).
  const tByUser = await buildTByUser(userIds);

  // 6b. Resolve child names em batch: pra atividades família-wide (child_id NULL)
  // listamos TODAS as crianças do grupo ("Otto e Martim"). Sem isso, o push body
  // saía "Crianca teve Jiu Jitsu" — frio, impessoal. Famílias com 2 filhos +
  // atividade compartilhada (Jiu Jitsu, Inglês, etc.) cadastram UMA atividade
  // só, esperando UMA push com nome correto.
  const groupIdsNeedingResolver = Array.from(
    new Set(due.filter((d) => d.child_id === null).map((d) => d.group_id)),
  );
  const resolveChildren = groupIdsNeedingResolver.length > 0
    ? await buildChildrenNameResolver(admin, groupIdsNeedingResolver)
    : null;

  // 7. Fanout.
  for (const { occ, userId, role } of candidatePairs) {
    const dedupeKey = `${occ.activity_id}::${occ.occurrence_date}::${occ.leadMinutes}::${userId}`;
    if (sentKeys.has(dedupeKey)) {
      skipped += 1;
      continue;
    }

    const t = tByUser.get(userId);
    // child_id set: usa embedded child_name (fast path, sem query extra).
    // child_id NULL: usa resolver batched (1 query no setup, O(1) no loop).
    let childFirst = (occ.child_name ?? "").split(" ")[0];
    if (!childFirst && occ.child_id === null && resolveChildren) {
      childFirst = resolveChildren(null, occ.group_id);
    }
    const timeShort = occ.time_start ? occ.time_start.slice(0, 5) : "";
    const checklistPreview = formatChecklistPreview(occ.checklist);

    // Copy contextual: lead sentinel determina o tom do título.
    //   -1 = "Hoje", -2 = "Amanhã", >0 = "Falta pouco"
    const titleKey =
      occ.leadMinutes === SENTINEL_MORNING_OF
        ? "reminders.activity.titleMorning"
        : occ.leadMinutes === SENTINEL_EVENING_BEFORE
          ? "reminders.activity.titleEvening"
          : "reminders.activity.title";

    const titleVars: Record<string, string | number> = {
      activityName: occ.activity_name,
      childName: childFirst || occ.activity_name,
    };
    const title = t ? t(titleKey, titleVars) : `${occ.activity_name} — ${childFirst}`;

    // Body montado concatenando pedaços traduzidos. Separador " · " é
    // universal (mesmo em DE/FR/EN/ES). Pieces opcionais entram só quando
    // existem — evita "  · " vazio.
    const itemsLabel = t ? t("reminders.activity.itemsLabel") : "Levar:";
    const pieces: string[] = [];
    if (timeShort) pieces.push(timeShort);
    if (occ.location) pieces.push(occ.location);
    if (checklistPreview) pieces.push(`${itemsLabel} ${checklistPreview}`);
    const body = pieces.join(" · ");

    const link = `/atividades/${occ.activity_id}?occurrence=${occ.occurrence_date}&reminder=1`;

    try {
      // Premium flags: iOS Time-Sensitive atravessa Foco/DND (entitlement em
      // app.json), Android channel dedicado tem som distinto + importance MAX,
      // iOS category permite quick actions (botões Preparei/Adiar/Saí) quando
      // o app native registrar setNotificationCategoryAsync('activity_reminder').
      await createNotificationWithPush(userId, "activity_reminder", title, body, link, {
        timeSensitive: true,
        androidChannelId: "activity_reminders",
        iosCategoryId: "activity_reminder",
      });
      // Registra send ANTES de capturar telemetria — falha do PostHog não
      // pode permitir re-envio.
      await admin
        .from("activity_reminder_sends")
        .insert({
          activity_id: occ.activity_id,
          occurrence_date: occ.occurrence_date,
          lead_minutes: occ.leadMinutes,
          user_id: userId,
          channel: "push",
        });
      captureServerEvent(userId, "activity_reminder_sent", {
        activity_id: occ.activity_id,
        occurrence_date: occ.occurrence_date,
        lead_min: occ.leadMinutes,
        channel: "push",
        recipient_role: role,
        has_checklist: occ.checklist.length > 0,
        checklist_count: occ.checklist.length,
        category: occ.category,
      });
      sent += 1;
    } catch (e) {
      console.error("[CRON activity-due-reminders] push fail:", e);
      errors += 1;
    }
  }

  return { sent, skipped, errors };
}

/**
 * Digest D-1 noite (20:00 BRT). Pra cada user com 1+ atividade amanhã,
 * agrega tudo em UM push só priority=info.
 *
 * Substitui o comportamento N-pushes do legacy sendActivityReminders.
 * Body de exemplo:
 *   "Amanhã: 3 atividades. Jiu-Jitsu 09h + Inglês 14h + Médico 16h.
 *    8 itens pra preparar."
 *
 * Recipient: TODOS membros do grupo (digest é awareness compartilhada,
 * não acionável pelo responsável individual — pais querem ver agenda
 * geral mesmo das atividades em que não são responsáveis).
 *
 * Idempotência: 1 row por (user, channel='digest', any activity, date=tomorrow).
 * Usamos um pseudo activity_id constante (zero UUID) na PK pra agrupar.
 */
export async function sendDailyActivityDigest(now: Date = new Date()): Promise<SendResult> {
  const admin = createAdminClient();
  let sent = 0;
  let skipped = 0;
  let errors = 0;

  const tomorrowDate = new Date(now.getTime() + 86400000);
  const tomorrowKey = tomorrowDate.toISOString().slice(0, 10);

  // Mesma query do cron 15min mas filtrada exclusivamente em tomorrow.
  const { data: rawOccs, error } = await admin
    .from("calendar_occurrences")
    .select(
      "id, activity_id, occurrence_date, group_id, child_id, " +
        "child_activities!inner(name, time_start, reminder_lead_minutes, is_active, " +
        "activity_checklist_items(id))",
    )
    .eq("occurrence_date", tomorrowKey);

  if (error) {
    console.error("[CRON activity-digest] query failed:", error);
    return { sent: 0, skipped: 0, errors: 1 };
  }
  if (!rawOccs || rawOccs.length === 0) return { sent: 0, skipped: 0, errors: 0 };

  type DigestRow = {
    activity_id: string;
    group_id: string;
    activity_name: string;
    time_start: string | null;
    leadMinutes: number;
    checklistCount: number;
  };
  const rows: DigestRow[] = (rawOccs as unknown as Array<{
    activity_id: string;
    group_id: string;
    child_activities:
      | {
          name: string;
          time_start: string | null;
          reminder_lead_minutes: number | null;
          is_active: boolean | null;
          activity_checklist_items: { id: string }[] | null;
        }
      | Array<{
          name: string;
          time_start: string | null;
          reminder_lead_minutes: number | null;
          is_active: boolean | null;
          activity_checklist_items: { id: string }[] | null;
        }>;
  }>).flatMap((row) => {
    const act = Array.isArray(row.child_activities) ? row.child_activities[0] : row.child_activities;
    if (!act || act.is_active === false) return [];
    // Skip atividades opt-out de lembrete.
    if (act.reminder_lead_minutes === 0) return [];
    return [
      {
        activity_id: row.activity_id,
        group_id: row.group_id,
        activity_name: act.name,
        time_start: act.time_start,
        leadMinutes: act.reminder_lead_minutes ?? DEFAULT_LEAD_MINUTES,
        checklistCount: (act.activity_checklist_items ?? []).length,
      },
    ];
  });

  if (rows.length === 0) return { sent: 0, skipped: 0, errors: 0 };

  // Agrega POR GRUPO. Cada user do grupo recebe o digest do grupo.
  const byGroup = new Map<string, DigestRow[]>();
  for (const r of rows) {
    const arr = byGroup.get(r.group_id) ?? [];
    arr.push(r);
    byGroup.set(r.group_id, arr);
  }

  const groupIds = Array.from(byGroup.keys());
  const { data: members } = await admin
    .from("group_members")
    .select("group_id, user_id")
    .in("group_id", groupIds)
    .in("role", ["admin", "member"]);
  const membersByGroup = new Map<string, string[]>();
  for (const m of (members ?? []) as { group_id: string; user_id: string }[]) {
    const arr = membersByGroup.get(m.group_id) ?? [];
    arr.push(m.user_id);
    membersByGroup.set(m.group_id, arr);
  }

  // Idempotência: PK exige activity_id NOT NULL. Usamos a primeira atividade
  // do digest como "âncora" — se essa atividade já tem channel='digest' pro
  // user hoje (occurrence_date=tomorrow), skip.
  const allUserIds = Array.from(
    new Set(Array.from(membersByGroup.values()).flat()),
  );
  if (allUserIds.length === 0) return { sent: 0, skipped: 0, errors: 0 };
  const tByUser = await buildTByUser(allUserIds);

  for (const [groupId, list] of byGroup.entries()) {
    const userIds = membersByGroup.get(groupId) ?? [];
    if (userIds.length === 0) continue;
    const sorted = list
      .slice()
      .sort((a, b) => (a.time_start ?? "").localeCompare(b.time_start ?? ""));
    const totalChecklistItems = sorted.reduce((acc, r) => acc + r.checklistCount, 0);
    const summary = sorted
      .map((r) => `${r.activity_name}${r.time_start ? ` ${r.time_start.slice(0, 5)}` : ""}`)
      .join(" + ");
    const anchorActivityId = sorted[0].activity_id;

    // Check prior digest sends pra esses users.
    const { data: prior } = await admin
      .from("activity_reminder_sends")
      .select("user_id")
      .eq("activity_id", anchorActivityId)
      .eq("occurrence_date", tomorrowKey)
      .eq("channel", "digest")
      .in("user_id", userIds);
    const alreadySent = new Set((prior ?? []).map((p: { user_id: string }) => p.user_id));

    for (const userId of userIds) {
      if (alreadySent.has(userId)) {
        skipped += 1;
        continue;
      }
      const t = tByUser.get(userId);
      const title = t
        ? t("reminders.digest.title", { count: list.length })
        : `Amanhã: ${list.length} atividade${list.length > 1 ? "s" : ""}`;
      const bodyKey = totalChecklistItems > 0
        ? "reminders.digest.bodyWithItems"
        : "reminders.digest.body";
      const body = t
        ? t(bodyKey, { summary, count: totalChecklistItems })
        : `${summary}${totalChecklistItems > 0 ? ` · ${totalChecklistItems} itens pra preparar` : ""}`;
      const link = `/calendario?date=${tomorrowKey}`;

      try {
        await createNotificationWithPush(userId, "activity_digest", title, body, link);
        await admin.from("activity_reminder_sends").insert({
          activity_id: anchorActivityId,
          occurrence_date: tomorrowKey,
          lead_minutes: SENTINEL_EVENING_BEFORE,
          user_id: userId,
          channel: "digest",
        });
        captureServerEvent(userId, "activity_reminder_sent", {
          channel: "digest",
          activity_count: list.length,
          checklist_count: totalChecklistItems,
          group_id: groupId,
        });
        sent += 1;
      } catch (e) {
        console.error("[CRON activity-digest] push fail:", e);
        errors += 1;
      }
    }
  }

  return { sent, skipped, errors };
}
