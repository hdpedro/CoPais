import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/supabase/auth-helper";
// Server-side i18n — reads cookie (set by middleware on first visit from
// Accept-Language, or by LanguageSelector when user explicitly chooses).
// Without this, every label fabricated below would default to pt-BR forever.
import { getRequestLocale, getServerT } from "@/i18n/server";
import {
  resolveTodayCustody,
  resolveCustodyOnDate,
  findNextCustodyHandover,
  computeCustodyStreak,
  type CustodyEvent as CustodyEventRow,
} from "@/lib/custody-resolve";
import { getCachedProfileByUser, getCachedMembers, getCachedChildren } from "@/lib/cached-queries";
import { getSignedFileUrl } from "@/lib/storage-signed-url";
import { getActiveGroup } from "@/lib/group-utils";
import { autoAcceptPendingInvitations } from "@/actions/invitation";
import { getGroupSubscription, trialDaysRemaining } from "@/lib/billing";
import { getQuestProgress } from "@/actions/onboarding-quest";
import TrialBanner from "@/components/billing/TrialBanner";
import OnboardingQuest from "@/components/billing/OnboardingQuest";
import { formatDateKey, computeSwapBalance, getBrazilNow, getBrazilToday, type CustodyEvent, type ParentColorMap } from "@/lib/calendar-utils";
import { buildCustodyHero } from "@/lib/custody-hero";
import {
  resolveRoutineOnDate,
  buildRoutineToday,
  type RoutineSlot,
  type RoutineOverride,
  type ResolvedRoutine,
  type RoutineToday,
} from "@/lib/care-routine-resolve";
import { composeAttention } from "@/lib/briefing";
import { buildChildJourney, type JourneyItem } from "@/lib/care-routine-journey";
// getOccurrences removed — occurrences are pre-computed in calendar_occurrences table
import { PARENT_COLORS, getDisplayName } from "@/lib/constants";
import dynamic from "next/dynamic";
import type { DashboardClientProps } from "./DashboardClient";

// Increase Vercel function timeout for dashboard SSR (many parallel DB queries)
export const maxDuration = 60;

const DashboardClient = dynamic(() => import("./DashboardClient"), {
  loading: () => (
    <div className="space-y-4 animate-pulse">
      <div className="h-8 bg-gray-200 rounded w-48" />
      <div className="h-4 bg-gray-100 rounded w-64" />
      <div className="h-32 bg-gray-200 rounded-xl" />
      <div className="h-20 bg-gray-100 rounded-xl" />
    </div>
  ),
});

