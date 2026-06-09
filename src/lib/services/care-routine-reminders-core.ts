/**
 * Núcleo PURO do lembrete de Leva & Busca (sem I/O, sem server-only) —
 * testável isolado, como `care-routine-resolve.ts`.
 *
 * Dado os slots semanais + overrides do dia + `now`, retorna os lembretes que
 * estão "pingando" na janela do slot atual. O wrapper de I/O
 * (`care-routine-reminders.ts`) só lê do banco e dispara o push.
 */

export type RoutineLeg = "dropoff" | "pickup";

// Lead default da logística de leva/busca = 30min (igual categoryDefaultLead
// de 'dropoff'/'pickup' em activity-reminders; constante aqui pra não acoplar
// este núcleo puro ao módulo server-only de reminders).
export const ROUTINE_DEFAULT_LEAD_MINUTES = 30;

// Mesma janela do activity-reminders (slot de 15min com folga ±).
const SLOT_WINDOW_BEFORE_MIN = 8;
const SLOT_WINDOW_AFTER_MIN = 7;
const BRAZIL_OFFSET_MIN = -180; // BR sem DST desde 2019
const SENTINEL_MORNING_OF = -1;
const SENTINEL_EVENING_BEFORE = -2;

export interface RoutineSlotForReminder {
  child_id: string;
  group_id: string;
  weekday: number;
  leg: RoutineLeg;
  responsible_id: string | null;
  time_of_day: string | null;
  reminder_lead_minutes: number | null;
}
export interface RoutineOverrideForReminder {
  child_id: string;
  occurrence_date: string;
  leg: RoutineLeg;
  responsible_id: string;
}
export interface DueRoutineReminder {
  childId: string;
  groupId: string;
  leg: RoutineLeg;
  occurrenceDate: string;
  time: string; // HH:MM:SS
  leadMinutes: number;
  userId: string;
}

/** YYYY-MM-DD + HH:MM:SS interpretado como America/Sao_Paulo (sem DST). */
function eventDateBrazil(dateKey: string, time: string | null): Date | null {
  if (!time) return null;
  const offsetH = Math.abs(Math.floor(BRAZIL_OFFSET_MIN / 60)).toString().padStart(2, "0");
  const offsetM = Math.abs(BRAZIL_OFFSET_MIN % 60).toString().padStart(2, "0");
  const sign = BRAZIL_OFFSET_MIN <= 0 ? "-" : "+";
  return new Date(`${dateKey}T${time}${sign}${offsetH}:${offsetM}`);
}

/** triggerAt absoluto pra (data, horário, lead) — espelha activity-reminders. */
export function computeTriggerAt(dateKey: string, time: string | null, leadMinutes: number): Date | null {
  if (leadMinutes > 0) {
    const eventAt = eventDateBrazil(dateKey, time);
    if (!eventAt) return null;
    return new Date(eventAt.getTime() - leadMinutes * 60_000);
  }
  if (leadMinutes === SENTINEL_MORNING_OF) return eventDateBrazil(dateKey, "08:00:00");
  if (leadMinutes === SENTINEL_EVENING_BEFORE) {
    const d = new Date(dateKey + "T00:00:00Z");
    d.setUTCDate(d.getUTCDate() - 1);
    return eventDateBrazil(d.toISOString().slice(0, 10), "20:00:00");
  }
  return null;
}

/** weekday (0=Dom) de uma data YYYY-MM-DD, estável (UTC noon). */
export function weekdayOfDate(dateKey: string): number {
  return new Date(dateKey + "T12:00:00Z").getUTCDay();
}

/**
 * NÚCLEO PURO: dados os slots + overrides + agora, retorna os lembretes que
 * estão "pingando" na janela atual. Sem I/O.
 *
 * Considera as 3 datas candidatas (ontem/hoje/amanhã) — cobre lead positivo de
 * hoje + sentinel véspera. Override do dia vence o slot pro responsável;
 * `custody_based` (responsável null) é ignorado.
 */
