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
 *
 * v1 ("1h antes pra tudo") era simples mas inadequado por contexto:
 *   - Médico às 8h da manhã → push T-60 = 7h da manhã = user perde
 *   - Jiu Jitsu → 1h não dá pra preparar uniforme + kit
 *   - Buscar na escola T-30min = ideal (sair de casa)
 *
 * v2 (premium): default por **categoria** da atividade. Backwards-compatible
 * — só aplica quando `child_activities.reminder_lead_minutes IS NULL`. User
 * que setou explícito mantém sua preferência.
 *
 * Smart defaults derivados de research informal + UX comum de família:
 *   - medical, dentist, exam       → -2 (véspera 20h BRT — prepara documento/jejum)
 *   - birthday                     → -2 (véspera — comprar presente)
 *   - class, sport, lesson         → 180 (T-3h — uniforme, material, lanche)
 *   - school, pickup, dropoff      → 30 (T-30min — sair de casa)
 *   - meeting, parents             → 60 (T-1h — preparar contexto)
 *   - other / sem categoria        → 60 (T-1h — fallback v1)
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
 * Lead default por categoria da atividade. Aplicado apenas quando a row
 * tem `reminder_lead_minutes IS NULL`. Caso a categoria não bata em nenhum
 * branch, cai pro DEFAULT_LEAD_MINUTES = 60min.
 *
 * Exportado pra testes e pra UI mostrar preview do default em criar/editar
 * atividade ("Padrão pra Médico: véspera 20h").
 */
export function categoryDefaultLead(category: string | null | undefined): number {
  const c = (category ?? "").toLowerCase().trim();
  // Saúde (preparação na véspera é o que separa "tomei café" de "perdi consulta")
  if (c === "medical" || c === "dentist" || c === "exam" || c === "health") {
    return SENTINEL_EVENING_BEFORE; // -2
  }
  // Aniversários e datas — precisa comprar presente / lembrar
  if (c === "birthday" || c === "anniversary") {
    return SENTINEL_EVENING_BEFORE; // -2
  }
  // Aulas e esportes — uniforme, material, lanche
  if (c === "class" || c === "lesson" || c === "sport" || c === "extracurricular") {
    return 180; // T-3h
  }
  // Logística de escola — sair de casa
  if (c === "school" || c === "pickup" || c === "dropoff" || c === "daycare") {
    return 30; // T-30min
  }
  // Reuniões e contextuais
  if (c === "meeting" || c === "parents" || c === "therapy") {
    return 60; // T-1h
  }
  return DEFAULT_LEAD_MINUTES;
}

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
    // Smart default por categoria quando user não setou lead explícito.
    // Médico véspera 20h, aula T-3h, pickup T-30min, etc. — vide
    // categoryDefaultLead() pra tabela completa + rationale UX.
    const leadMinutes = occ.reminder_lead_minutes ?? categoryDefaultLead(occ.category);
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
 * Briefing Matinal (07:00 BRT). Pra cada user com 1+ atividade HOJE, agrega
 * tudo num único push ritual de manhã.
 *
 * Filosofia "pai cansado" (UX rationale):
 *   - Substitui o digest noturno 20h. Pais que dormem cedo perdiam; quem
 *     acorda às 5h pra trabalhar, 12h depois tava obsoleto.
 *   - 7h é o momento ritual: café, primeiro celular do dia, planejamento.
 *   - 1 push agregado é melhor que 6 fragmentos ao longo do dia.
 *   - Body inclui RESPONSÁVEL ("você leva" vs "Aline leva") — resolve a
 *     pergunta tácita "quem vai buscar?". Conflito #1 de coparente.
 *
 * Agregação: PER-USER (não per-group). Um user em múltiplos grupos recebe
 * UM briefing único cobrindo todas suas crianças/atividades. O digest legado
 * era per-group → user com 2 grupos recebia 2 pushes consecutivos.
 *
 * Filtros:
 *   - is_active = true (ignora atividades pausadas)
 *   - reminder_lead_minutes ≠ 0 (respeita opt-out por atividade)
 *   - User é responsable OU member do grupo (todos veem a agenda do grupo)
 *
 * Idempotência: 1 row por (user_id, channel='briefing', activity_id=âncora,
 * date=hoje). Re-rodar no mesmo dia = 0 dup. Âncora = primeira activity
 * (alfabética) do user pra ter PK estável.
 *
 * Recipient locale: getServerT(locale) per user — body localizado pro
 * locale dele (pt/en/es/fr/de). Mesma mecânica de runActivityDueReminders.
 */
