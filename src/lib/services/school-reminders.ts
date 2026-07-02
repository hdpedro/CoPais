/* ------------------------------------------------------------------ */
/* school-reminders.ts — lembrete da VÉSPERA das provas (school_logs)   */
/*                                                                      */
/* Cron isolado (roda junto do activity-due-reminders, /15min). As      */
/* provas do Brain agora vivem em school_logs + espelho `events`; o cron */
/* de child_activities NÃO as toca (blast radius). Este serviço varre    */
/* os `events` de escola (school_log_id != null), dispara o lembrete     */
/* véspera-20h BRT (SENTINEL_EVENING_BEFORE) pros membros do grupo, com  */
/* idempotência própria (school_reminder_sends — activity_reminder_sends */
/* tem FK a child_activities, não dá reuso). Reusa o slot/trigger do     */
/* activity-reminders (mesma matemática de horário). Puro I/O.           */
/* ------------------------------------------------------------------ */

import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { createNotificationWithPush } from "@/lib/push";
import { getServerT } from "@/i18n/server";
import { getUsersLocale } from "@/lib/locale-utils";
import {
  SLOT_WINDOW_BEFORE_MIN,
  SLOT_WINDOW_AFTER_MIN,
  SENTINEL_EVENING_BEFORE,
  computeTriggerAt,
} from "./activity-reminders";
import { pickExamReminderTargets, eveOf } from "@/lib/school-reminder-routing";
import type { CustodyEvent } from "@/lib/custody-resolve";
import type { RoutineOverride, RoutineSlot } from "@/lib/care-routine-resolve";
import type { GroupArrangement } from "@/lib/responsible-resolve";

interface SendResult {
  sent: number;
  skipped: number;
  errors: number;
}

interface DueExam {
  school_log_id: string;
  group_id: string;
  child_id: string | null;
  title: string; // título do evento no calendário (ex: "📚 Prova · Matemática")
  event_date: string; // YYYY-MM-DD
}

/** Snapshot de guarda/rotina de um grupo pro roteamento do lembrete (R2). */
interface GroupRoutingSnapshot {
  arrangement: GroupArrangement;
  custodyEvents: CustodyEvent[];
  slots: RoutineSlot[];
  overrides: RoutineOverride[];
}

const ARRANGEMENTS: readonly GroupArrangement[] = ["rotating", "together", "single", "custom"];

/**
 * Carrega o snapshot de guarda/rotina dos grupos com prova no slot. Qualquer
 * falha aqui NÃO derruba o lembrete: devolve snapshot vazio → o roteamento
 * cai no fanout atual (fail-open).
 */
async function loadRoutingSnapshots(
  admin: ReturnType<typeof createAdminClient>,
  groupIds: string[],
  dueDates: string[],
): Promise<Map<string, GroupRoutingSnapshot>> {
  const snapshots = new Map<string, GroupRoutingSnapshot>();
  for (const g of groupIds) {
    snapshots.set(g, { arrangement: "rotating", custodyEvents: [], slots: [], overrides: [] });
  }
  if (groupIds.length === 0 || dueDates.length === 0) return snapshots;
  try {
    const minDate = eveOf([...dueDates].sort()[0]);
    const maxDate = [...dueDates].sort().at(-1) as string;

    const [groupsRes, custodyRes, slotsRes, overridesRes] = await Promise.all([
      admin.from("coparenting_groups").select("id, arrangement").in("id", groupIds),
      admin
        .from("custody_events")
        .select("id, group_id, child_id, start_date, end_date, responsible_user_id, custody_type, created_at")
        .in("group_id", groupIds)
        .lte("start_date", maxDate)
        .gte("end_date", minDate),
      admin
        .from("care_routine_slots")
        .select("id, group_id, child_id, weekday, leg, pattern_type, responsible_id, time_of_day, label, week_parity")
        .in("group_id", groupIds)
        .eq("is_active", true),
      admin
        .from("care_routine_overrides")
        .select("id, group_id, child_id, occurrence_date, leg, responsible_id")
        .in("group_id", groupIds)
        .gte("occurrence_date", minDate)
        .lte("occurrence_date", maxDate),
    ]);

    for (const g of (groupsRes.data ?? []) as Array<{ id: string; arrangement: string | null }>) {
      const snap = snapshots.get(g.id);
      if (snap && g.arrangement && (ARRANGEMENTS as readonly string[]).includes(g.arrangement)) {
        snap.arrangement = g.arrangement as GroupArrangement;
      }
    }
    for (const e of (custodyRes.data ?? []) as Array<CustodyEvent & { group_id: string }>) {
      snapshots.get(e.group_id)?.custodyEvents.push(e);
    }
    for (const s of (slotsRes.data ?? []) as Array<RoutineSlot & { group_id: string }>) {
      snapshots.get(s.group_id)?.slots.push(s);
    }
    for (const o of (overridesRes.data ?? []) as Array<RoutineOverride & { group_id: string }>) {
      snapshots.get(o.group_id)?.overrides.push(o);
    }
  } catch (e) {
    console.error("[CRON school-exam-reminders] routing snapshot failed (fail-open p/ fanout):", e);
  }
  return snapshots;
}

/** Instante do lembrete véspera-20h BRT p/ uma prova na data `eventDate`. Puro. */
export function schoolExamTriggerAt(eventDate: string): Date | null {
  return computeTriggerAt(eventDate, null, SENTINEL_EVENING_BEFORE);
}

