/* ------------------------------------------------------------------ */
/* services/care-routine-briefing.ts  (server-only)                    */
/* Briefing noturno "🌅 Amanhã" (IA orquestrando a rotina, Fase 2).    */
/* Chamado pelo MESMO cron /api/cron/activity-due-reminders (15min);   */
/* só age na janela de 20h BRT (isBriefingEveningSlot). Compõe a rotina */
/* de amanhã + atividades + furo de cobertura e dá push. Idempotente   */
/* via notifications (type='care_routine_briefing', última 1h).        */
/* O núcleo PURO (gate/data/furo) vive em care-routine-briefing-core.  */
/* ------------------------------------------------------------------ */
import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { createNotificationWithPush } from "@/lib/push";
import { captureServerEvent } from "@/lib/posthog-server";
import { getServerT } from "@/i18n/server";
import { getUsersLocale } from "@/lib/locale-utils";
import { getDisplayName } from "@/lib/constants";
import {
  resolveRoutineOnDate,
  buildRoutineToday,
  type RoutineSlot,
  type RoutineOverride,
  type ResolvedRoutine,
} from "@/lib/care-routine-resolve";
import { resolveCustodyOnDate, type CustodyEvent } from "@/lib/custody-resolve";
import {
  isBriefingEveningSlot,
  tomorrowKeyBrazil,
  hasCoverageGap,
  sortBriefingActivities,
  type BriefingActivity,
} from "./care-routine-briefing-core";
import type { Locale } from "@/i18n";

interface SendResult {
  sent: number;
  skipped: number;
  errors: number;
}

