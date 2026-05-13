/**
 * School service — single source of truth for the school module.
 *
 * Used by:
 *   - src/actions/school.ts          (PWA server actions, FormData)
 *   - src/app/api/school/route.ts    (Native REST endpoint, JSON + Bearer)
 *
 * Each caller does only auth + parsing + adapting the return shape.
 * Business rules (subtype validation, kind classification, calendar
 * mirroring) live here. Mirrors the pattern used for swap/expenses/notes
 * (see DEV/.claude/CLAUDE.md "Regra crítica: paridade").
 *
 * Domain model
 * ────────────
 *   Two intent groups:
 *     EVENT subtypes  — happen on a date, mirrored to the calendar
 *       exam, meeting, event (school event), homework, absence
 *     NOTE subtypes   — historical record, NOT on calendar
 *       grade (boletim), behavior, achievement, concern, other
 *
 * The DB stores subtype on `school_logs.log_type` (enum). Calendar mirror
 * lives in `events` with FK `school_log_id` pointing back to the log.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
// Types + client-safe utilities live in school-shared.ts so that client
// code (EscolaClient, native) can import them WITHOUT pulling this
// server-only file (which transitively depends on next/headers and Node
// crypto via collab.ts). Re-export here for ergonomic server-side import.
import {
  type SchoolSubtype,
  type SchoolKind,
  type SchoolPriority,
  getKind,
  isValidSubtype,
} from "./school-shared";

export type { SchoolSubtype, SchoolKind, SchoolPriority } from "./school-shared";
export { EVENT_SUBTYPES, NOTE_SUBTYPES, getKind, isValidSubtype } from "./school-shared";

// notifyCollabCreate is server-only (uses next/headers, Node crypto).
// Imported statically here — fine because school.ts is itself server-only
// (it only ships server-side; clients import from school-shared.ts).
import { notifyCollabCreate } from "./collab";

// ── Server-only types ───────────────────────────────────────────────────

export interface CreateSchoolLogInput {
  groupId: string;
  childId: string;
  userId: string;
  subtype: SchoolSubtype;
  title: string;
  description?: string | null;
  logDate: string;          // YYYY-MM-DD
  /** Required for kind="event"; optional otherwise (used as time of day on the calendar). */
  eventTime?: string | null;  // HH:MM
  /** Prova-specific: subject (matéria) — also used to prefix calendar title. */
  subject?: string | null;
  /** Prova-specific (or future grade evolution) — free-text grade. */
  score?: string | null;
  /** Collaborative priority — drives push urgency + UI emphasis. Defaults to 'info'. */
  priority?: SchoolPriority;
  /** Display name of the actor — used for the coparent push title.
   *  Optional; falls back to a generic message if not provided. */
  actorDisplayName?: string | null;
}

export interface CreateSchoolLogResult {
  schoolLogId: string;
  /** Set when subtype is an event (also created an `events` row). */
  eventId: string | null;
  kind: SchoolKind;
}

export type ServiceResult<T> = { success: true; data: T } | { success: false; error: string };

// ── Validation regexes ───────────────────────────────────────────────────
// `isValidSubtype` lives in school-shared.ts (used by both client and server).

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const HHMM = /^\d{2}:\d{2}$/;

/**
 * Build the calendar title for a school event. Examples:
 *   exam    + "Trigonometria"     → "📚 Prova · Matemática"  (when subject)
 *   meeting + "Reunião de pais"   → "👥 Reunião escolar"
 *   event   + "Festa junina"      → "🎉 Festa junina"
 */
function calendarTitleFor(args: { subtype: SchoolSubtype; title: string; subject?: string | null }): string {
  const labelByType: Record<SchoolSubtype, string> = {
    exam: "📚 Prova",
    meeting: "👥 Reunião escolar",
    event: "🎉 Evento escolar",
    homework: "📝 Tarefa escolar",
    absence: "🚫 Falta escolar",
    // notes don't reach this function (kind=note skips calendar)
    grade: "📊 Nota",
    behavior: "📋 Comportamento",
    achievement: "🏆 Conquista",
    concern: "⚠️ Atenção",
    other: "📌 Registro escolar",
  };
  const prefix = labelByType[args.subtype];
  if (args.subtype === "exam" && args.subject) {
    return `${prefix} · ${args.subject}`;
  }
  // For non-exam events, use the user title verbatim (it carries the meaning).
  return `${prefix}: ${args.title}`;
}