/** A prova (eventDate) está "pingando" o lembrete no slot atual? Puro/testável. */
export function isSchoolExamDue(eventDate: string, now: Date): boolean {
  const triggerAt = schoolExamTriggerAt(eventDate);
  if (!triggerAt) return false;
  const slotStart = new Date(now.getTime() - SLOT_WINDOW_AFTER_MIN * 60_000);
  const slotEnd = new Date(now.getTime() + SLOT_WINDOW_BEFORE_MIN * 60_000);
  return triggerAt >= slotStart && triggerAt <= slotEnd;
}

/**
 * Identifica provas cujo lembrete véspera-20h cai no slot atual, resolve os
 * membros do grupo, evita duplicata via school_reminder_sends e dispara push.
 * `now` injetável pra teste. Retorna contagem pra observabilidade.
 */
export async function runSchoolExamReminders(now: Date = new Date()): Promise<SendResult> {
  const admin = createAdminClient();
  let sent = 0;
  let skipped = 0;
  let errors = 0;

  // Janela ampla (ontem..amanhã) cobre o boundary de fuso; o filtro fino é o slot.
  const tomorrow = new Date(now.getTime() + 86_400_000).toISOString().slice(0, 10);
  const yesterday = new Date(now.getTime() - 86_400_000).toISOString().slice(0, 10);

  const { data: rows, error } = await admin
    .from("events")
    .select("id, group_id, child_id, title, event_date, school_log_id")
    .not("school_log_id", "is", null)
    .gte("event_date", yesterday)
    .lte("event_date", tomorrow);
  if (error) {
    console.error("[CRON school-exam-reminders] events query failed:", error);
    return { sent: 0, skipped: 0, errors: 1 };
  }
  if (!rows || rows.length === 0) return { sent: 0, skipped: 0, errors: 0 };

  // Filtra pelas cujo lembrete véspera-20h cai no slot atual (±8/7min).
  const due: DueExam[] = [];
  for (const r of rows as Array<{
    group_id: string;
    child_id: string | null;
    title: string;
    event_date: string;
    school_log_id: string | null;
  }>) {
    if (!r.school_log_id) continue;
    if (isSchoolExamDue(r.event_date, now)) {
      due.push({
        school_log_id: r.school_log_id,
        group_id: r.group_id,
        child_id: r.child_id,
        title: r.title,
        event_date: r.event_date,
      });
    }
  }
  if (due.length === 0) return { sent: 0, skipped: 0, errors: 0 };

  // Membros elegíveis (admin/member) — o universo E o fallback do roteamento.
  const groupIds = Array.from(new Set(due.map((d) => d.group_id)));
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

  // R2 (épica Guarda & Rotina): o lembrete vai pra PESSOA CERTA DO DIA —
  // união {responsável da véspera} ∪ {responsável do dia da prova}, via
  // resolvedor único ciente do arranjo. Sem escala/rotina → fanout atual.
  const snapshots = await loadRoutingSnapshots(
    admin,
    groupIds,
    due.map((d) => d.event_date),
  );

  const pairs: Array<{ d: DueExam; userId: string }> = [];
  for (const d of due) {
    const memberIds = membersByGroup.get(d.group_id) ?? [];
    const snap = snapshots.get(d.group_id);
    const targets = snap
      ? pickExamReminderTargets({
          arrangement: snap.arrangement,
          custodyEvents: snap.custodyEvents,
          slots: snap.slots,
          overrides: snap.overrides,
          childId: d.child_id,
          examDate: d.event_date,
          memberIds,
        })
      : memberIds;
    for (const userId of targets) pairs.push({ d, userId });
  }
  if (pairs.length === 0) return { sent: 0, skipped: 0, errors: 0 };

  // Idempotência: 1 query pros já enviados (school_log, event_date, user).
  const logIds = Array.from(new Set(pairs.map((p) => p.d.school_log_id)));
  const userIds = Array.from(new Set(pairs.map((p) => p.userId)));
  const { data: prior } = await admin
    .from("school_reminder_sends")
    .select("school_log_id, event_date, user_id")
    .eq("channel", "push")
    .eq("lead_minutes", SENTINEL_EVENING_BEFORE)
    .in("school_log_id", logIds)
    .in("user_id", userIds);
  const sentKeys = new Set(
    (prior ?? []).map(
      (r: { school_log_id: string; event_date: string; user_id: string }) =>
        `${r.school_log_id}::${r.event_date}::${r.user_id}`,
    ),
  );

  const localeByUser = await getUsersLocale(userIds);
  for (const { d, userId } of pairs) {
    const key = `${d.school_log_id}::${d.event_date}::${userId}`;
    if (sentKeys.has(key)) {
      skipped++;
      continue;
    }
    try {
      const t = await getServerT(localeByUser.get(userId));
      const title = t("notifications.brain.examReminderTitle");
      const body = t("notifications.brain.examReminderBody", { exam: d.title });
      await createNotificationWithPush(userId, "school_exam_reminder", title, body, "/escola");
      await admin.from("school_reminder_sends").insert({
        school_log_id: d.school_log_id,
        event_date: d.event_date,
        lead_minutes: SENTINEL_EVENING_BEFORE,
        user_id: userId,
        channel: "push",
      });
      sentKeys.add(key); // evita reenvio na mesma rodada (2 provas mesmo user)
      sent++;
    } catch (e) {
      errors++;
      console.error("[CRON school-exam-reminders] send failed:", e);
    }
  }

  return { sent, skipped, errors };
}
