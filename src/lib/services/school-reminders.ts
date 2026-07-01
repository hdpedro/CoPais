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

interface SendResult {
  sent: number;
  skipped: number;
  errors: number;
}

interface DueExam {
  school_log_id: string;
  group_id: string;
  title: string; // título do evento no calendário (ex: "📚 Prova · Matemática")
  event_date: string; // YYYY-MM-DD
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
    .select("id, group_id, title, event_date, school_log_id")
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
  for (const r of rows as Array<{ group_id: string; title: string; event_date: string; school_log_id: string | null }>) {
    if (!r.school_log_id) continue;
    if (isSchoolExamDue(r.event_date, now)) {
      due.push({ school_log_id: r.school_log_id, group_id: r.group_id, title: r.title, event_date: r.event_date });
    }
  }
  if (due.length === 0) return { sent: 0, skipped: 0, errors: 0 };

  // Destinatários = membros admin/member do grupo (prova é da família toda).
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

  const pairs: Array<{ d: DueExam; userId: string }> = [];
  for (const d of due) for (const userId of membersByGroup.get(d.group_id) ?? []) pairs.push({ d, userId });
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