function eventDescriptionFor(args: { description?: string | null; subtype: SchoolSubtype; score?: string | null }): string | null {
  const parts = [args.description?.trim()].filter(Boolean) as string[];
  if (args.subtype === "exam" && args.score) parts.push(`Nota: ${args.score}`);
  return parts.length > 0 ? parts.join("\n") : null;
}

// ── Public API ───────────────────────────────────────────────────────────

/**
 * Verify the child belongs to the active group. Returns true on success,
 * false otherwise (caller should 403/redirect).
 */
async function verifyChildInGroup(
  supabase: SupabaseClient,
  childId: string,
  groupId: string,
): Promise<boolean> {
  const { data } = await supabase
    .from("children")
    .select("id")
    .eq("id", childId)
    .eq("group_id", groupId)
    .maybeSingle();
  return !!data;
}

/**
 * Create a school log. When the subtype is an event-kind, also creates a
 * matching `events` row so the entry appears on the family calendar.
 *
 * The auth check (user is a member of the group) is the caller's
 * responsibility — actions and API routes already do it before reaching
 * this function.
 */
export async function createSchoolLog(
  supabase: SupabaseClient,
  input: CreateSchoolLogInput,
): Promise<ServiceResult<CreateSchoolLogResult>> {
  // ── Validation ──────────────────────────────────────────────────────
  const title = input.title?.trim();
  if (!title) return { success: false, error: "Título obrigatório." };
  if (!isValidSubtype(input.subtype)) return { success: false, error: "Tipo inválido." };
  if (!ISO_DATE.test(input.logDate)) return { success: false, error: "Data inválida (esperado YYYY-MM-DD)." };
  if (input.eventTime && !HHMM.test(input.eventTime)) return { success: false, error: "Horário inválido (esperado HH:MM)." };

  if (!(await verifyChildInGroup(supabase, input.childId, input.groupId))) {
    return { success: false, error: "Criança não pertence a este grupo." };
  }

  const kind = getKind(input.subtype);

  // ── 1. Insert school_log ────────────────────────────────────────────
  const { data: schoolLog, error: schoolErr } = await supabase
    .from("school_logs")
    .insert({
      group_id: input.groupId,
      child_id: input.childId,
      log_type: input.subtype,
      title,
      description: input.description?.trim() || null,
      log_date: input.logDate,
      logged_by: input.userId,
      subject: input.subject?.trim() || null,
      score: input.score?.trim() || null,
      priority: input.priority || "info",
    })
    .select("id")
    .single();
  if (schoolErr || !schoolLog) {
    return { success: false, error: schoolErr?.message || "Falha ao salvar registro escolar." };
  }

  // ── 2. Mirror to events when kind=event ─────────────────────────────
  let eventId: string | null = null;
  if (kind === "event") {
    const calendarTitle = calendarTitleFor({ subtype: input.subtype, title: input.title, subject: input.subject });
    const calendarDesc = eventDescriptionFor({ description: input.description, subtype: input.subtype, score: input.score });
    const { data: ev, error: evErr } = await supabase
      .from("events")
      .insert({
        group_id: input.groupId,
        child_id: input.childId,
        title: calendarTitle,
        description: calendarDesc,
        event_date: input.logDate,
        event_time: input.eventTime || null,
        all_day: !input.eventTime,
        created_by: input.userId,
        school_log_id: schoolLog.id,
      })
      .select("id")
      .single();
    if (evErr) {
      // Roll back the school_log so we don't leave a half-state. Use admin
      // when caller passed admin client; same client deletes its own write.
      await supabase.from("school_logs").delete().eq("id", schoolLog.id);
      return { success: false, error: `Falha ao criar evento no calendário: ${evErr.message}` };
    }
    eventId = ev?.id ?? null;
  }

  // ── 3. Notify coparents (best-effort, never blocks the create) ──────
  // Coalesces in a 60s burst so creating multiple records back-to-back
  // shows as one aggregated push ("Amanda adicionou N registros escolares")
  // instead of N separate alerts. Edit doesn't notify (default rule).
  // notifyCollabCreate is server-only and never throws (silent failure),
  // so we don't need a try/catch here. Imported statically — safe because
  // this file is server-only and clients use school-shared.ts.
  const actorName = input.actorDisplayName?.trim() || "Um responsável";
  const pushTitle = `${actorName} adicionou um registro escolar`;
  await notifyCollabCreate({
    recordType: "school_log",
    recordId: schoolLog.id,
    groupId: input.groupId,
    actorUserId: input.userId,
    priority: input.priority || "info",
    title: pushTitle,
    message: title,
    link: `/escola?highlight=${schoolLog.id}`,
  });

  return { success: true, data: { schoolLogId: schoolLog.id, eventId, kind } };
}

