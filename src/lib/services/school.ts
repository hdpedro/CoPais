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

// ── Types ────────────────────────────────────────────────────────────────

export type SchoolSubtype =
  | "exam" | "meeting" | "event" | "homework" | "absence"      // events
  | "grade" | "behavior" | "achievement" | "concern" | "other"; // notes

export type SchoolKind = "event" | "note";

export const EVENT_SUBTYPES: SchoolSubtype[] = ["exam", "meeting", "event", "homework", "absence"];
export const NOTE_SUBTYPES: SchoolSubtype[] = ["grade", "behavior", "achievement", "concern", "other"];

export function getKind(subtype: SchoolSubtype): SchoolKind {
  return EVENT_SUBTYPES.includes(subtype) ? "event" : "note";
}

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
}

export interface CreateSchoolLogResult {
  schoolLogId: string;
  /** Set when subtype is an event (also created an `events` row). */
  eventId: string | null;
  kind: SchoolKind;
}

export type ServiceResult<T> = { success: true; data: T } | { success: false; error: string };

// ── Validation ───────────────────────────────────────────────────────────

const VALID_SUBTYPES: SchoolSubtype[] = [...EVENT_SUBTYPES, ...NOTE_SUBTYPES];

export function isValidSubtype(s: unknown): s is SchoolSubtype {
  return typeof s === "string" && (VALID_SUBTYPES as string[]).includes(s);
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const HHMM = /^\d{2}:\d{2}$/;

/**
 * Build the calendar title for a school event. Examples:
 *   exam    + "Trigonometria"     → "📚 Prova · Matemática"  (when subject)
 *   meeting + "Reunião de pais"   → "👥 Reunião escolar"
 *   event   + "Festa junina"      → "🎉 Festa junina"
 */
function calendarTitleFor(input: CreateSchoolLogInput): string {
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
  const prefix = labelByType[input.subtype];
  if (input.subtype === "exam" && input.subject) {
    return `${prefix} · ${input.subject}`;
  }
  // For non-exam events, use the user title verbatim (it carries the meaning).
  return `${prefix}: ${input.title}`;
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
    })
    .select("id")
    .single();
  if (schoolErr || !schoolLog) {
    return { success: false, error: schoolErr?.message || "Falha ao salvar registro escolar." };
  }

  // ── 2. Mirror to events when kind=event ─────────────────────────────
  let eventId: string | null = null;
  if (kind === "event") {
    const calendarTitle = calendarTitleFor(input);
    const eventDescParts = [input.description?.trim()].filter(Boolean) as string[];
    if (input.subtype === "exam" && input.score) eventDescParts.push(`Nota: ${input.score}`);
    const { data: ev, error: evErr } = await supabase
      .from("events")
      .insert({
        group_id: input.groupId,
        child_id: input.childId,
        title: calendarTitle,
        description: eventDescParts.join("\n") || null,
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
 * Update the user-editable fields. Title and description only — subtype
 * and date intentionally not editable (delete + re-create instead, which
 * keeps the calendar mirror coherent).
 */
export async function updateSchoolLog(
  supabase: SupabaseClient,
  logId: string,
  patch: { title?: string; description?: string | null; subject?: string | null; score?: string | null },
): Promise<ServiceResult<{ id: string }>> {
  const update: Record<string, string | null> = {};
  if (patch.title !== undefined) {
    const t = patch.title.trim();
    if (!t) return { success: false, error: "Título obrigatório." };
    update.title = t;
  }
  if (patch.description !== undefined) update.description = patch.description?.trim() || null;
  if (patch.subject !== undefined) update.subject = patch.subject?.trim() || null;
  if (patch.score !== undefined) update.score = patch.score?.trim() || null;

  if (Object.keys(update).length === 0) {
    return { success: true, data: { id: logId } };
  }

  const { error } = await supabase.from("school_logs").update(update).eq("id", logId);
  if (error) return { success: false, error: error.message };

  // Keep calendar mirror title roughly in sync — best-effort, ignore
  // errors so a missing FK row doesn't fail the user-facing edit.
  if (patch.title !== undefined) {
    await supabase
      .from("events")
      .update({ title: update.title })
      .eq("school_log_id", logId);
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
