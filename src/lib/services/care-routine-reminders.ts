/* ------------------------------------------------------------------ */
/* services/care-routine-reminders.ts  (server-only)                   */
/* Lembrete pré-leva/busca. Irmão de runActivityDueReminders, chamado  */
/* pelo MESMO cron /api/cron/activity-due-reminders (a cada 15min).    */
/*                                                                     */
/* O núcleo PURO (seleção dos due) vive em                             */
/* care-routine-reminders-core.ts (testável sem banco). Este wrapper   */
/* só faz I/O: lê slots/overrides, dispara push pro responsável        */
/* (override do dia vence o slot), idempotente via                     */
/* care_routine_reminder_sends. Tom calmo (push normal, sem bypass     */
/* de DND).                                                            */
/* ------------------------------------------------------------------ */
import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { createNotificationWithPush } from "@/lib/push";
import { captureServerEvent } from "@/lib/posthog-server";
import { getServerT } from "@/i18n/server";
import { getUsersLocale } from "@/lib/locale-utils";
import { getDisplayName } from "@/lib/constants";
import {
  selectDueRoutineReminders,
  selectDueRoutineFollowUps,
  type RoutineSlotForReminder,
  type RoutineOverrideForReminder,
} from "./care-routine-reminders-core";
import type { Locale } from "@/i18n";

interface SendResult {
  sent: number;
  skipped: number;
  errors: number;
}

export async function runCareRoutineReminders(now: Date = new Date()): Promise<SendResult> {
  const admin = createAdminClient();
  let sent = 0;
  let skipped = 0;
  let errors = 0;

  const dates = [-1, 0, 1].map((d) => new Date(now.getTime() + d * 86_400_000).toISOString().slice(0, 10));

  const { data: slots, error: slotErr } = await admin
    .from("care_routine_slots")
    .select("child_id, group_id, weekday, leg, responsible_id, time_of_day, reminder_lead_minutes")
    .eq("is_active", true)
    .eq("pattern_type", "weekly")
    .not("time_of_day", "is", null)
    .not("responsible_id", "is", null);
  if (slotErr) {
    console.error("[CRON care-routine-reminders] slots query failed:", slotErr);
    return { sent: 0, skipped: 0, errors: 1 };
  }
  if (!slots || slots.length === 0) return { sent: 0, skipped: 0, errors: 0 };

  const childIds0 = Array.from(new Set(slots.map((s) => s.child_id as string)));
  const { data: overrides } = await admin
    .from("care_routine_overrides")
    .select("child_id, occurrence_date, leg, responsible_id")
    .in("occurrence_date", dates)
    .in("child_id", childIds0);

  const due = selectDueRoutineReminders(
    slots as unknown as RoutineSlotForReminder[],
    (overrides ?? []) as unknown as RoutineOverrideForReminder[],
    now,
  );
  if (due.length === 0) return { sent: 0, skipped: 0, errors: 0 };

  // Idempotência bulk.
  const childIds = Array.from(new Set(due.map((d) => d.childId)));
  const userIds = Array.from(new Set(due.map((d) => d.userId)));
  const { data: prior } = await admin
    .from("care_routine_reminder_sends")
    .select("child_id, occurrence_date, leg, lead_minutes, user_id")
    .eq("channel", "push")
    .in("child_id", childIds)
    .in("user_id", userIds);
  const sentKeys = new Set(
    (prior ?? []).map(
      (r: { child_id: string; occurrence_date: string; leg: string; lead_minutes: number; user_id: string }) =>
        `${r.child_id}::${r.occurrence_date}::${r.leg}::${r.lead_minutes}::${r.user_id}`,
    ),
  );

  // Nomes das crianças + t() por locale do destinatário.
  const { data: kids } = await admin.from("children").select("id, full_name").in("id", childIds);
  const childName = new Map<string, string>();
  for (const k of (kids ?? []) as { id: string; full_name: string | null }[]) {
    childName.set(k.id, getDisplayName(k.full_name, true));
  }
  const localeByUser = await getUsersLocale(userIds);
  const tByLocale = new Map<Locale, Awaited<ReturnType<typeof getServerT>>>();
  async function getT(loc: Locale) {
    const cached = tByLocale.get(loc);
    if (cached) return cached;
    const fn = await getServerT(loc);
    tByLocale.set(loc, fn);
    return fn;
  }

  for (const d of due) {
    const key = `${d.childId}::${d.occurrenceDate}::${d.leg}::${d.leadMinutes}::${d.userId}`;
    if (sentKeys.has(key)) {
      skipped += 1;
      continue;
    }
    const loc = localeByUser.get(d.userId) ?? ("pt" as Locale);
    const t = await getT(loc);
    const child = childName.get(d.childId) ?? "";
    const timeShort = d.time.slice(0, 5);
    const title =
      d.leg === "dropoff"
        ? t("careRoutine.reminderDropoffTitle", { child })
        : t("careRoutine.reminderPickupTitle", { child });
    const body = t("careRoutine.reminderBodyAt", { time: timeShort });
    // Deep link pro /dashboard (existe em PWA E Native; é onde o chip "Hoje:
    // quem leva/busca" aparece). /calendario/rotina não tem rota nativa → quebraria
    // o tap do push no app nativo.
    const link = "/dashboard";

    try {
      // Tom calmo: push normal (sem time-sensitive bypass de DND).
      await createNotificationWithPush(d.userId, "care_routine_reminder", title, body, link);
      await admin.from("care_routine_reminder_sends").insert({
        child_id: d.childId,
        occurrence_date: d.occurrenceDate,
        leg: d.leg,
        lead_minutes: d.leadMinutes,
        user_id: d.userId,
        channel: "push",
      });
      captureServerEvent(d.userId, "care_routine_reminder_sent", { leg: d.leg, occurrence_date: d.occurrenceDate });
      sent += 1;
    } catch (caught) {
      console.error("[CRON care-routine-reminders] send failed:", caught);
      errors += 1;
    }
  }

  return { sent, skipped, errors };
}