export default async function DashboardPage() {
  // Server-side timestamp; react-hooks/purity flags Date.now() during render
  // but server components legitimately need a timestamp for relative-time
  // computations. The disable kept being flagged as "unused" by older lint
  // configs; if it errors again as unused, leave the comment and re-run —
  // ESLint flat config can disagree across cache states.
  const nowMs = Date.now(); // eslint-disable-line react-hooks/purity
  const { supabase, user } = await getSessionUser();
  if (!user) redirect("/login");

  // Locale resolution — runs once per request. `t` is synchronous below.
  // Date/number formatting downstream uses `intlLocale` (BCP 47 region tag,
  // e.g. "pt-BR" for "pt") for proper Intl.DateTimeFormat output.
  const locale = await getRequestLocale();
  const t = await getServerT(locale);
  const intlLocale: Record<string, string> = {
    pt: "pt-BR",
    en: "en-US",
    es: "es-ES",
    fr: "fr-FR",
    de: "de-DE",
  };
  const bcp47 = intlLocale[locale] ?? "pt-BR";

  // Locale-aware short weekday list — declared early because activity-merge
  // loops below (around L461/L496) need it for dayLabel formatting. Width
  // "short" gives 3-letter forms via CLDR. Anchor on a known Sunday
  // (Jan 4 1970) so getDay() returns 0..6 mapping into Sun..Sat.
  const weekdayFormatterShort = new Intl.DateTimeFormat(bcp47, { weekday: "short" });
  const dayNamesShort = Array.from({ length: 7 }, (_, i) => {
    const anchor = new Date(Date.UTC(1970, 0, 4 + i, 12)); // Sunday + i
    return weekdayFormatterShort.format(anchor);
  });

  // === BATCH 1: profile (cached) + activeGroup (parallel) ===
  const [profile, activeGroup] = await Promise.all([
    getCachedProfileByUser(user.id),
    getActiveGroup(supabase, user.id),
  ]);

  if (!activeGroup) {
    // Try to auto-accept any pending invitation for this user's email
    // This handles the case where invite token was lost during signup redirect chain
    const accepted = await autoAcceptPendingInvitations();
    if (accepted) {
      // Reload page — now memberships will exist
      redirect("/dashboard");
    }
    redirect("/onboarding");
  }

  const { groupId, groupName, isReadonly, custodyEnabled } = activeGroup;

  // === BATCH 2: members + children (CACHED — 5 min) ===
  const [members, children] = await Promise.all([
    getCachedMembers(groupId),
    getCachedChildren(groupId),
  ]);

  const parentColors: ParentColorMap = {};
  members?.forEach((m, i) => {
    const p = m.profiles as unknown as { full_name: string | null } | null;
    parentColors[m.user_id] = {
      name: getDisplayName(p?.full_name, true),
      color: i === 0 ? PARENT_COLORS.primary : PARENT_COLORS.secondary,
    };
  });

  // === BATCH 3: ALL remaining queries in parallel (need groupId + user.id) ===
  // Use Brazil timezone to avoid UTC offset bugs (e.g. Saturday 21h BRT = Sunday UTC)
  const todayStr = getBrazilToday(); // "YYYY-MM-DD" in Brazil timezone
  const todayParts = todayStr.split("-").map(Number);
  const now = new Date(todayParts[0], todayParts[1] - 1, todayParts[2], 12, 0, 0);
  const today = todayStr;
  const monthStart = `${todayParts[0]}-${String(todayParts[1]).padStart(2, "0")}-01`;
  const nextMonth = new Date(todayParts[0], todayParts[1], 1);
  const monthEnd = `${nextMonth.getFullYear()}-${String(nextMonth.getMonth() + 1).padStart(2, "0")}-01`;
  const yesterday = new Date(now); yesterday.setDate(yesterday.getDate() - 1);
  const fourteenDays = new Date(now); fourteenDays.setDate(fourteenDays.getDate() + 14);
  const sevenDaysAhead = new Date(now); sevenDaysAhead.setDate(sevenDaysAhead.getDate() + 7);
  const threeMonthsAgo = new Date(todayParts[0], todayParts[1] - 1 - 3, 1);
  const threeMonthsAhead = new Date(todayParts[0], todayParts[1] - 1 + 4, 0);
  const weekStart = new Date(now);
  const dow = weekStart.getDay();
  weekStart.setDate(weekStart.getDate() - (dow === 0 ? 6 : dow - 1));
  const weekEnd = new Date(weekStart); weekEnd.setDate(weekEnd.getDate() + 6);
  // Pre-compute activity date range keys (needed for activities + social events queries below)
  const todayKey = todayStr;
  const tomorrowDate = new Date(now); tomorrowDate.setDate(tomorrowDate.getDate() + 1);
  const tomorrowKey = formatDateKey(tomorrowDate);
  const sevenDaysOut = new Date(now); sevenDaysOut.setDate(sevenDaysOut.getDate() + 7);
  const sevenDaysKey = formatDateKey(sevenDaysOut);

  // Consolidated: fetch ALL custody_events for the broadest range (3 months) in a single query,
  // then filter in-memory for today, future, upcoming, and week views.
  const [
    { data: allCustodyEvents },
    { data: monthExpenses },
    { data: pendingSwaps },
    { data: activeMedications },
    { data: criticalAllergies },
    { data: upcomingAppointments },
    { data: activeIllnesses },
    { data: recentCheckins },
    { data: pendingExpenses },
    { data: openDecisions },
    { data: activityOccurrences },
    { data: dashSocialEvents },
    { data: pastOccurrences },
    { data: todayReportsRaw },
  ] = await Promise.all([
    // Single custody_events query covering 3-month range (replaces 5 separate queries)
    // Skip entirely when custody is not enabled (saves a DB query)
    custodyEnabled
      ? supabase.from("custody_events")
          .select("id, start_date, end_date, responsible_user_id, child_id, custody_type, notes, group_id, created_by, children(full_name), profiles!custody_events_responsible_user_id_fkey(full_name)")
          .eq("group_id", groupId).gte("end_date", formatDateKey(threeMonthsAgo))
          .lte("start_date", formatDateKey(threeMonthsAhead)).order("start_date")
          .then(r => r, () => ({ data: [] as never[] }))
      : Promise.resolve({ data: [] as never[] }),
    // Monthly expenses
    supabase.from("expenses")
      .select("amount, paid_by, status, split_ratio")
      .eq("group_id", groupId).gte("expense_date", monthStart).lt("expense_date", monthEnd)
      .then(r => r, () => ({ data: [] as never[] })),
    // Pending swaps (skip when custody not enabled)
    custodyEnabled
      ? supabase.from("swap_requests")
          // swap_requests não tem coluna `type` no schema (ver initial_schema.sql);
          // remover evita PostgREST 400 + spam "column does not exist" no postgres.log.
          .select("id, status, created_at, original_date, proposed_date, reason, requester_id, target_user_id, requester:profiles!swap_requests_requester_id_fkey(full_name)")
          .eq("group_id", groupId).eq("status", "pending").eq("target_user_id", user.id)
          .order("created_at", { ascending: false }).limit(3)
          .then(r => r, () => ({ data: [] as never[] }))
      : Promise.resolve({ data: [] as never[] }),
    // Active medications — apenas cursos agudos (com end_date definida).
    // Medicacao sem end_date = uso continuo/cronico, fica fora da home pra
    // evitar poluicao visual; ainda visivel em /saude/medicamentos.
    supabase.from("active_medications")
      .select("id, name, dosage, frequency, child_id, children(full_name)")
      .eq("group_id", groupId).eq("status", "active")
      .not("end_date", "is", null)
      .order("created_at", { ascending: false }).limit(5)
      .then(r => r, () => ({ data: [] as never[] })),
    // Critical allergies
    supabase.from("child_allergies")
      .select("id, name, severity, allergy_type, child_id, children(full_name)")
      .eq("group_id", groupId).in("severity", ["severe", "moderate"]).limit(5)
      .then(r => r, () => ({ data: [] as never[] })),
    // Upcoming appointments
    supabase.from("medical_appointments")
      .select("id, title, appointment_date, status, child_id, children(full_name), medical_professionals(name, specialty)")
      .eq("group_id", groupId).eq("status", "scheduled")
      .gte("appointment_date", now.toISOString()).lte("appointment_date", sevenDaysAhead.toISOString())
      .order("appointment_date").limit(3)
      .then(r => r, () => ({ data: [] as never[] })),
    // Active illnesses
    supabase.from("illness_episodes")
      .select("id, title, symptoms, start_date, child_id, children(full_name)")
      .eq("group_id", groupId).eq("status", "active")
      .order("start_date", { ascending: false }).limit(3)
      .then(r => r, () => ({ data: [] as never[] })),
    // Recent check-ins
    supabase.from("daily_checkins")
      .select("id, category, title, description, checkin_date, created_at, child_id, logged_by, children(full_name), profiles!daily_checkins_logged_by_fkey(full_name)")
      .eq("group_id", groupId).gte("checkin_date", formatDateKey(yesterday))
      .order("created_at", { ascending: false }).limit(4)
      .then(r => r, () => ({ data: [] as never[] })),
    // Pending expenses awaiting MY approval (created by others, status=pending)
    supabase.from("expenses")
      .select("id, description, amount, category, expense_date, paid_by, profiles!expenses_paid_by_fkey(full_name)")
      .eq("group_id", groupId).eq("status", "pending").neq("paid_by", user.id)
      .order("created_at", { ascending: false }).limit(5)
      .then(r => r, () => ({ data: [] as never[] })),
    // Open decisions (for pending decisions widget)
    supabase.from("decisions")
      .select("id, title, category, deadline, status")
      .eq("group_id", groupId).eq("status", "aberta")
      .order("created_at", { ascending: false })
      .limit(20)
      .then(r => r, () => ({ data: [] as never[] })),
    // Activity occurrences for today through 7 days ahead (pre-computed, no runtime recurrence)
    supabase
      .from("calendar_occurrences")
      .select("occurrence_date, activity_id, child_activities!inner(id, name, category, time_start, time_end, location, child_id, responsible_id, children(full_name), activity_checklist_items(id, name))")
      .eq("group_id", groupId)
      .gte("occurrence_date", todayKey)
      .lte("occurrence_date", sevenDaysKey)
      .limit(100)
      .then(r => r, () => ({ data: [] as never[] })),
    // Social events for today/tomorrow/upcoming (moved from sequential to parallel)
    supabase
      .from("events")
      .select("id, title, event_date, event_time, location, child_id, status, assigned_to, children(full_name)")
      .eq("group_id", groupId)
      .neq("status", "cancelled")
      .gte("event_date", todayKey)
      .lte("event_date", sevenDaysKey)
      .then(r => r, () => ({ data: [] as never[] })),
    // Past activity occurrences for pending reports (last 7 days, EXCLUINDO
    // hoje). Atividade de hoje encerrada nao vai pra Pendentes — fica na
    // propria secao "Atividades de hoje" com pill "Relatar" inline (ver
    // bloco `todayActivities` abaixo). Isso evita duplicacao e mantem a
    // atividade no mesmo lugar onde o usuario espera ver.
    supabase
      .from("calendar_occurrences")
      .select("occurrence_date, activity_id, child_activities!inner(id, name, category, child_id, children(full_name))")
      .eq("group_id", groupId)
      .gte("occurrence_date", formatDateKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7)))
      .lt("occurrence_date", todayKey)
      .limit(200)
      .then(r => r, () => ({ data: [] as never[] })),
    // Reports de HOJE — usados pra marcar visualmente atividades ja
    // relatadas com check (vs as ainda pendentes, que recebem CTA inline).
    supabase
      .from("activity_reports")
      .select("activity_id")
      .eq("group_id", groupId)
      .eq("occurrence_date", todayKey)
      .then(r => r, () => ({ data: [] as never[] })),
  ]);

  // === SCHOOL UNREAD COUNT (Collab Foundation — Fase 1) ===
  // Count of school_logs the current user hasn't read yet. Drives the
  // dashboard "Escola · N novos" surface so a busy parent sees pending
  // school context without opening the module. Two queries, both indexed.
  const [{ data: schoolLogIdsForUnread }, { data: userSchoolReads }] = await Promise.all([
    supabase
      .from("school_logs")
      .select("id")
      .eq("group_id", groupId),
    supabase
      .from("collab_reads")
      .select("record_id")
      .eq("user_id", user.id)
      .eq("record_type", "school_log"),
  ]);
  const _schoolLogIdsAll = new Set(((schoolLogIdsForUnread || []) as { id: string }[]).map((r) => r.id));
  const _schoolReadIds = new Set(((userSchoolReads || []) as { record_id: string }[]).map((r) => r.record_id));
  const schoolUnreadCount = Array.from(_schoolLogIdsAll).filter((id) => !_schoolReadIds.has(id)).length;

  // === EXPENSES UNREAD COUNT (Collab Foundation — Fase 1B) ===
  // Mesmo padrão de school_logs mas só conta despesas que precisam de
  // atenção (pending / cancel_pending) — terminais não fazem sentido como "nova".
  const [{ data: expenseIdsForUnread }, { data: userExpenseReads }] = await Promise.all([
    supabase
      .from("expenses")
      .select("id")
      .eq("group_id", groupId)
      .in("status", ["pending", "cancel_pending"]),
    supabase
      .from("collab_reads")
      .select("record_id")
      .eq("user_id", user.id)
      .eq("record_type", "expense"),
  ]);
  const _expenseIdsAll = new Set(((expenseIdsForUnread || []) as { id: string }[]).map((r) => r.id));
  const _expenseReadIds = new Set(((userExpenseReads || []) as { record_id: string }[]).map((r) => r.record_id));
  const expensesUnreadCount = Array.from(_expenseIdsAll).filter((id) => !_expenseReadIds.has(id)).length;

  // === SAÚDE UNREAD COUNT (Collab Foundation — Fase 3, migration 00080) ===
  // Soma agregada dos 5 record_types de Saúde — appointments scheduled,
  // illness ativos, medications ativos, allergies, vaccines. Uma única
  // tile no dashboard ("Saúde · N novos") em vez de 5 separadas pra não
  // poluir. Tap leva pra /saude onde o user vê qual surface tem unread.
  // Status filters batem com unreadCollabCount em collab.ts (mesmo critério).
  const [
    { data: appointmentIdsForUnread },
    { data: illnessIdsForUnread },
    { data: medicationIdsForUnread },
    { data: allergyIdsForUnread },
    { data: vaccineIdsForUnread },
    { data: userSaudeReads },
  ] = await Promise.all([
    supabase.from("medical_appointments").select("id").eq("group_id", groupId).eq("status", "scheduled"),
    supabase.from("illness_episodes").select("id").eq("group_id", groupId).eq("status", "active"),
    supabase.from("active_medications").select("id").eq("group_id", groupId).eq("status", "active"),
    supabase.from("child_allergies").select("id").eq("group_id", groupId),
    supabase.from("vaccination_records").select("id").eq("group_id", groupId),
    supabase
      .from("collab_reads")
      .select("record_id, record_type")
      .eq("user_id", user.id)
      .in("record_type", [
        "medical_appointment",
        "illness_episode",
        "active_medication",
        "child_allergy",
        "vaccination_record",
      ]),
  ]);
  const _saudeReadsByType = new Map<string, Set<string>>();
  for (const r of ((userSaudeReads || []) as { record_id: string; record_type: string }[])) {
    if (!_saudeReadsByType.has(r.record_type)) {
      _saudeReadsByType.set(r.record_type, new Set());
    }
    _saudeReadsByType.get(r.record_type)!.add(r.record_id);
  }
  function _countUnreadFor(
    rt: string,
    rows: { id: string }[] | null | undefined,
  ): number {
    const reads = _saudeReadsByType.get(rt) || new Set();
    return ((rows || []) as { id: string }[]).filter((r) => !reads.has(r.id)).length;
  }
  const saudeUnreadCount =
    _countUnreadFor("medical_appointment", appointmentIdsForUnread) +
    _countUnreadFor("illness_episode", illnessIdsForUnread) +
    _countUnreadFor("active_medication", medicationIdsForUnread) +
    _countUnreadFor("child_allergy", allergyIdsForUnread) +
    _countUnreadFor("vaccination_record", vaccineIdsForUnread);

  // === SAÚDE PREVENTIVA — pendências vacinais reais (motor 00082) ===
  // Diferente de saudeUnread (awareness colaborativa). Aqui agregamos
  // overdue + due_soon de TODAS as crianças do grupo via view
  // `child_vaccine_coverage`. Tile aparece quando há pendência calma.
  const { data: vaccineCoverageRows } = await supabase
    .from("child_vaccine_coverage")
    .select("child_id, overdue_count, due_soon_count, total_taken, next_due_date, next_due_vaccine_name")
    .eq("group_id", groupId);
  // F#25 (E2E PRD 2026-05-25) — pra criança recém-cadastrada sem
  // NENHUM registro vacinal, o motor classificava doses como overdue
  // pela idade. Banner "1 reforço pendente: COVID-19 hoje" assustava
  // o user antes dele sequer ter adicionado o histórico. Fix: só
  // soma overdue/due_soon de crianças que JÁ TÊM algum registro
  // (`total_taken > 0`). Crianças zeradas viram "Adicione o histórico
  // vacinal" via outro caminho (card de saúde), não pendência alarmante.
  const vaccinePending = (vaccineCoverageRows || [])
    .filter((row) => Number(row.total_taken || 0) > 0)
    .reduce<{
      total: number;
      nextDueDate: string | null;
      nextDueVaccineName: string | null;
    }>(
      (acc, row) => {
        const overdue = Number(row.overdue_count || 0);
        const dueSoon = Number(row.due_soon_count || 0);
        acc.total += overdue + dueSoon;
        const rowDate = row.next_due_date as string | null;
        if (rowDate && (!acc.nextDueDate || rowDate < acc.nextDueDate)) {
          acc.nextDueDate = rowDate;
          acc.nextDueVaccineName = (row.next_due_vaccine_name as string | null) || null;
        }
        return acc;
      },
      { total: 0, nextDueDate: null, nextDueVaccineName: null },
    );

  // === CARE ROUTINE (Leva & Busca) — Fase 1 ===
  // Leitura minúscula e tolerante a falha (não bloqueia o painel): slots do
  // weekday de hoje + overrides do dia + arrangement do grupo. Resolvido em
  // memória (sem materialização). Reusa parentColors/children já carregados.
  const routineWeekday = new Date(todayKey + "T12:00:00").getDay();
  const tomorrowWeekday = new Date(tomorrowKey + "T12:00:00").getDay();
  const [
    { data: routineSlotsRaw },
    { data: routineOverridesRaw },
    { data: groupArrangementRow },
    { data: routineLogsRaw },
  ] = await Promise.all([
    supabase
      .from("care_routine_slots")
      .select("id, child_id, weekday, leg, pattern_type, responsible_id, time_of_day, label, week_parity")
      .eq("group_id", groupId)
      .in("weekday", [routineWeekday, tomorrowWeekday])
      .eq("is_active", true)
      .then((r) => r, () => ({ data: [] as never[] })),
    supabase
      .from("care_routine_overrides")
      .select("id, child_id, occurrence_date, leg, responsible_id, created_by")
      .eq("group_id", groupId)
      .in("occurrence_date", [todayKey, tomorrowKey])
      .then((r) => r, () => ({ data: [] as never[] })),
    supabase
      .from("coparenting_groups")
      .select("arrangement")
      .eq("id", groupId)
      .maybeSingle()
      .then((r) => r, () => ({ data: null })),
    supabase
      .from("care_routine_logs")
      .select("child_id, leg, status")
      .eq("group_id", groupId)
      .eq("occurrence_date", todayKey)
      .then((r) => r, () => ({ data: [] as never[] })),
  ]);
  // Mapa "childId:leg" → status (done/missed) das pernas JÁ registradas hoje.
  const routineLogsToday: Record<string, "done" | "missed"> = {};
  for (const l of (routineLogsRaw || []) as { child_id: string; leg: string; status: string }[]) {
    routineLogsToday[`${l.child_id}:${l.leg}`] = l.status as "done" | "missed";
  }
  const allRoutineSlots = (routineSlotsRaw || []) as unknown as RoutineSlot[];
  const allRoutineOverrides = (routineOverridesRaw || []) as unknown as RoutineOverride[];
  const routineSlots = allRoutineSlots.filter((s) => s.weekday === routineWeekday);
  const routineOverrides = allRoutineOverrides.filter((o) => o.occurrence_date === todayKey);
  const hasRoutineSlots = routineSlots.length > 0;
  const routineArrangement =
    ((groupArrangementRow as { arrangement?: string } | null)?.arrangement as
      | "rotating"
      | "together"
      | "single"
      | "custom") ?? "rotating";
  const routineChildren = (children || []).map((c) => ({
    id: (c as { id: string }).id,
    firstName: getDisplayName((c as { full_name: string | null }).full_name, true),
  }));
  // custody_based: o responsável da rotina deriva da guarda do dia.
  const routineCustodyResolver = (cid: string, dk: string) =>
    resolveCustodyOnDate((allCustodyEvents || []) as unknown as CustodyEventRow[], cid, dk)?.responsible_user_id ?? null;
  const routineResolvedByChild: Record<string, ResolvedRoutine> = {};
  for (const rc of routineChildren) {
    routineResolvedByChild[rc.id] = resolveRoutineOnDate(routineSlots, routineOverrides, rc.id, todayKey, routineCustodyResolver);
  }
  const routineToday: RoutineToday = buildRoutineToday(
    routineChildren,
    routineResolvedByChild,
    (uid) => parentColors[uid]?.name ?? getDisplayName(null, true),
    user.id,
  );

  // === Amanhã (briefing in-app) — resolve a rotina de amanhã (mesma query,
  // sem round-trip extra) e compõe um resumo compacto pro card. Só p/ together/
  // single (uma linha); split fica fora pra não poluir.
  const tmSlots = allRoutineSlots.filter((s) => s.weekday === tomorrowWeekday);
  const tmOverrides = allRoutineOverrides.filter((o) => o.occurrence_date === tomorrowKey);
  let routineTomorrowSummary: string | null = null;
  if (tmSlots.length > 0) {
    const tmResolvedByChild: Record<string, ResolvedRoutine> = {};
    for (const rc of routineChildren) {
      tmResolvedByChild[rc.id] = resolveRoutineOnDate(tmSlots, tmOverrides, rc.id, tomorrowKey, routineCustodyResolver);
    }
    const tmToday = buildRoutineToday(
      routineChildren,
      tmResolvedByChild,
      (uid) => parentColors[uid]?.name ?? getDisplayName(null, true),
      user.id,
    );
    if (tmToday.mode === "together") {
      const e = tmToday.entries[0];
      const parts: string[] = [];
      if (e.dropoff) parts.push(t("careRoutine.tomorrowDropoff", { name: e.dropoff.responsibleName }));
      if (e.pickup) parts.push(t("careRoutine.tomorrowPickup", { name: e.pickup.responsibleName }));
      if (parts.length > 0) routineTomorrowSummary = parts.join(" · ");
    }
  }

  // Ciência bilateral das trocas de HOJE (Foundation collab): quem trocou e se
  // o outro responsável já viu. Drives o badge "Aguardando ciência" (criador) +
  // o "Confirmar" (destinatário). Auto-mark marca o criador; "visto" = collab_reads
  // de um user ≠ criador.
  const routineOverrideRows = (routineOverridesRaw || []) as unknown as {
    id: string;
    leg: string;
    created_by: string | null;
  }[];
  let routineAwaitingTheirAck = false;
  const _pendingAckIds: string[] = [];
  const _pendingAckNames = new Set<string>();
  if (routineOverrideRows.length > 0) {
    const { data: routineCollabReads } = await supabase
      .from("collab_reads")
      .select("record_id, user_id")
      .eq("record_type", "care_routine_override")
      .in("record_id", routineOverrideRows.map((o) => o.id));
    const readsByOverride = new Map<string, Set<string>>();
    for (const r of (routineCollabReads || []) as { record_id: string; user_id: string }[]) {
      if (!readsByOverride.has(r.record_id)) readsByOverride.set(r.record_id, new Set());
      readsByOverride.get(r.record_id)!.add(r.user_id);
    }
    for (const o of routineOverrideRows) {
      const reads = readsByOverride.get(o.id) ?? new Set<string>();
      if (o.created_by === user.id) {
        if (!Array.from(reads).some((uid) => uid !== user.id)) routineAwaitingTheirAck = true;
      } else if (o.created_by) {
        if (!reads.has(user.id)) {
          _pendingAckIds.push(o.id);
          _pendingAckNames.add(parentColors[o.created_by]?.name ?? t("dashboard.serverFallbacks.otherParent"));
        }
      }
    }
  }
  const routinePendingAck =
    _pendingAckIds.length > 0
      ? { fromName: Array.from(_pendingAckNames).join(", "), overrideIds: _pendingAckIds }
      : null;
  const routineCaregivers = Object.entries(parentColors)
    .slice(0, 2)
    .map(([uid, v]) => ({ id: uid, name: v.name }));

  // Filter decisions where user hasn't voted yet
  const openDecisionIds = (openDecisions || []).map(d => d.id);
  const { data: decisionVotesForUser } = openDecisionIds.length > 0
    ? await supabase
        .from("decision_votes")
        .select("decision_id")
        .eq("user_id", user.id)
        .in("decision_id", openDecisionIds)
    : { data: [] };
  const votedDecisionIds = new Set((decisionVotesForUser || []).map(v => v.decision_id));
  const pendingDecisionsList = (openDecisions || []).filter(d => !votedDecisionIds.has(d.id));

  // Derive specific views from the single custody_events fetch
  const safeAllCustody = allCustodyEvents || [];
  const todayEvents = safeAllCustody.filter(
    (e) => e.start_date <= today && e.end_date >= today
  );
  // `futureEvents` removido — antes era usado pelo bloco `nextSwapEvent`
  // que iterava por start_date ASC sem aplicar prioridade swap>regular
  // (bug Barata 2026-05-14). Substituído por findNextCustodyHandover do
  // helper custody-resolve, que itera dia-a-dia resolvendo o winner por
  // dia. Type pra renderização vem de `safeAllCustody[number]`.
  type FutureCustodyEvent = typeof safeAllCustody[number];
  const upcomingEvents = safeAllCustody.filter(
    (e) => e.start_date >= today && e.start_date <= formatDateKey(fourteenDays) && e.custody_type !== "regular"
  ).slice(0, 4);
  const swapEvents = safeAllCustody;
  const weekEvents = children && children.length > 0
    ? safeAllCustody.filter(
        (e) => e.child_id === children[0].id && e.start_date <= formatDateKey(weekEnd) && e.end_date >= formatDateKey(weekStart)
      )
    : null;

  // Process activities from pre-computed calendar_occurrences (no runtime recurrence expansion)

  // Estados de uma atividade na visao de hoje:
  //  - 'upcoming':         ainda nao encerrou (ou sem horario marcado)
  //  - 'ended-unreported': time_end ja passou e nao ha activity_report
  //  - 'ended-reported':   time_end ja passou e ha activity_report
  // Atividades de outros dias (amanha, futuras) ficam sem state.
  type TodayState = 'upcoming' | 'ended-unreported' | 'ended-reported';
  interface DashActivityItem {
    id: string;
    name: string;
    category: string;
    time_start: string | null;
    time_end?: string | null;
    location: string | null;
    children: { full_name: string | null } | { full_name: string | null }[] | null;
    activity_checklist_items: { id: string; name: string }[];
    state?: TodayState;
    responsible_id?: string | null;
    /** true quando a row veio da tabela events (id NÃO é child_activity). */
    isEvent?: boolean;
    /** Criança dona do item (null = família toda) — dedup por irmão. */
    childId?: string | null;
  }

  const todayReportedSet = new Set(
    ((todayReportsRaw || []) as { activity_id: string }[]).map((r) => r.activity_id)
  );
  const brazilNow = getBrazilNow();
  const realNowMinutes = brazilNow.getHours() * 60 + brazilNow.getMinutes();
  function classifyToday(activityId: string, timeEnd: string | null | undefined, timeStart: string | null | undefined): TodayState {
    const endStr = timeEnd || timeStart;
    if (!endStr) return 'upcoming'; // sem horario, sempre tratamos como aberta
    const [h, m] = String(endStr).split(":").map(Number);
    const endMin = h * 60 + (m || 0);
    if (endMin > realNowMinutes) return 'upcoming';
    return todayReportedSet.has(activityId) ? 'ended-reported' : 'ended-unreported';
  }

  const tomorrowActivities: DashActivityItem[] = [];
  const todayActivities: DashActivityItem[] = [];
  // Eventos de hoje que JÁ passaram: somem da lista (decisão antiga — não há
  // "Relatar" pra evento), mas continuam no ARCO como estação apagada, igual
  // às atividades passadas (auditoria #16).
  const pastTodayEvents: DashActivityItem[] = [];
  const upcomingActivities: { act: DashActivityItem; date: string; dayLabel: string }[] = [];
  const dayAfterTomorrowKey = formatDateKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 2));

  for (const occ of activityOccurrences || []) {
    const act = Array.isArray(occ.child_activities) ? occ.child_activities[0] : occ.child_activities;
    if (!act) continue;
    const dateKey = occ.occurrence_date;
    const dashAct: DashActivityItem = {
      id: act.id,
      name: act.name,
      category: act.category,
      time_start: act.time_start,
      time_end: act.time_end,
      location: act.location,
      children: act.children,
      activity_checklist_items: act.activity_checklist_items || [],
      responsible_id: (act as { responsible_id?: string | null }).responsible_id ?? null,
      childId: (act as { child_id?: string | null }).child_id ?? null,
    };

    if (dateKey === todayKey) {
      // Mostrar TODAS as atividades de hoje, marcadas por estado. UX antes:
      // sumiam apos o time_end (e demoravam pra voltar como Pendente no dia
      // seguinte). UX agora: ficam visiveis no proprio bloco "Hoje" ate o
      // fim do dia, com pill "Relatar" inline quando encerradas.
      dashAct.state = classifyToday(act.id, act.time_end, act.time_start);
      todayActivities.push(dashAct);
    } else if (dateKey === tomorrowKey) {
      tomorrowActivities.push(dashAct);
    } else if (dateKey >= dayAfterTomorrowKey) {
      const d = new Date(dateKey + "T12:00:00");
      upcomingActivities.push({ act: dashAct, date: dateKey, dayLabel: `${dayNamesShort[d.getDay()]} ${d.getDate()}` });
    }
  }

  if (dashSocialEvents) {
    for (const evt of dashSocialEvents) {
      const fakeAct = {
        id: evt.id,
        name: evt.title,
        category: "evento",
        time_start: evt.event_time,
        location: evt.location,
        children: evt.children,
        activity_checklist_items: [],
        // events.assigned_to É o responsável do evento (migration 00024) —
        // alimenta a estação do herói igual ao responsible_id das atividades.
        responsible_id: (evt as { assigned_to?: string | null }).assigned_to ?? null,
        isEvent: true,
        childId: (evt.child_id as string | null) ?? null,
      };
      if (evt.event_date === todayKey) {
        // Eventos nao tem activity_reports — nao da pra "Relatar". Entao
        // mantemos o comportamento original: somem da lista apos
        // event_time. (Compara horario real BR via realNowMinutes — antes
        // usavamos `now` ancorado ao meio-dia, o que mantinha eventos da
        // tarde sempre visiveis e escondia eventos da manha o dia inteiro.)
        if (evt.event_time) {
          const [h, m] = evt.event_time.split(":").map(Number);
          if (h * 60 + (m || 0) >= realNowMinutes) {
            (fakeAct as DashActivityItem).state = 'upcoming';
            todayActivities.push(fakeAct);
          } else {
            pastTodayEvents.push(fakeAct);
          }
        } else {
          (fakeAct as DashActivityItem).state = 'upcoming';
          todayActivities.push(fakeAct);
        }
      }
      else if (evt.event_date === tomorrowKey) tomorrowActivities.push(fakeAct);
      else {
        const d = new Date(evt.event_date + "T12:00:00");
        upcomingActivities.push({ act: fakeAct, date: evt.event_date, dayLabel: `${dayNamesShort[d.getDay()]} ${d.getDate()}` });
      }
    }
  }

  // Sort activities by time (ascending)
  const sortByTime = (a: DashActivityItem, b: DashActivityItem) => {
    const timeA = a.time_start || "99:99";
    const timeB = b.time_start || "99:99";
    return timeA.localeCompare(timeB);
  };
  todayActivities.sort(sortByTime);
  tomorrowActivities.sort(sortByTime);
  upcomingActivities.sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    return (a.act.time_start || "99:99").localeCompare(b.act.time_start || "99:99");
  });

  const hasTomorrowActivities = tomorrowActivities.length > 0;
  const hasTodayActivities = todayActivities.length > 0;
  const hasUpcomingActivities = upcomingActivities.length > 0;

  // Compute pending activity reports from pre-computed past occurrences (no runtime recurrence)
  // Range: ultimos 7 dias, EXCLUINDO hoje. Hoje fica na secao "Atividades de
  // hoje" (com CTA "Relatar" inline para encerradas). Pendentes = backlog.
  const pendingReportPairs: { activityId: string; activityName: string; category: string; childName: string; occurrenceDate: string }[] = [];
  for (const occ of pastOccurrences || []) {
    const act = Array.isArray(occ.child_activities) ? occ.child_activities[0] : occ.child_activities;
    if (!act) continue;
    pendingReportPairs.push({
      activityId: act.id,
      activityName: act.name,
      category: act.category,
      childName: (act.children as unknown as { full_name: string | null } | null)?.full_name?.split(" ")[0] || "",
      occurrenceDate: occ.occurrence_date,
    });
  }

  // Fetch existing reports to filter out already-reported ones
  const sevenDaysAgoKey = formatDateKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7));
  const yesterdayKey2 = formatDateKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1));
  let pendingReportsFinal: typeof pendingReportPairs = [];
  if (pendingReportPairs.length > 0) {
    const reportActIds = [...new Set(pendingReportPairs.map((p) => p.activityId))];
    const { data: existingReportsData } = await supabase
      .from("activity_reports")
      .select("activity_id, occurrence_date")
      .eq("group_id", groupId)
      .in("activity_id", reportActIds)
      .gte("occurrence_date", sevenDaysAgoKey)
      .lte("occurrence_date", yesterdayKey2);

    const reportedSet = new Set(
      (existingReportsData || []).map((r: { activity_id: string; occurrence_date: string }) => `${r.activity_id}:${r.occurrence_date}`)
    );
    pendingReportsFinal = pendingReportPairs.filter(
      (p) => !reportedSet.has(`${p.activityId}:${p.occurrenceDate}`)
    );
  }

  // Process today custody — bug Barata 2026-05-14: o loop antigo pegava
  // o PRIMEIRO event por start_date ASC, ignorando que swap > regular.
  // Quando há swap+regular pro mesmo dia/criança, regular vencia (tem
  // start_date mais antigo do range) — retornava Amanda em vez de Barata.
  //
  // Fix: aplicar regra do view custody_resolved (00079) em memória via
  // resolveTodayCustody → pickCustodyWinner (swap>exception>regular,
  // tie-break created_at DESC).
  const todayCustodyByChild: Record<string, { responsibleId: string; responsibleName: string; isWithMe: boolean; endDate: string; custodyType: string }> = {};
  if (todayEvents.length > 0) {
    const winnerByChild = resolveTodayCustody(todayEvents as unknown as CustodyEventRow[], today);
    for (const [childId, ev] of winnerByChild.entries()) {
      // Re-localizar o event original (com profiles populado) já que o
      // helper trabalha com tipo enxuto que não inclui o join.
      const event = (todayEvents as typeof todayEvents).find((e) => e.id === (ev as { id: string }).id) ?? (ev as unknown as (typeof todayEvents)[number]);
      const responsibleName = getDisplayName((event.profiles as unknown as { full_name: string | null } | null)?.full_name, true);
      todayCustodyByChild[childId] = {
        responsibleId: event.responsible_user_id,
        responsibleName,
        isWithMe: event.responsible_user_id === user.id,
        endDate: event.end_date,
        custodyType: event.custody_type,
      };
    }
  }
  const hasTodayCustody = Object.keys(todayCustodyByChild).length > 0;

  // Agrega a custódia de hoje de TODAS as crianças (não só children[0]).
  // Classifica em single / together / split — ver src/lib/custody-hero.ts.
  const heroChildren = (children || []).map((c) => ({
    id: (c as { id: string }).id,
    firstName: (((c as { full_name: string | null }).full_name) || "").split(" ")[0] || "",
  }));
  const custodyHeroData = buildCustodyHero(heroChildren, todayCustodyByChild);
  // Criança "representante" pro streak + end-date do herói: a 1ª COM
  // custódia hoje (não children[0], que pode não ter evento hoje).
  const repChild =
    (children || []).find((c) => todayCustodyByChild[(c as { id: string }).id]) ?? null;

  // Streak — agora calcula sobre o BLOCO consecutivo de dias com o mesmo
  // responsável (aplicando swap > exception > regular dia a dia), não só
  // sobre o range do evento winner.
  //
  // Bug Barata 2026-05-14: cálculo antigo pegava o evento mais recente
  // que tinha `responsible_user_id = current` cobrindo HOJE. Quando o
  // current vem de um swap unicelular (start=end=hoje), retornava 1/1.
  // Mas se há swaps emendados (qui+sex+sáb+dom), o usuário enxerga 1
  // bloco de 4 dias, não 4 swaps de 1 dia. Critério ANTIGO falhava em
  // capturar a sequência.
  //
  // Fix: computeCustodyStreak itera backward + forward aplicando winner
  // por dia. Não precisa de query extra — usa allCustodyEvents já em
  // memória.
  let streakDays = 0;
  let streakTotal = 0;
  if (hasTodayCustody && repChild) {
    const streak = computeCustodyStreak(
      safeAllCustody as CustodyEventRow[],
      (repChild as { id: string }).id,
      today,
    );
    if (streak) {
      streakDays = streak.streakDays;
      streakTotal = streak.streakTotal;
    }
  }

  // Bug Barata 2026-05-14 (iOS): a versão antiga deste find() retornava o
  // primeiro futureEvent (ordenado por start_date) com responsible≠hoje,
  // SEM aplicar swap>regular. Resultado: pra próximo final de semana com
  // swap aprovado (sex 15 → Barata) + regular (sex 15→qui 21 → Amanda),
  // o card mostrava "PRÓXIMA TROCA · AMANDA" porque o regular tem
  // start_date mais antigo e a iteração encontrava ele primeiro.
  //
  // Fix: itera dia-a-dia (até +60d) resolvendo o winner por dia via
  // pickCustodyWinner. Primeira data com winner.responsible ≠ current é
  // a próxima troca real. findNextCustodyHandover encapsula isso.
  let nextSwapEvent: FutureCustodyEvent | undefined;
  for (const childId of Object.keys(todayCustodyByChild)) {
    const todayInfo = todayCustodyByChild[childId];
    const handover = findNextCustodyHandover(
      safeAllCustody as CustodyEventRow[],
      childId,
      today,
      todayInfo.responsibleId,
    );
    if (handover) {
      const ev = handover.event as FutureCustodyEvent;
      // Pra renderizar o "PRÓXIMA TROCA · NAME" precisamos do start_date
      // do dia em que a troca acontece (não do range completo do event).
      // O `formatSwapDate` consome `start_date`, então passamos a data
      // exata do handover. Evento winner mantém profiles populado.
      nextSwapEvent = { ...ev, start_date: handover.dateKey };
      break;
    }
  }

  // Process financial (exclude rejected expenses, consistent with Financeiro page)
  let myTotal = 0;
  let otherTotal = 0;
  let myShouldPay = 0;
  let otherName = "";
  if (monthExpenses) {
    for (const exp of monthExpenses) {
      if (exp.status === "rejected") continue;
      const amount = Number(exp.amount);
      if (exp.paid_by === user.id) myTotal += amount;
      else {
        otherTotal += amount;
        if (!otherName && parentColors[exp.paid_by]) otherName = parentColors[exp.paid_by].name;
      }
      // Calculate what user should pay based on split_ratio
      const sr = exp.split_ratio as Record<string, number> | null;
      if (sr && sr[user.id] !== undefined) {
        myShouldPay += (sr[user.id] / 100) * amount;
      } else {
        myShouldPay += amount / 2; // default 50/50
      }
    }
  }
  if (!otherName) {
    const otherMember = members?.find((m) => m.user_id !== user.id);
    otherName = parentColors[otherMember?.user_id || ""]?.name || t("dashboard.serverFallbacks.otherParent");
  }
  const totalMonth = myTotal + otherTotal;
  const balance = myTotal - myShouldPay;

  // Health alerts flag
  const hasHealthAlerts = (activeMedications && activeMedications.length > 0) ||
    (criticalAllergies && criticalAllergies.length > 0) ||
    (upcomingAppointments && upcomingAppointments.length > 0) ||
    (activeIllnesses && activeIllnesses.length > 0);

  // Build per-child health summary for the new health block
  interface ChildHealthSummary {
    childId: string;
    childName: string;
    childPhotoUrl: string | null;
    status: "healthy" | "monitoring" | "treatment";
    statusLabel: string;
    detail: string;
    activeMedication: string | null;
    nextAction: string | null;
  }

  const childHealthSummaries: ChildHealthSummary[] = (children || []).map((child) => {
    const childName = child.full_name?.split(" ")[0] || t("dashboard.serverFallbacks.childGeneric");
    const childMeds = (activeMedications || []).filter(m => m.child_id === child.id);
    const childIllnesses = (activeIllnesses || []).filter(i => i.child_id === child.id);
    const childAppts = (upcomingAppointments || []).filter(a => a.child_id === child.id);
    const childCheckin = recentCheckins?.find(ci => {
      const ciChild = ci.children as unknown as { full_name: string | null } | null;
      return ciChild?.full_name === child.full_name;
    });

    let status: "healthy" | "monitoring" | "treatment" = "healthy";
    let detail = t("dashboard.healthDetail.noRecentRecords");
    let activeMedication: string | null = null;
    let nextAction: string | null = null;

    if (childMeds.length > 0) {
      status = "treatment";
      const med = childMeds[0] as unknown as { name: string; dosage: string; frequency: string };
      const medName = med.name || "";
      const medFreq = med.frequency || "";
      activeMedication = medName;
      detail = `${medName} ${medFreq}`;
      nextAction = t("dashboard.healthDetail.confirmDose");
    } else if (childIllnesses.length > 0) {
      status = "monitoring";
      const illness = childIllnesses[0];
      const symptoms = (illness.symptoms as string[])?.slice(0, 2).join(", ") || "";
      detail = illness.title + (symptoms ? ` · ${symptoms}` : "");
      nextAction = t("dashboard.healthDetail.updateStatus");
    } else if (childCheckin && childCheckin.checkin_date >= formatDateKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 2))) {
      status = "monitoring";
      detail = childCheckin.title || t("dashboard.healthDetail.recentCheckin");
    } else if (childAppts.length > 0) {
      status = "monitoring";
      const appt = childAppts[0];
      const apptDate = new Date(appt.appointment_date);
      // Locale-aware time format (Regra Canônica 11). pt-BR → "14:30",
      // en-US → "2:30 PM", de-DE → "14:30". Replaces the previous "pt-BR"
      // hardcoded format that ignored the user's chosen locale.
      const timeStr = new Intl.DateTimeFormat(bcp47, { hour: "2-digit", minute: "2-digit" }).format(apptDate);
      detail = t("dashboard.healthDetail.appointmentWithTime", { title: appt.title || "", time: timeStr });
      nextAction = t("dashboard.healthDetail.viewAppointment");
    }

    return {
      childId: child.id,
      childName,
      // photo_url e armazenado como path do Storage; e assinado depois
      // (em paralelo) abaixo pra nao bloquear a query principal.
      childPhotoUrl: (child as { photo_url?: string | null }).photo_url ?? null,
      status,
      statusLabel:
        status === "treatment"
          ? t("dashboard.healthStatus.treatment")
          : status === "monitoring"
            ? t("dashboard.healthStatus.monitoring")
            : t("dashboard.healthStatus.healthy"),
      detail, activeMedication, nextAction,
    };
  });

  // Assinar avatares — fora do cache pra respeitar TTL (1h). Falhas
  // viram null e o ChildAvatar / DashboardClient cai pra inicial.
  await Promise.all(
    childHealthSummaries.map(async (s) => {
      if (s.childPhotoUrl) {
        s.childPhotoUrl = await getSignedFileUrl(supabase, "documents", s.childPhotoUrl);
      }
    }),
  );

  // Sort by attention level: treatment > monitoring > healthy
  childHealthSummaries.sort((a, b) => {
    const order = { treatment: 0, monitoring: 1, healthy: 2 };
    return order[a.status] - order[b.status];
  });

  const hasAnyCriticalChild = childHealthSummaries.some(c => c.status === "treatment");

  // Saúde no painel SÓ quando tem algo a dizer (dono 10/jun): medicação ativa,
  // doença, check-in recente ou consulta marcada (status ≠ healthy). Linhas
  // "Saudável · Sem registros recentes" são ruído — a seção some. O array
  // completo continua existindo (os rostos dos filhos reusam as fotos dele).
  const noteworthyHealth = childHealthSummaries.filter((s) => s.status !== "healthy");

  // UI constants — prefere display_name (coluna gerada do banco, migration 00081)
  // sobre full_name. getDisplayName é defensiva final: vazio → "Usuário".
  const profileRow = profile as ({ display_name?: string | null; full_name?: string | null } | null);
  const displayFullName = getDisplayName(profileRow?.display_name || profileRow?.full_name);
  const nameParts = displayFullName.split(" ");
  // Handle prefixes like "Dr.", "Dra.", "Sr.", "Sra." — use prefix + next word
  const prefixes = ["dr.", "dra.", "sr.", "sra.", "prof."];
  const firstName = nameParts.length > 1 && prefixes.includes(nameParts[0].toLowerCase())
    ? `${nameParts[0]} ${nameParts[1]}`
    : nameParts[0] || t("dashboard.serverFallbacks.parentGeneric");
  const hour = brazilNow.getHours();
  const greetingKey: "morning" | "afternoon" | "evening" = hour < 12 ? "morning" : hour < 18 ? "afternoon" : "evening";

  // (dayNamesShort + weekdayFormatterShort are declared up top, near locale
  // resolution, because activity merge loops above need them.)

  // Locale-aware date "Sunday, 14 May" formatting (Regra Canônica 11).
  // Replaces hardcoded ["Domingo", "Segunda"...] / MONTH_NAMES — those broke
  // anyone whose chosen locale wasn't pt-BR and were the most visible
  // symptom of the "trocar idioma e nada mudou" bug Henrique reported.
  const todayDateObj = brazilNow;
  const formattedDate = new Intl.DateTimeFormat(bcp47, {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(todayDateObj);

  const firstChild = children && children.length > 0 ? children[0] : null;
  // firstCustody passa a refletir a criança REPRESENTANTE (1ª com custódia
  // hoje), não mais children[0]. Alimenta o streak bar e o end-date do herói
  // e cobre o caso de children[0] não ter evento hoje.
  const firstCustody = repChild ? todayCustodyByChild[(repChild as { id: string }).id] : null;
  // Subtítulo do cumprimento, agregado: single → "{nome} com {pai} hoje";
  // together → "As crianças com {pai} hoje"; split/none → sem cláusula.
  const custodySummary =
    custodyHeroData.mode === "single"
      ? t("dashboard.custodyServer.summaryWithChild", {
          child: custodyHeroData.group.childNames[0],
          parent: custodyHeroData.group.isWithMe
            ? t("dashboard.custodyServer.withYou")
            : custodyHeroData.group.responsibleName,
        })
      : custodyHeroData.mode === "together"
        ? t("dashboard.custodyServer.summaryWithChildren", {
            parent: custodyHeroData.group.isWithMe
              ? t("dashboard.custodyServer.withYou")
              : custodyHeroData.group.responsibleName,
          })
        : null;

  // End date label for hero — bug Barata 2026-05-14 still applies (don't
  // leak technical types "swap"/"regular"/"exception" to user). Now also
  // locale-aware: the day-of-week label comes from Intl, and the surround
  // template comes from translations.
  const endDateLabel = firstCustody ? (() => {
    const end = new Date(firstCustody.endDate + "T12:00:00");
    const day = new Intl.DateTimeFormat(bcp47, { weekday: "short" }).format(end);
    const custodyType = firstCustody.custodyType;
    if (custodyType === "swap") return t("dashboard.custodyServer.endLabelSwap", { day });
    if (custodyType === "exception") return t("dashboard.custodyServer.endLabelException", { day });
    return t("dashboard.custodyServer.endLabelRegular", { day });
  })() : "";

  // Week view
  const wLabels = ["S", "T", "Q", "Q", "S", "S", "D"];
  const weekDaysData: DashboardClientProps["weekDays"] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(weekStart);
    d.setDate(weekStart.getDate() + i);
    weekDaysData.push({
      dateKey: formatDateKey(d),
      label: wLabels[i],
      dayNum: d.getDate(),
      isToday: formatDateKey(d) === today,
    });
  }

  // Week custody map
  const weekCustodyEntries: DashboardClientProps["weekCustodyMap"] = [];
  if (weekEvents) {
    for (const ev of weekEvents) {
      const s = new Date(ev.start_date + "T12:00:00");
      const e = new Date(ev.end_date + "T12:00:00");
      for (let d = new Date(s); d <= e; d.setDate(d.getDate() + 1)) {
        weekCustodyEntries.push({
          dateKey: formatDateKey(d),
          responsibleId: ev.responsible_user_id,
          color: parentColors[ev.responsible_user_id]?.color || PARENT_COLORS.primary,
        });
      }
    }
  }

  // Parent color entries for legend
  const parentColorEntries = Object.entries(parentColors).slice(0, 2).map(([uid, { name, color }]) => ({ uid, name, color }));

  // Swap balance
  const custodyEvents = (swapEvents || []) as unknown as CustodyEvent[];
  const swapBalance = computeSwapBalance(custodyEvents, parentColors, formatDateKey(threeMonthsAgo), formatDateKey(threeMonthsAhead));
  const mySwapDays = swapBalance.balanceByUser[user.id] || 0;
  const myColor = parentColors[user.id]?.color || PARENT_COLORS.primary;
  const otherColor = parentColors[members?.find(m => m.user_id !== user.id)?.user_id || ""]?.color || PARENT_COLORS.secondary;

  // Format next swap date
  const formatSwapDate = (dateStr: string) => {
    const d = new Date(dateStr + "T12:00:00");
    return `${dayNamesShort[d.getDay()]} ${d.getDate()}/${d.getMonth() + 1}`;
  };

  // === BUILD SERIALIZABLE PROPS ===

  // Pending swaps
  const pendingSwapsProps: DashboardClientProps["pendingSwaps"] = (pendingSwaps || []).map((swap) => {
    const requesterName = getDisplayName((swap.requester as unknown as { full_name: string | null } | null)?.full_name, true);
    const swapDate = new Date(swap.original_date + "T12:00:00");
    return {
      id: swap.id,
      requesterName,
      dateLabel: `${dayNamesShort[swapDate.getDay()]}, ${swapDate.getDate()}/${swapDate.getMonth() + 1}`,
      originalDate: swap.original_date,
    };
  });

  // Next swap label
  const nextSwapLabel = nextSwapEvent
    ? `${formatSwapDate(nextSwapEvent.start_date)} \u00B7 ${getDisplayName((nextSwapEvent.profiles as unknown as { full_name: string | null } | null)?.full_name, true)}`
    : null;

  // Hero firstCustody
  const firstCustodyProp = firstCustody ? {
    childFirstName: firstChild!.full_name?.split(" ")[0] || "",
    responsibleName: firstCustody.responsibleName,
    isWithMe: firstCustody.isWithMe,
    endDate: firstCustody.endDate,
    custodyType: firstCustody.custodyType,
  } : null;

  // Hero agregado (single / together / split) — ver src/lib/custody-hero.ts.
  const custodyHeroProp: DashboardClientProps["custodyHero"] = (() => {
    const colorFor = (uid: string, isWithMe: boolean) =>
      parentColors[uid]?.color || (isWithMe ? PARENT_COLORS.primary : PARENT_COLORS.secondary);
    if (custodyHeroData.mode === "none") return null;
    if (custodyHeroData.mode === "split") {
      return {
        mode: "split",
        groups: custodyHeroData.groups.map((g) => ({
          responsibleName: g.responsibleName,
          isWithMe: g.isWithMe,
          colorHex: colorFor(g.responsibleId, g.isWithMe),
          childNames: g.childNames,
        })),
      };
    }
    const g = custodyHeroData.group;
    return {
      mode: custodyHeroData.mode,
      responsibleName: g.responsibleName,
      isWithMe: g.isWithMe,
      childName: custodyHeroData.mode === "single" ? g.childNames[0] : null,
      showStreak: custodyHeroData.mode === "single" ? true : custodyHeroData.allSameEnd,
    };
  })();

  // ——— HERÓI DE GUARDA UNIVERSAL (cutover, dono 10/jun) ———
  // Contexto mastigado pro card dark: voz com perspectiva ("com você até
  // dom."), ritmo da semana (RESTAURA a Semana Colorida), contagem 3 de 7,
  // próxima troca com "Você pega", handoff no dia de troca. Contrato de
  // não-regressão: preserva tudo do herói de guarda antigo.
  const custodyContextProp: DashboardClientProps["custodyContext"] = (() => {
    if (!custodyHeroProp || !hasTodayCustody) return null;
    const week = weekDaysData.map((d) => ({
      label: d.label,
      color: weekCustodyEntries.find((e) => e.dateKey === d.dateKey)?.color ?? null,
      isToday: d.isToday,
    }));
    const nextSwap = nextSwapEvent
      ? {
          dateLabel: formatSwapDate(nextSwapEvent.start_date),
          dateKey: nextSwapEvent.start_date,
          name: getDisplayName(
            (nextSwapEvent.profiles as unknown as { full_name: string | null } | null)?.full_name,
            true,
          ),
          isMine: nextSwapEvent.responsible_user_id === user.id,
        }
      : null;
    const handoff = nextSwap && nextSwap.dateKey === todayKey ? { name: nextSwap.name, isMe: nextSwap.isMine } : null;
    const untilLabel = firstCustody
      ? new Intl.DateTimeFormat(bcp47, { weekday: "short" }).format(new Date(firstCustody.endDate + "T12:00:00"))
      : null;
    const kids = (children || [])
      .filter((c) => todayCustodyByChild[(c as { id: string }).id])
      .map((c) => (c as { full_name?: string | null }).full_name?.split(" ")[0] || "")
      .filter(Boolean);
    if (custodyHeroProp.mode === "split") {
      return {
        mode: "split" as const,
        withName: "",
        withIsMe: false,
        kids,
        untilLabel: null,
        handoff,
        groups: custodyHeroProp.groups.map((gr) => ({
          name: gr.responsibleName,
          isMe: gr.isWithMe,
          colorHex: gr.colorHex,
          kids: gr.childNames,
        })),
        streakDays,
        streakTotal,
        week,
        nextSwap,
      };
    }
    return {
      mode: custodyHeroProp.mode,
      withName: custodyHeroProp.responsibleName,
      withIsMe: custodyHeroProp.isWithMe,
      kids: custodyHeroProp.mode === "single" && custodyHeroProp.childName ? [custodyHeroProp.childName] : kids,
      untilLabel: custodyHeroProp.showStreak ? untilLabel : null,
      handoff,
      streakDays,
      streakTotal,
      week,
      nextSwap,
    };
  })();

  // Illnesses
  const illnessProps: DashboardClientProps["activeIllnesses"] = (activeIllnesses || []).map((illness) => {
    const childName = (illness.children as unknown as { full_name: string | null } | null)?.full_name?.split(" ")[0] || t("dashboard.serverFallbacks.childGeneric");
    const startDate = new Date(illness.start_date + "T12:00:00");
    const daysAgo = Math.round((nowMs - startDate.getTime()) / 86400000);
    const symptoms = (illness.symptoms as string[])?.slice(0, 3).join(", ") || "";
    return { id: illness.id, childName, title: illness.title, daysAgo, symptoms };
  });

  // Medications
  const medicationProps: DashboardClientProps["activeMedications"] = (activeMedications || []).map((m) => ({
    id: m.id,
    name: m.name,
    childName: (m.children as unknown as { full_name: string | null } | null)?.full_name?.split(" ")[0] || "",
  }));

  // Allergies
  const allergyProps: DashboardClientProps["criticalAllergies"] = (criticalAllergies || []).map((a) => ({
    id: a.id,
    name: a.name,
    severity: a.severity,
  }));

  // Appointments
  const appointmentProps: DashboardClientProps["upcomingAppointments"] = (upcomingAppointments || []).map((appt) => {
    const childName = (appt.children as unknown as { full_name: string | null } | null)?.full_name?.split(" ")[0] || "";
    const profName = (appt.medical_professionals as unknown as { name: string | null; specialty: string | null } | null)?.name || "";
    const specialty = (appt.medical_professionals as unknown as { name: string | null; specialty: string | null } | null)?.specialty || "";
    const apptDate = new Date(appt.appointment_date);
    const isToday = formatDateKey(apptDate) === today;
    const isTomorrow = formatDateKey(apptDate) === tomorrowKey;
    const timeStr = new Intl.DateTimeFormat(bcp47, { hour: "2-digit", minute: "2-digit" }).format(apptDate);
    return {
      id: appt.id,
      title: appt.title || specialty,
      childName,
      profName,
      timeStr,
      isToday,
      isTomorrow,
      dateLabel: `${dayNamesShort[apptDate.getDay()]} ${apptDate.getDate()}/${apptDate.getMonth() + 1}`,
    };
  });

  // Activities mapper
  const mapActivity = (act: DashActivityItem) => ({
    id: act.id,
    name: act.name,
    category: act.category,
    childName: (act.children as unknown as { full_name: string | null } | null)?.full_name?.split(" ")[0] || "",
    timeStr: act.time_start ? act.time_start.slice(0, 5) : "",
    location: act.location || "",
    checklistItems: (act.activity_checklist_items || []).map((i) => i.name),
    state: act.state, // 'upcoming' | 'ended-unreported' | 'ended-reported' (so para hoje)
  });

  const todayActivitiesProps = todayActivities.map(mapActivity);
  const tomorrowActivitiesProps = tomorrowActivities.map(mapActivity);
  const upcomingActivitiesProps: DashboardClientProps["upcomingActivitiesList"] = upcomingActivities.map(({ act, date, dayLabel }) => ({
    act: mapActivity(act),
    date,
    dayLabel,
  }));

  // Pending expenses
  const pendingExpenseProps: DashboardClientProps["pendingExpenses"] = (pendingExpenses || []).map((exp) => {
    const paidByName = getDisplayName((exp.profiles as unknown as { full_name: string | null } | null)?.full_name, true);
    const expDate = new Date(exp.expense_date + "T12:00:00");
    return {
      id: exp.id,
      description: exp.description,
      amount: Number(exp.amount),
      category: exp.category,
      paidByName,
      dateLabel: `${expDate.getDate()}/${expDate.getMonth() + 1}`,
    };
  });

  // Upcoming custody events for agenda
  const upcomingEventsProps: DashboardClientProps["upcomingEvents"] = (upcomingEvents || []).map((event) => {
    const rid = event.responsible_user_id;
    const isMe = rid === user.id;
    const rName = getDisplayName((event.profiles as unknown as { full_name: string | null } | null)?.full_name, true);
    const color = parentColors[rid]?.color || PARENT_COLORS.secondary;
    const eDate = new Date(event.start_date + "T12:00:00");
    const childName = (event.children as unknown as { full_name: string | null } | null)?.full_name?.split(" ")[0] || "";
    const hasNote = event.notes && !event.notes.includes("Gerado pela escala");
    return {
      id: event.id,
      responsibleId: rid,
      isMe,
      responsibleName: rName,
      color,
      custodyType: event.custody_type,
      childName,
      notes: hasNote ? event.notes : null,
      dateDayShort: dayNamesShort[eDate.getDay()].substring(0, 3).toLowerCase(),
      dateNum: eDate.getDate(),
    };
  });

  // Child cards
  // Locale-aware short month names (3 chars typically) via CLDR. Replaces
  // hardcoded ["Jan","Fev",...] which forced pt-BR forever.
  const monthFormatterShort = new Intl.DateTimeFormat(bcp47, { month: "short" });
  const birthMonthNames = Array.from({ length: 12 }, (_, i) => {
    const anchor = new Date(Date.UTC(2024, i, 15));
    return monthFormatterShort.format(anchor);
  });
  const childCards: DashboardClientProps["childCards"] = (children || []).map((child) => {
    const custody = todayCustodyByChild[child.id];
    const age = Math.floor((nowMs - new Date(child.birth_date).getTime()) / (365.25 * 24 * 60 * 60 * 1000));
    const birthDate = new Date(child.birth_date);
    const childCheckin = recentCheckins?.find((ci) => (ci.children as unknown as { full_name: string | null } | null)?.full_name === child.full_name);
    const checkinIsToday = childCheckin ? childCheckin.checkin_date === today : false;
    return {
      id: child.id,
      fullName: child.full_name || "",
      firstName: child.full_name?.split(" ")[0] || "",
      initial: child.full_name?.charAt(0).toUpperCase() || "",
      // Rostos no painel (premium): reusa a foto JÁ assinada em childHealthSummaries.
      photoUrl: childHealthSummaries.find((s) => s.childId === child.id)?.childPhotoUrl ?? null,
      age,
      birthLabel: `${birthMonthNames[birthDate.getMonth()]}/${birthDate.getFullYear()}`,
      custodyInfo: custody ? { responsibleName: custody.responsibleName, isWithMe: custody.isWithMe } : null,
      checkinTitle: childCheckin ? childCheckin.title : null,
      checkinIsToday,
    };
  });

  // Determine if the group has a custody schedule configured
  const hasCustody = safeAllCustody.some((e) => e.custody_type === "regular");

  // === CONTEXT-AWARE SECTION ORDERING ===
  // Prioritize sections based on what matters RIGHT NOW for this user.
  // Each section has a priority (lower = more important). Show top N, collapse rest.
  // Briefing v2.0: schoolUnread/expensesUnread/saudeUnread/pendingExpenses/
  // pendingDecisions/pendingReports saíram daqui — unificados na régua "Sua
  // Atenção" (composeAttention), renderizada logo após a rotina.
  type SectionId = "swapAlerts" | "hero" | "careRoutine" | "healthBlock" | "activities" | "financial" | "quickActions" | "childCards" | "invite" | "custodyActivation";

  const sectionPriorities: { id: SectionId; priority: number; hasData: boolean }[] = [
    { id: "swapAlerts", priority: 1, hasData: custodyEnabled && hasCustody && pendingSwapsProps.length > 0 },
    // Herói de GUARDA só p/ quem reveza (rotating/custom). Famílias que moram
    // juntas / solo (together/single, escolhido no onboarding) → o Herói de
    // Guarda perde sentido ("de quem é a vez" não existe) e a Rotina de
    // leva/busca (careRoutine, logo abaixo) vira o herói. Default 'rotating' =
    // todo grupo existente intocado.
    { id: "hero", priority: 2, hasData: routineArrangement === "rotating" || routineArrangement === "custom" },
    // Rotina de Leva & Busca: logo abaixo do herói. Aparece quando há rotina
    // montada OU quando a família é intacta/solo (arrangement ≠ rotating) com
    // filhos — aí mostra o empty-state que ensina/leva pro editor.
    { id: "careRoutine", priority: 2.5, hasData: hasRoutineSlots || (routineArrangement !== "rotating" && (children?.length || 0) > 0) },
    { id: "childCards", priority: 3, hasData: (children?.length || 0) > 0 },
    { id: "healthBlock", priority: 4, hasData: noteworthyHealth.length > 0 },
    { id: "activities", priority: 5, hasData: hasTodayActivities || hasTomorrowActivities || hasUpcomingActivities },
    // Briefing v2.0: escola/despesa/saúde (novidades), despesas a aprovar,
    // votos e relatos pendentes NÃO ficam mais aqui — foram unificados na
    // régua "Sua Atenção" (composeAttention, logo abaixo), priorizada e calma.
    { id: "financial", priority: 10, hasData: true },
    { id: "quickActions", priority: 11, hasData: !isReadonly },
    { id: "invite", priority: 12, hasData: (members?.length || 0) < 2 },
    // Não prompta "ative a guarda" p/ quem escolheu morar junto / cuidar sozinho.
    { id: "custodyActivation", priority: 13, hasData: !custodyEnabled && (members?.length || 0) >= 2 && (routineArrangement === "rotating" || routineArrangement === "custom") },
  ];

  // Filter to sections with data, sort by priority
  const visibleSections = sectionPriorities
    .filter(s => s.hasData)
    .sort((a, b) => a.priority - b.priority)
    .map(s => s.id);

  // Briefing v2.0 — "Sua Atenção": régua única que consolida as 6 seções de
  // pendência (relato, despesa a aprovar, voto, novidades de escola/despesa/
  // saúde). Exclusões DELIBERADAS: swap (seção de trocas), ciência de rotina
  // (card de rotina) e vacina (tile calmo próprio) — cada um tem home própria.
  const briefingAttention = composeAttention({
    arrangement: routineArrangement,
    hasCustody,
    hasRoutineSlots,
    pendingSwaps: [],
    routineAwaitingTheirAck: false,
    routinePendingAck: null,
    pendingReports: pendingReportsFinal.map((pr) => ({
      activityName: pr.activityName,
      childName: pr.childName,
      daysAgo: 0,
    })),
    pendingExpenses: pendingExpenseProps.map((e) => ({ id: e.id, description: e.description })),
    pendingDecisions: pendingDecisionsList.map((d) => ({ id: d.id, title: d.title })),
    schoolUnreadCount,
    expensesUnreadCount,
    saudeUnreadCount,
    vaccinePendingCount: 0,
    vaccineNextDue: null,
  });

  // Timeline compacta do herói (a jornada do dia: casa → leva → atividades →
  // busca → casa) pro card dark. Reusa buildChildJourney; só no modo together
  // (uma linha). Itens sem horário são omitidos (não dá pra posicionar).
  const _heroFirstChild = (children || [])[0] as { id: string } | undefined;
  // Pega a 1a entrada da rotina (together/single/split). Itens sem horário são
  // omitidos pelo buildChildJourney (não dá pra posicionar).
  const _heroEntry = routineToday.entries[0] ?? null;
  // Casa = guarda de HOJE. O dashboard só busca a guarda quando custody_enabled;
  // pra a timeline (que vale pra família intacta também) buscamos os eventos de
  // hoje à parte — query pequena indexada (group_id + janela do dia, mesmos
  // campos da /jornada) — só quando não veio acima E há rotina pra mostrar.
  let _heroCustodyEvents = (allCustodyEvents || []) as unknown as CustodyEventRow[];
  if (_heroEntry && _heroFirstChild && _heroCustodyEvents.length === 0) {
    const { data: _heroCustodyRaw } = await supabase
      .from("custody_events")
      .select("id, child_id, start_date, end_date, responsible_user_id, custody_type, created_at")
      .eq("group_id", groupId)
      .lte("start_date", todayKey)
      .gte("end_date", todayKey);
    _heroCustodyEvents = (_heroCustodyRaw || []) as unknown as CustodyEventRow[];
  }
  const _heroCustody = _heroFirstChild
    ? resolveCustodyOnDate(_heroCustodyEvents, _heroFirstChild.id, todayKey)
    : null;
  // Rotina "dia todo" (mesmo responsável nas 2 pernas, incluindo override de
  // "Trocar hoje"): a casa É de quem fica — senão a voz diz "Henrique fica o
  // dia todo" e as âncoras mostram "Fernanda" (inconsistência vista pelo dono).
  // Split (rotina diferente por filho): a casa é AMBÍGUA pra família inteira
  // (a noite da Eduarda é com Angelino, a do Joao com Henrique) — âncoras
  // ficam sem nome em vez de generalizar a do 1º filho (auditoria #13).
  const _heroHomeParent =
    routineToday.entries.length > 1
      ? null
      : _heroEntry?.sameAllDay && _heroEntry.dropoff
        ? _heroEntry.dropoff.responsibleName
        : _heroCustody
          ? parentColors[_heroCustody.responsible_user_id]?.name ?? null
          : null;
  // Dia em família (intacta/solo): sem guarda nem leva/busca, mas há evento COM
  // horário hoje → o Arco do Dia ainda lidera. Voz de presença, não revezamento
  // ("o herói é bonito demais pra ficar escondido", dono 13/jun).
  const _familyDayHasEvents = [...todayActivities, ...pastTodayEvents].some((a) => a.time_start);
  const familyDayContextProp: DashboardClientProps["familyDayContext"] =
    routineArrangement === "together" || routineArrangement === "single"
      ? { mode: routineArrangement, kids: routineChildren.map((c) => c.firstName).filter(Boolean) }
      : null;

  // Com rotina, no modo guarda (pais separados) OU no dia em família com evento:
  // os três rendem o arco (casas/leva/busca quando houver + atividades do dia).
  const heroTimeline: JourneyItem[] = _heroEntry || custodyContextProp || (familyDayContextProp && _familyDayHasEvents)
    ? buildChildJourney({
        dropoff: _heroEntry?.dropoff
          ? { name: _heroEntry.dropoff.responsibleName, time: _heroEntry.dropoff.time }
          : null,
        pickup: _heroEntry?.pickup
          ? { name: _heroEntry.pickup.responsibleName, time: _heroEntry.pickup.time }
          : null,
        activities: [...todayActivities, ...pastTodayEvents]
          .filter((a) => a.time_start)
          .map((a) => ({
            name: a.name,
            time: a.time_start as string,
            category: a.category,
            responsible: a.responsible_id ? parentColors[a.responsible_id]?.name ?? null : null,
            activityId: a.isEvent ? null : a.id,
            eventId: a.isEvent ? a.id : null,
            location: a.location ?? null,
            childId: a.childId ?? null,
          })),
        homeMorning: _heroHomeParent,
        // Dia de TROCA: a casa da noite é do PRÓXIMO responsável — o arco
        // conta o handoff visualmente (🏠 Fernanda ── ☀️ ── 🏠 Henrique).
        homeEvening: custodyContextProp?.handoff ? custodyContextProp.handoff.name : _heroHomeParent,
      })
    : [];
  // Modo split (rotina diferente por filho): as pernas COM HORÁRIO das demais
  // entries também viram estações do arco — antes só a 1ª entry aparecia e a
  // família com 2 filhos perdia as pernas do 2º (visto na conta de teste).
  for (let i = 1; i < routineToday.entries.length; i++) {
    const e = routineToday.entries[i];
    ([["dropoff", e.dropoff], ["pickup", e.pickup]] as const).forEach(([legKind, leg]) => {
      if (!leg?.time) return;
      const [h, m] = leg.time.split(":").map(Number);
      if (Number.isNaN(h)) return;
      // Perna idêntica já presente (mesma perna/hora/pessoa compartilhada
      // entre filhos) não duplica a estação (auditoria #15).
      const legTime = leg.time.slice(0, 5);
      if (heroTimeline.some((x) => x.kind === legKind && x.time === legTime && x.text === leg.responsibleName)) return;
      heroTimeline.push({
        key: `leg${i}-${legKind}`,
        sortMin: h * 60 + (m || 0),
        icon: legKind === "dropoff" ? "🚗" : "🏠",
        text: leg.responsibleName,
        time: leg.time.slice(0, 5),
        kind: legKind,
        responsible: null,
        activityId: null,
        eventId: null,
        location: null,
      });
    });
  }
  heroTimeline.sort((a, b) => a.sortMin - b.sortMin);

  const clientProps: DashboardClientProps = {
    custodyEnabled,
    groupId,
    hasCustody,
    greeting: greetingKey,
    firstName,
    formattedDate,
    custodySummary,
    pendingSwaps: pendingSwapsProps,
    hasTodayCustody,
    firstChildName: firstChild?.full_name?.split(" ")[0] || null,
    firstCustody: firstCustodyProp,
    nextSwapLabel,
    streakDays,
    streakTotal,
    otherColor,
    myColor,
    groupName,
    hasChildren: !!(children && children.length > 0),
    endDateLabel,
    custodyHero: custodyHeroProp,
    routineToday,
    routineArrangement,
    hasRoutineSlots,
    routineCaregivers,
    routineAwaitingTheirAck,
    routinePendingAck,
    routineLogsToday,
    routineTomorrowSummary,
    heroTimeline,
    custodyContext: custodyContextProp,
    familyDayContext: familyDayContextProp,
    weekDays: weekDaysData,
    weekCustodyMap: weekCustodyEntries,
    parentColorEntries,
    hasHealthAlerts: !!hasHealthAlerts,
    activeIllnesses: illnessProps,
    activeMedications: medicationProps,
    criticalAllergies: allergyProps,
    upcomingAppointments: appointmentProps,
    hasTomorrowActivities,
    hasTodayActivities,
    hasUpcomingActivities,
    tomorrowActivities: tomorrowActivitiesProps,
    todayActivities: todayActivitiesProps,
    upcomingActivitiesList: upcomingActivitiesProps,
    pendingExpenses: pendingExpenseProps,
    balance,
    totalMonth,
    myTotal,
    otherTotal,
    otherName,
    upcomingEvents: upcomingEventsProps,
    isReadonly,
    quickActionsConfig: (profile as unknown as { quick_actions: { primary: string; secondary: string[] } | null })?.quick_actions ?? null,
    childCards,
    mySwapDays,
    memberCount: members?.length || 0,
    onboardingStep: (profile as unknown as { onboarding_step: number | null })?.onboarding_step ?? 4,
    userId: user.id,
    parentColors,
    pendingDecisions: pendingDecisionsList.map(d => ({
      id: d.id,
      title: d.title,
      category: d.category,
      deadline: d.deadline,
    })),
    childHealthSummaries: noteworthyHealth.slice(0, 3),
    childHealthOverflow: Math.max(0, noteworthyHealth.length - 3),
    hasAnyCriticalChild,
    todayDate: todayKey,
    tomorrowDate: tomorrowKey,
    visibleSections,
    briefingAttention,
    pendingReports: pendingReportsFinal.slice(0, 5).map((pr) => {
      const occDate = new Date(pr.occurrenceDate + "T12:00:00");
      const daysAgo = Math.round((now.getTime() - occDate.getTime()) / 86400000);
      return {
        activityId: pr.activityId,
        activityName: pr.activityName,
        category: pr.category,
        childName: pr.childName,
        occurrenceDate: pr.occurrenceDate,
        dateLabel: `${dayNamesShort[occDate.getDay()]} ${occDate.getDate()}/${occDate.getMonth() + 1}`,
        daysAgo,
      };
    }),
    schoolUnreadCount,
    expensesUnreadCount,
    saudeUnreadCount,
    vaccinePendingCount: vaccinePending.total,
    vaccineNextDue: vaccinePending.nextDueDate
      ? {
          dueDate: vaccinePending.nextDueDate,
          vaccineName: vaccinePending.nextDueVaccineName || "",
        }
      : null,
  };

  // Billing/trial widgets — only fetched after the group is resolved so
  // we don't pay the cost on onboarding redirects.
  const [subscription, questProgress] = await Promise.all([
    getGroupSubscription(supabase, groupId),
    getQuestProgress(),
  ]);
  const trialDays = trialDaysRemaining(subscription.trialEnd);
  const showTrialWidgets = subscription.isTrial && trialDays >= 0;

  return (
    <>
      {showTrialWidgets && (
        <div className="space-y-0">
          <TrialBanner daysRemaining={trialDays} />
          <OnboardingQuest
            completed={questProgress.completed}
            totalSteps={questProgress.totalSteps}
          />
        </div>
      )}
      <DashboardClient {...clientProps} />
    </>
  );
}