export function selectDueRoutineReminders(
  slots: readonly RoutineSlotForReminder[],
  overrides: readonly RoutineOverrideForReminder[],
  now: Date,
): DueRoutineReminder[] {
  const dates = [-1, 0, 1].map((d) => new Date(now.getTime() + d * 86_400_000).toISOString().slice(0, 10));
  const dateByWeekday = new Map<number, string>();
  for (const d of dates) dateByWeekday.set(weekdayOfDate(d), d);

  const overrideKey = (c: string, d: string, l: string) => `${c}::${d}::${l}`;
  const overrideMap = new Map<string, string>();
  for (const o of overrides) overrideMap.set(overrideKey(o.child_id, o.occurrence_date, o.leg), o.responsible_id);

  const slotStart = new Date(now.getTime() - SLOT_WINDOW_AFTER_MIN * 60_000);
  const slotEnd = new Date(now.getTime() + SLOT_WINDOW_BEFORE_MIN * 60_000);

  const due: DueRoutineReminder[] = [];
  for (const s of slots) {
    if (!s.time_of_day) continue;
    const date = dateByWeekday.get(s.weekday);
    if (!date) continue;
    const leadMinutes = s.reminder_lead_minutes ?? ROUTINE_DEFAULT_LEAD_MINUTES;
    if (leadMinutes === 0) continue; // opt-out
    const triggerAt = computeTriggerAt(date, s.time_of_day, leadMinutes);
    if (!triggerAt) continue;
    if (triggerAt < slotStart || triggerAt > slotEnd) continue;
    const userId = overrideMap.get(overrideKey(s.child_id, date, s.leg)) ?? s.responsible_id;
    if (!userId) continue;
    due.push({
      childId: s.child_id,
      groupId: s.group_id,
      leg: s.leg,
      occurrenceDate: date,
      time: s.time_of_day,
      leadMinutes,
      userId,
    });
  }
  return due;
}

// Follow-up "Buscou?" dispara FOLLOWUP_DELAY_MIN depois do horário da busca.
export const FOLLOWUP_DELAY_MIN = 45;

/**
 * NÚCLEO PURO do follow-up "Buscou?": pernas de PICKUP cujo (horário + 45min)
 * cai na janela atual E ainda NÃO têm registro (loggedChildLegs = `child:leg`
 * já logados hoje). Só pickup (o "estão em casa?" é a pergunta que importa) —
 * evita push dobrado. Override do dia vence o slot pro destinatário.
 */
export function selectDueRoutineFollowUps(
  slots: readonly RoutineSlotForReminder[],
  overrides: readonly RoutineOverrideForReminder[],
  loggedChildLegs: ReadonlySet<string>,
  now: Date,
): DueRoutineReminder[] {
  const dates = [-1, 0, 1].map((d) => new Date(now.getTime() + d * 86_400_000).toISOString().slice(0, 10));
  const dateByWeekday = new Map<number, string>();
  for (const d of dates) dateByWeekday.set(weekdayOfDate(d), d);

  const overrideKey = (c: string, d: string, l: string) => `${c}::${d}::${l}`;
  const overrideMap = new Map<string, string>();
  for (const o of overrides) overrideMap.set(overrideKey(o.child_id, o.occurrence_date, o.leg), o.responsible_id);

  const slotStart = new Date(now.getTime() - SLOT_WINDOW_AFTER_MIN * 60_000);
  const slotEnd = new Date(now.getTime() + SLOT_WINDOW_BEFORE_MIN * 60_000);

  const due: DueRoutineReminder[] = [];
  for (const s of slots) {
    if (s.leg !== 'pickup') continue;
    if (!s.time_of_day) continue;
    if (loggedChildLegs.has(`${s.child_id}:${s.leg}`)) continue;
    const date = dateByWeekday.get(s.weekday);
    if (!date) continue;
    const eventAt = eventDateBrazil(date, s.time_of_day);
    if (!eventAt) continue;
    const followupAt = new Date(eventAt.getTime() + FOLLOWUP_DELAY_MIN * 60_000);
    if (followupAt < slotStart || followupAt > slotEnd) continue;
    const userId = overrideMap.get(overrideKey(s.child_id, date, s.leg)) ?? s.responsible_id;
    if (!userId) continue;
    due.push({
      childId: s.child_id,
      groupId: s.group_id,
      leg: s.leg,
      occurrenceDate: date,
      time: s.time_of_day,
      leadMinutes: FOLLOWUP_DELAY_MIN,
      userId,
    });
  }
  return due;
}