export async function sendMorningBriefing(now: Date = new Date()): Promise<SendResult> {
  const admin = createAdminClient();
  let sent = 0;
  let skipped = 0;
  let errors = 0;

  // Briefing cobre o DIA DE HOJE — diferente do digest legado que olhava amanhã.
  // Rationale: pais querem saber "o que vou fazer ao acordar?", não "o que terei
  // que fazer daqui 24h?". Combina com o cron T-lead que cobre lembretes
  // intra-dia se algo precisar de aviso mais próximo.
  const todayKey = now.toISOString().slice(0, 10);

  // Query: occurrences de hoje + atividade ativa + grupo + criança +
  // responsible_id + checklist count.
  const { data: rawOccs, error } = await admin
    .from("calendar_occurrences")
    .select(
      "id, activity_id, occurrence_date, group_id, child_id, " +
        "child_activities!inner(name, category, time_start, location, responsible_id, " +
        "reminder_lead_minutes, is_active, " +
        "activity_checklist_items(id), " +
        "children(full_name))",
    )
    .eq("occurrence_date", todayKey);

  if (error) {
    console.error("[CRON morning-briefing] query failed:", error);
    return { sent: 0, skipped: 0, errors: 1 };
  }
  if (!rawOccs || rawOccs.length === 0) return { sent: 0, skipped: 0, errors: 0 };

  type BriefingRow = {
    activity_id: string;
    group_id: string;
    child_id: string | null;
    activity_name: string;
    category: string;
    time_start: string | null;
    location: string | null;
    responsible_id: string | null;
    child_name: string | null;
    checklistCount: number;
  };

  const rows: BriefingRow[] = (rawOccs as unknown as Array<{
    activity_id: string;
    group_id: string;
    child_id: string | null;
    child_activities:
      | {
          name: string;
          category: string;
          time_start: string | null;
          location: string | null;
          responsible_id: string | null;
          reminder_lead_minutes: number | null;
          is_active: boolean | null;
          activity_checklist_items: { id: string }[] | null;
          children: { full_name: string | null } | { full_name: string | null }[] | null;
        }
      | Array<{
          name: string;
          category: string;
          time_start: string | null;
          location: string | null;
          responsible_id: string | null;
          reminder_lead_minutes: number | null;
          is_active: boolean | null;
          activity_checklist_items: { id: string }[] | null;
          children: { full_name: string | null } | { full_name: string | null }[] | null;
        }>;
  }>).flatMap((row) => {
    const act = Array.isArray(row.child_activities) ? row.child_activities[0] : row.child_activities;
    if (!act || act.is_active === false) return [];
    if (act.reminder_lead_minutes === 0) return [];
    const child = Array.isArray(act.children) ? act.children[0] : act.children;
    return [
      {
        activity_id: row.activity_id,
        group_id: row.group_id,
        child_id: row.child_id,
        activity_name: act.name,
        category: act.category,
        time_start: act.time_start,
        location: act.location,
        responsible_id: act.responsible_id,
        child_name: child?.full_name ?? null,
        checklistCount: (act.activity_checklist_items ?? []).length,
      },
    ];
  });

  if (rows.length === 0) return { sent: 0, skipped: 0, errors: 0 };

  // Membership: pra cada grupo, mapa user_id → role. Usado tanto pra
  // descobrir os recipients quanto pra montar o "você leva" vs "X leva".
  const groupIds = Array.from(new Set(rows.map((r) => r.group_id)));
  const { data: members } = await admin
    .from("group_members")
    .select("group_id, user_id")
    .in("group_id", groupIds)
    .in("role", ["admin", "member"]);

  // user_id → set of group_ids the user is in
  const userGroups = new Map<string, Set<string>>();
  for (const m of (members ?? []) as { group_id: string; user_id: string }[]) {
    const set = userGroups.get(m.user_id) ?? new Set<string>();
    set.add(m.group_id);
    userGroups.set(m.user_id, set);
  }

  // Resolve nome do responsável (display first name) pra todos os
  // responsible_ids encontrados — bulk pra evitar N+1.
  const responsibleIds = Array.from(
    new Set(rows.map((r) => r.responsible_id).filter((id): id is string => !!id)),
  );
  const { data: respProfiles } = responsibleIds.length > 0
    ? await admin
        .from("profiles")
        .select("id, full_name")
        .in("id", responsibleIds)
    : { data: [] };
  const respFirstName = new Map<string, string>();
  for (const p of (respProfiles ?? []) as { id: string; full_name: string | null }[]) {
    const first = (p.full_name ?? "").trim().split(" ")[0];
    if (first) respFirstName.set(p.id, first);
  }

  // Per-user aggregation. User vê SOMENTE atividades dos grupos em que é
  // membro (privacy + relevância).
  type UserBriefing = { userId: string; items: BriefingRow[] };
  const briefingsByUser = new Map<string, UserBriefing>();
  for (const r of rows) {
    for (const [userId, groups] of userGroups.entries()) {
      if (!groups.has(r.group_id)) continue;
      const ub = briefingsByUser.get(userId) ?? { userId, items: [] };
      ub.items.push(r);
      briefingsByUser.set(userId, ub);
    }
  }

  if (briefingsByUser.size === 0) return { sent: 0, skipped: 0, errors: 0 };

  // Localize per user.
  const allUserIds = Array.from(briefingsByUser.keys());
  const tByUser = await buildTByUser(allUserIds);

  // Idempotência: check sends prévios pro briefing de hoje (canal='briefing').
  // Âncora = primeira atividade alfabética do briefing do user (estável).
  const { data: priorSends } = await admin
    .from("activity_reminder_sends")
    .select("user_id, activity_id")
    .eq("occurrence_date", todayKey)
    .eq("channel", "briefing")
    .in("user_id", allUserIds);
  const alreadySent = new Set(
    (priorSends ?? []).map((p: { user_id: string }) => p.user_id),
  );

  for (const { userId, items } of briefingsByUser.values()) {
    if (alreadySent.has(userId)) {
      skipped += 1;
      continue;
    }

    // Sort: time_start crescente (atividades sem hora vão pro fim).
    const sorted = items.slice().sort((a, b) => {
      const ta = a.time_start ?? "99:99";
      const tb = b.time_start ?? "99:99";
      return ta.localeCompare(tb);
    });

    const t = tByUser.get(userId);
    const total = sorted.length;
    const totalChecklistItems = sorted.reduce((acc, r) => acc + r.checklistCount, 0);

    // Title: "🌅 Hoje: 3 compromissos" / "🌅 Hoje: 1 compromisso"
    const title = t
      ? t("reminders.briefing.title", { count: total })
      : `🌅 Hoje: ${total} compromisso${total > 1 ? "s" : ""}`;

    // Body: linha por atividade (até 3 itens), formato:
    //   "09h Otto na Natação (Aline) · 14h Martim no Inglês (você)"
    // > 3 itens: "09h Otto · 14h Martim · 18h Festa +2"
    const previewCount = Math.min(3, total);
    const previewLines: string[] = [];
    for (let i = 0; i < previewCount; i++) {
      const r = sorted[i];
      const timeShort = r.time_start ? r.time_start.slice(0, 5) : "";
      const childFirst = (r.child_name ?? "").trim().split(" ")[0];

      // Responsable badge: "(você)" se userId === responsible_id;
      // "(Aline)" se outro membro; "" se NULL (atividade do grupo todo).
      let respBadge = "";
      if (r.responsible_id) {
        if (r.responsible_id === userId) {
          respBadge = t
            ? ` (${t("reminders.briefing.respYou")})`
            : " (você)";
        } else {
          const name = respFirstName.get(r.responsible_id);
          if (name) respBadge = ` (${name})`;
        }
      }

      const pieces: string[] = [];
      if (timeShort) pieces.push(timeShort);
      if (childFirst) pieces.push(childFirst);
      pieces.push(r.activity_name);
      previewLines.push(pieces.join(" ") + respBadge);
    }

    let body = previewLines.join(" · ");
    if (total > previewCount) {
      const extra = total - previewCount;
      body += t
        ? ` ${t("reminders.briefing.moreCount", { count: extra })}`
        : ` +${extra}`;
    }
    if (totalChecklistItems > 0) {
      body += t
        ? ` · ${t("reminders.briefing.itemsToPrep", { count: totalChecklistItems })}`
        : ` · ${totalChecklistItems} ${totalChecklistItems === 1 ? "item" : "itens"} pra preparar`;
    }

    // Deep link: agenda de hoje. Se 1 atividade só, link direto pra ela.
    const link = total === 1
      ? `/atividades/${sorted[0].activity_id}?occurrence=${todayKey}&briefing=1`
      : `/calendario?date=${todayKey}&briefing=1`;

    // Âncora pra idempotência: primeira atividade alfabética.
    const anchorActivityId = sorted
      .map((r) => r.activity_id)
      .slice()
      .sort()[0];

    try {
      // Briefing é info (não interrompe Foco/DND) — pais querem checar de
      // manhã, não ser acordados. iOS Time-Sensitive OFF, Android importance
      // default. Quem quer som forte → cron T-lead pré-evento cobre.
      await createNotificationWithPush(userId, "activity_digest", title, body, link);
      await admin.from("activity_reminder_sends").insert({
        activity_id: anchorActivityId,
        occurrence_date: todayKey,
        lead_minutes: SENTINEL_MORNING_OF,
        user_id: userId,
        channel: "briefing",
      });
      captureServerEvent(userId, "activity_reminder_sent", {
        channel: "briefing",
        activity_count: total,
        checklist_count: totalChecklistItems,
        items_with_time: sorted.filter((r) => !!r.time_start).length,
        items_user_responsible: sorted.filter((r) => r.responsible_id === userId).length,
      });
      sent += 1;
    } catch (e) {
      console.error("[CRON morning-briefing] push fail:", e);
      errors += 1;
    }
  }

  return { sent, skipped, errors };
}

/**
 * @deprecated use sendMorningBriefing instead. Mantido só pra back-compat de
 * callers que ainda importam o nome antigo (drop em sprint futuro).
 */
export const sendDailyActivityDigest = sendMorningBriefing;