/**
 * Follow-up "Buscou o X?" — push ~45min após a busca pra pernas de PICKUP ainda
 * NÃO registradas. Idempotente via care_routine_reminder_sends channel='followup'.
 * Deep link /dashboard (onde o "Buscou? Sim/Não" aparece).
 */
export async function runCareRoutineFollowUps(now: Date = new Date()): Promise<SendResult> {
  const admin = createAdminClient();
  let sent = 0;
  let skipped = 0;
  let errors = 0;

  const dates = [-1, 0, 1].map((d) => new Date(now.getTime() + d * 86_400_000).toISOString().slice(0, 10));

  const { data: slots, error: slotErr } = await admin
    .from("care_routine_slots")
    .select("child_id, group_id, weekday, leg, responsible_id, time_of_day, reminder_lead_minutes")
    .eq("is_active", true)
    .eq("pattern_type", "weekly")
    .eq("leg", "pickup")
    .not("time_of_day", "is", null)
    .not("responsible_id", "is", null);
  if (slotErr) {
    console.error("[CRON care-routine-followups] slots query failed:", slotErr);
    return { sent: 0, skipped: 0, errors: 1 };
  }
  if (!slots || slots.length === 0) return { sent: 0, skipped: 0, errors: 0 };

  const childIds0 = Array.from(new Set(slots.map((s) => s.child_id as string)));
  const [{ data: overrides }, { data: logs }] = await Promise.all([
    admin
      .from("care_routine_overrides")
      .select("child_id, occurrence_date, leg, responsible_id")
      .in("occurrence_date", dates)
      .in("child_id", childIds0),
    admin
      .from("care_routine_logs")
      .select("child_id, leg")
      .in("occurrence_date", dates)
      .in("child_id", childIds0),
  ]);
  const loggedChildLegs = new Set(
    (logs ?? []).map((l: { child_id: string; leg: string }) => `${l.child_id}:${l.leg}`),
  );

  const due = selectDueRoutineFollowUps(
    slots as unknown as RoutineSlotForReminder[],
    (overrides ?? []) as unknown as RoutineOverrideForReminder[],
    loggedChildLegs,
    now,
  );
  if (due.length === 0) return { sent: 0, skipped: 0, errors: 0 };

  const childIds = Array.from(new Set(due.map((d) => d.childId)));
  const userIds = Array.from(new Set(due.map((d) => d.userId)));
  const { data: prior } = await admin
    .from("care_routine_reminder_sends")
    .select("child_id, occurrence_date, leg, lead_minutes, user_id")
    .eq("channel", "followup")
    .in("child_id", childIds)
    .in("user_id", userIds);
  const sentKeys = new Set(
    (prior ?? []).map(
      (r: { child_id: string; occurrence_date: string; leg: string; lead_minutes: number; user_id: string }) =>
        `${r.child_id}::${r.occurrence_date}::${r.leg}::${r.lead_minutes}::${r.user_id}`,
    ),
  );

  const { data: kids } = await admin.from("children").select("id, full_name").in("id", childIds);
  const childName = new Map<string, string>();
  for (const k of (kids ?? []) as { id: string; full_name: string | null }[]) {
    childName.set(k.id, getDisplayName(k.full_name, true));
  }
  const localeByUser = await getUsersLocale(userIds);
  const tByLocale = new Map<Locale, Awaited<ReturnType<typeof getServerT>>>();
  async function getT(loc: Locale) {
    const cached = tByLocale.get(loc);
    if (cached) return cached;
    const fn = await getServerT(loc);
    tByLocale.set(loc, fn);
    return fn;
  }

  for (const d of due) {
    const key = `${d.childId}::${d.occurrenceDate}::${d.leg}::${d.leadMinutes}::${d.userId}`;
    if (sentKeys.has(key)) {
      skipped += 1;
      continue;
    }
    const loc = localeByUser.get(d.userId) ?? ("pt" as Locale);
    const t = await getT(loc);
    const child = childName.get(d.childId) ?? "";
    const title = t("careRoutine.confirmPickup", { name: child });
    const body = t("careRoutine.reminderBodyAt", { time: d.time.slice(0, 5) });

    try {
      await createNotificationWithPush(d.userId, "care_routine_reminder", title, body, "/dashboard");
      await admin.from("care_routine_reminder_sends").insert({
        child_id: d.childId,
        occurrence_date: d.occurrenceDate,
        leg: d.leg,
        lead_minutes: d.leadMinutes,
        user_id: d.userId,
        channel: "followup",
      });
      captureServerEvent(d.userId, "care_routine_followup_sent", { occurrence_date: d.occurrenceDate });
      sent += 1;
    } catch (caught) {
      console.error("[CRON care-routine-followups] send failed:", caught);
      errors += 1;
    }
  }

  return { sent, skipped, errors };
}