export async function runCareRoutineBriefing(now: Date = new Date()): Promise<SendResult> {
  if (!isBriefingEveningSlot(now)) return { sent: 0, skipped: 0, errors: 0 };

  const admin = createAdminClient();
  let sent = 0;
  let skipped = 0;
  let errors = 0;

  const tomorrow = tomorrowKeyBrazil(now);
  const tomorrowWeekday = new Date(tomorrow + "T12:00:00Z").getUTCDay();

  const { data: slotsRaw, error: slotErr } = await admin
    .from("care_routine_slots")
    .select("id, group_id, child_id, weekday, leg, pattern_type, responsible_id, time_of_day, label, week_parity")
    .eq("is_active", true)
    .eq("weekday", tomorrowWeekday);
  if (slotErr) {
    console.error("[CRON care-routine-briefing] slots query failed:", slotErr);
    return { sent: 0, skipped: 0, errors: 1 };
  }
  if (!slotsRaw || slotsRaw.length === 0) return { sent: 0, skipped: 0, errors: 0 };

  const groupIds = Array.from(new Set(slotsRaw.map((s) => s.group_id as string)));
  const childIds = Array.from(new Set(slotsRaw.map((s) => s.child_id as string)));

  const [{ data: overridesRaw }, { data: childrenRaw }, { data: membersRaw }, { data: custodyRaw }, { data: occRaw }] =
    await Promise.all([
      admin.from("care_routine_overrides").select("id, child_id, occurrence_date, leg, responsible_id").eq("occurrence_date", tomorrow).in("child_id", childIds),
      admin.from("children").select("id, group_id, full_name").in("group_id", groupIds),
      admin.from("group_members").select("group_id, user_id, profiles(display_name, full_name)").in("group_id", groupIds),
      admin.from("custody_events").select("id, child_id, start_date, end_date, responsible_user_id, custody_type, created_at").in("child_id", childIds).lte("start_date", tomorrow).gte("end_date", tomorrow),
      admin.from("calendar_occurrences").select("group_id, child_activities!inner(name, time_start)").in("group_id", groupIds).eq("occurrence_date", tomorrow),
    ]);

  const overrides = (overridesRaw ?? []) as unknown as RoutineOverride[];
  const custodyEvents = (custodyRaw ?? []) as unknown as CustodyEvent[];
  const custodyResolver = (cid: string, dk: string) => resolveCustodyOnDate(custodyEvents, cid, dk)?.responsible_user_id ?? null;

  const nameById = new Map<string, string>();
  const membersByGroup = new Map<string, string[]>();
  for (const m of membersRaw ?? []) {
    const prof = Array.isArray((m as { profiles?: unknown }).profiles)
      ? ((m as { profiles: { display_name?: string | null; full_name?: string | null }[] }).profiles[0])
      : ((m as { profiles?: { display_name?: string | null; full_name?: string | null } }).profiles);
    nameById.set(m.user_id as string, getDisplayName(prof?.display_name || prof?.full_name || null, true));
    const arr = membersByGroup.get(m.group_id as string) ?? [];
    arr.push(m.user_id as string);
    membersByGroup.set(m.group_id as string, arr);
  }
  const nameOf = (id: string | null | undefined) => (id ? nameById.get(id) ?? "" : "");

  const childrenByGroup = new Map<string, { id: string; firstName: string }[]>();
  for (const c of childrenRaw ?? []) {
    const arr = childrenByGroup.get(c.group_id as string) ?? [];
    arr.push({ id: c.id as string, firstName: getDisplayName((c.full_name as string) || null, true) });
    childrenByGroup.set(c.group_id as string, arr);
  }

  const activitiesByGroup = new Map<string, BriefingActivity[]>();
  for (const o of occRaw ?? []) {
    const raw = (o as { child_activities?: unknown }).child_activities;
    const act = (Array.isArray(raw) ? raw[0] : raw) as { name: string; time_start: string | null } | undefined;
    if (!act) continue;
    const gid = (o as { group_id: string }).group_id;
    const arr = activitiesByGroup.get(gid) ?? [];
    arr.push({ name: act.name, time: act.time_start ?? null });
    activitiesByGroup.set(gid, arr);
  }

  const slotsByGroup = new Map<string, RoutineSlot[]>();
  for (const s of slotsRaw) {
    const arr = slotsByGroup.get(s.group_id as string) ?? [];
    arr.push(s as unknown as RoutineSlot);
    slotsByGroup.set(s.group_id as string, arr);
  }

  const allUserIds = Array.from(new Set((membersRaw ?? []).map((m) => m.user_id as string)));
  const localeByUser = await getUsersLocale(allUserIds);
  const tByLocale = new Map<Locale, Awaited<ReturnType<typeof getServerT>>>();
  async function getT(loc: Locale) {
    const cached = tByLocale.get(loc);
    if (cached) return cached;
    const fn = await getServerT(loc);
    tByLocale.set(loc, fn);
    return fn;
  }

  // Idempotência: pula quem já recebeu um briefing na última 1h.
  const sinceIso = new Date(now.getTime() - 60 * 60_000).toISOString();
  const { data: priorNotifs } = await admin
    .from("notifications")
    .select("user_id")
    .eq("type", "care_routine_briefing")
    .gte("created_at", sinceIso)
    .in("user_id", allUserIds.length > 0 ? allUserIds : ["00000000-0000-0000-0000-000000000000"]);
  const alreadySent = new Set((priorNotifs ?? []).map((n: { user_id: string }) => n.user_id));

  for (const groupId of groupIds) {
    const groupChildren = childrenByGroup.get(groupId) ?? [];
    if (groupChildren.length === 0) continue;
    const groupSlots = slotsByGroup.get(groupId) ?? [];
    const activities = sortBriefingActivities(activitiesByGroup.get(groupId) ?? []);

    const resolvedByChild: Record<string, ResolvedRoutine> = {};
    for (const c of groupChildren) {
      resolvedByChild[c.id] = resolveRoutineOnDate(groupSlots, overrides, c.id, tomorrow, custodyResolver);
    }
    const tomorrowRoutine = buildRoutineToday(groupChildren, resolvedByChild, nameOf, "__none__");
    // v1: só `together` (uma linha unificada). Split (rotinas diferentes por
    // criança) fica pro app/jornada — push multi-linha é ruído.
    if (tomorrowRoutine.mode !== "together") continue;
    const e = tomorrowRoutine.entries[0];

    for (const userId of membersByGroup.get(groupId) ?? []) {
      if (alreadySent.has(userId)) {
        skipped += 1;
        continue;
      }
      const loc = localeByUser.get(userId) ?? ("pt" as Locale);
      const t = await getT(loc);

      const parts: string[] = [];
      let pickupName: string | null = null;
      if (e.dropoff) parts.push(t("careRoutine.tomorrowDropoff", { name: e.dropoff.responsibleName }));
      if (e.pickup) {
        pickupName = e.pickup.responsibleName;
        parts.push(
          t("careRoutine.tomorrowPickup", { name: e.pickup.responsibleName }) +
            (e.pickup.time ? " " + t("careRoutine.reminderBodyAt", { time: e.pickup.time.slice(0, 5) }) : ""),
        );
      }
      for (const a of activities) {
        parts.push(a.name + (a.time ? " " + t("careRoutine.reminderBodyAt", { time: a.time.slice(0, 5) }) : ""));
      }
      const gap = hasCoverageGap(pickupName, activities);
      if (gap) parts.push(t("careRoutine.briefingGap"));
      if (parts.length === 0) continue;

      try {
        await createNotificationWithPush(
          userId,
          "care_routine_briefing",
          t("careRoutine.briefingPushTitle"),
          parts.join(" · "),
          "/dashboard",
        );
        captureServerEvent(userId, "care_routine_briefing_sent", { hasGap: gap, activities: activities.length });
        sent += 1;
      } catch (caught) {
        console.error("[CRON care-routine-briefing] send failed:", caught);
        errors += 1;
      }
    }
  }

  return { sent, skipped, errors };
}