/**
 * Delete a school log. ON DELETE CASCADE on events.school_log_id removes
 * the calendar mirror automatically — caller doesn't need to clean up.
 */
export async function deleteSchoolLog(
  supabase: SupabaseClient,
  logId: string,
): Promise<ServiceResult<{ deletedId: string }>> {
  const { error } = await supabase.from("school_logs").delete().eq("id", logId);
  if (error) return { success: false, error: error.message };
  return { success: true, data: { deletedId: logId } };
}

/**
 * Update any user-editable field on a school log, keeping the calendar
 * mirror in sync. Supports all fields: title, description, subject, score,
 * subtype (log_type), child, log_date, eventTime.
 *
 * Calendar mirror lifecycle when subtype changes kind:
 *   note → event   creates a new `events` row (requires `userId`)
 *   event → note   deletes the existing `events` row
 *   event → event  updates title/description/date/time/child on the row
 *   note → note    no calendar effect
 *
 * `userId` is only required when the patch results in creating a new
 * calendar row (kind transition note→event); pass it whenever you have it.
 */
export async function updateSchoolLog(
  supabase: SupabaseClient,
  logId: string,
  patch: {
    title?: string;
    description?: string | null;
    subject?: string | null;
    score?: string | null;
    subtype?: SchoolSubtype;
    childId?: string;
    logDate?: string;
    eventTime?: string | null;
    /** Edit doesn't trigger a notification by default (CLAUDE.md: edit
     *  is silent to avoid spam). Priority escalation re-notification is
     *  a Fase 2 feature. */
    priority?: SchoolPriority;
  },
  userId?: string,
): Promise<ServiceResult<{ id: string }>> {
  // ── Fetch current state ──────────────────────────────────────────────
  const { data: existing, error: readErr } = await supabase
    .from("school_logs")
    .select("id, group_id, child_id, log_type, title, description, log_date, subject, score")
    .eq("id", logId)
    .maybeSingle();
  if (readErr || !existing) return { success: false, error: "Registro não encontrado." };

  // ── Validate patch ───────────────────────────────────────────────────
  if (patch.subtype !== undefined && !isValidSubtype(patch.subtype)) {
    return { success: false, error: "Tipo inválido." };
  }
  if (patch.logDate !== undefined && !ISO_DATE.test(patch.logDate)) {
    return { success: false, error: "Data inválida (esperado YYYY-MM-DD)." };
  }
  if (patch.eventTime && !HHMM.test(patch.eventTime)) {
    return { success: false, error: "Horário inválido (esperado HH:MM)." };
  }
  if (patch.childId !== undefined && patch.childId !== existing.child_id) {
    if (!(await verifyChildInGroup(supabase, patch.childId, existing.group_id))) {
      return { success: false, error: "Criança não pertence a este grupo." };
    }
  }

  // ── Build school_logs update ─────────────────────────────────────────
  const update: Record<string, string | null> = {};
  if (patch.title !== undefined) {
    const t = patch.title.trim();
    if (!t) return { success: false, error: "Título obrigatório." };
    update.title = t;
  }
  if (patch.description !== undefined) update.description = patch.description?.trim() || null;
  if (patch.subject !== undefined) update.subject = patch.subject?.trim() || null;
  if (patch.score !== undefined) update.score = patch.score?.trim() || null;
  if (patch.subtype !== undefined) update.log_type = patch.subtype;
  if (patch.childId !== undefined) update.child_id = patch.childId;
  if (patch.logDate !== undefined) update.log_date = patch.logDate;
  if (patch.priority !== undefined) update.priority = patch.priority;

  if (Object.keys(update).length > 0) {
    const { error } = await supabase.from("school_logs").update(update).eq("id", logId);
    if (error) return { success: false, error: error.message };
  }

  // ── Sync calendar mirror ─────────────────────────────────────────────
  // Compute the merged "next" state — needed both to decide kind transition
  // and to generate the calendar title/description.
  const nextSubtype = (patch.subtype ?? (existing.log_type as SchoolSubtype));
  const nextTitle = patch.title !== undefined ? (update.title as string) : (existing.title as string);
  const nextDescription = patch.description !== undefined
    ? (update.description as string | null)
    : (existing.description as string | null);
  const nextSubject = patch.subject !== undefined
    ? (update.subject as string | null)
    : (existing.subject as string | null);
  const nextScore = patch.score !== undefined
    ? (update.score as string | null)
    : (existing.score as string | null);
  const nextChildId = patch.childId !== undefined ? patch.childId : existing.child_id;
  const nextLogDate = patch.logDate !== undefined ? patch.logDate : (existing.log_date as string);
  const nextKind = getKind(nextSubtype);

  // Look up the existing mirror (may not exist if old kind=note).
  const { data: mirror } = await supabase
    .from("events")
    .select("id, event_time")
    .eq("school_log_id", logId)
    .maybeSingle();

  const calendarTitle = calendarTitleFor({ subtype: nextSubtype, title: nextTitle, subject: nextSubject });
  const calendarDesc = eventDescriptionFor({ description: nextDescription, subtype: nextSubtype, score: nextScore });

  if (nextKind === "event") {
    // For eventTime, use the patch if provided; otherwise keep what the
    // mirror had. New mirrors (note→event) start with no time = all_day.
    const nextEventTime: string | null =
      patch.eventTime !== undefined ? (patch.eventTime || null) : (mirror?.event_time ?? null);

    if (mirror) {
      const { error: mirrorErr } = await supabase
        .from("events")
        .update({
          title: calendarTitle,
          description: calendarDesc,
          event_date: nextLogDate,
          event_time: nextEventTime,
          all_day: !nextEventTime,
          child_id: nextChildId,
        })
        .eq("id", mirror.id);
      if (mirrorErr) return { success: false, error: `Falha ao atualizar evento no calendário: ${mirrorErr.message}` };
    } else {
      // note → event transition: insert new mirror row.
      if (!userId) {
        return { success: false, error: "Usuário não informado para criar evento no calendário." };
      }
      if (!nextChildId) {
        return { success: false, error: "Criança obrigatória para criar evento no calendário." };
      }
      const { error: mirrorErr } = await supabase.from("events").insert({
        group_id: existing.group_id,
        child_id: nextChildId,
        title: calendarTitle,
        description: calendarDesc,
        event_date: nextLogDate,
        event_time: nextEventTime,
        all_day: !nextEventTime,
        created_by: userId,
        school_log_id: logId,
      });
      if (mirrorErr) return { success: false, error: `Falha ao criar evento no calendário: ${mirrorErr.message}` };
    }
  } else {
    // event → note transition (or note→note): delete any mirror row.
    if (mirror) {
      const { error: delErr } = await supabase.from("events").delete().eq("id", mirror.id);
      if (delErr) return { success: false, error: `Falha ao remover evento do calendário: ${delErr.message}` };
    }
  }

  return { success: true, data: { id: logId } };
}

export async function toggleSchoolLogCompleted(
  supabase: SupabaseClient,
  logId: string,
): Promise<ServiceResult<{ id: string; completed: boolean }>> {
  const { data: log } = await supabase
    .from("school_logs").select("id, completed").eq("id", logId).maybeSingle();
  if (!log) return { success: false, error: "Registro não encontrado." };
  const next = !log.completed;
  const { error } = await supabase.from("school_logs").update({ completed: next }).eq("id", logId);
  if (error) return { success: false, error: error.message };
  return { success: true, data: { id: logId, completed: next } };
}
