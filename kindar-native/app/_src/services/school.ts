/**
 * School Service — paridade com PWA `src/actions/school.ts` e
 * `src/lib/services/school.ts`. Refator 2026-05-05:
 *
 *   - Subtypes agrupados em "event" / "note" (usado pelo 2-step picker).
 *   - Eventos (exam/meeting/event/homework/absence) viram via API route
 *     `/api/school` que delega ao service, criando linha em `events` pra
 *     o calendário aparecer com a mesma origem.
 *   - Notes seguem direto via safeWrite — não precisam de calendário,
 *     suportam offline igual antes.
 *   - Adicionados campos `subject` e `score` (Prova: matéria + nota).
 */

import { supabase } from '../lib/supabase';
import { safeWrite } from './offline';
import { apiFetch } from '../lib/api-fetch';

export const EVENT_SUBTYPES = ['exam', 'meeting', 'event', 'homework', 'absence'] as const;
export const NOTE_SUBTYPES = ['grade', 'behavior', 'achievement', 'concern', 'other'] as const;
export const SCHOOL_LOG_TYPES = [...EVENT_SUBTYPES, ...NOTE_SUBTYPES] as const;

export type SchoolEventSubtype = (typeof EVENT_SUBTYPES)[number];
export type SchoolNoteSubtype = (typeof NOTE_SUBTYPES)[number];
export type SchoolLogType = (typeof SCHOOL_LOG_TYPES)[number];
export type SchoolKind = 'event' | 'note';

export function getKind(subtype: SchoolLogType): SchoolKind {
  return (EVENT_SUBTYPES as readonly string[]).includes(subtype) ? 'event' : 'note';
}

export const SUBTYPE_LABEL: Record<SchoolLogType, string> = {
  exam: 'Prova',
  meeting: 'Reunião',
  event: 'Evento escolar',
  homework: 'Tarefa',
  absence: 'Falta',
  grade: 'Nota / boletim',
  behavior: 'Comportamento',
  achievement: 'Conquista',
  concern: 'Atenção',
  other: 'Outro',
};

export const SUBTYPE_ICON: Record<SchoolLogType, string> = {
  exam: '📚',
  meeting: '👥',
  event: '🎉',
  homework: '📝',
  absence: '🚫',
  grade: '📊',
  behavior: '📋',
  achievement: '🏆',
  concern: '⚠️',
  other: '📌',
};

export const SUBTYPE_HINT: Partial<Record<SchoolLogType, string>> = {
  exam: 'Matéria, data, nota (opcional)',
  meeting: 'Reunião de pais, conselho',
  event: 'Festa, formatura, gincana',
  homework: 'Lição com prazo',
  absence: 'Ausência registrada',
};

export interface SchoolLog {
  id: string;
  group_id: string;
  child_id: string | null;
  log_type: SchoolLogType;
  title: string;
  description: string | null;
  log_date: string;
  completed: boolean;
  logged_by: string;
  subject: string | null;
  score: string | null;
  created_at?: string;
  child_full_name?: string | null;
  logged_by_name?: string | null;
}

export async function fetchSchoolLogs(groupId: string, limit = 50): Promise<SchoolLog[]> {
  const { data, error } = await supabase
    .from('school_logs')
    .select(
      'id, group_id, child_id, log_type, title, description, log_date, completed, logged_by, subject, score, created_at, children(full_name), profiles!school_logs_logged_by_fkey(full_name)',
    )
    .eq('group_id', groupId)
    .order('log_date', { ascending: false })
    .limit(limit);

  if (error || !data) return [];

  return data.map((row: Record<string, unknown>) => {
    const childRow = row.children as { full_name?: string } | { full_name?: string }[] | null;
    const child = Array.isArray(childRow) ? childRow[0] : childRow;
    const profileRow = row.profiles as { full_name?: string } | { full_name?: string }[] | null;
    const profile = Array.isArray(profileRow) ? profileRow[0] : profileRow;
    return {
      id: row.id as string,
      group_id: row.group_id as string,
      child_id: (row.child_id as string | null) ?? null,
      log_type: (row.log_type as SchoolLogType) ?? 'other',
      title: row.title as string,
      description: (row.description as string | null) ?? null,
      log_date: row.log_date as string,
      completed: Boolean(row.completed),
      logged_by: row.logged_by as string,
      subject: (row.subject as string | null) ?? null,
      score: (row.score as string | null) ?? null,
      created_at: row.created_at as string | undefined,
      child_full_name: child?.full_name ?? null,
      logged_by_name: profile?.full_name ?? null,
    };
  });
}

export async function fetchSchoolLogById(logId: string): Promise<SchoolLog | null> {
  const { data, error } = await supabase
    .from('school_logs')
    .select(
      'id, group_id, child_id, log_type, title, description, log_date, completed, logged_by, subject, score, created_at, children(full_name), profiles!school_logs_logged_by_fkey(full_name)',
    )
    .eq('id', logId)
    .maybeSingle();
  if (error || !data) return null;
  const row = data as Record<string, unknown>;
  const child = row.children as { full_name?: string } | null;
  const profile = row.profiles as { full_name?: string } | null;
  return {
    id: row.id as string,
    group_id: row.group_id as string,
    child_id: (row.child_id as string | null) ?? null,
    log_type: (row.log_type as SchoolLogType) ?? 'other',
    title: row.title as string,
    description: (row.description as string | null) ?? null,
    log_date: row.log_date as string,
    completed: Boolean(row.completed),
    logged_by: row.logged_by as string,
    subject: (row.subject as string | null) ?? null,
    score: (row.score as string | null) ?? null,
    created_at: row.created_at as string | undefined,
    child_full_name: child?.full_name ?? null,
    logged_by_name: profile?.full_name ?? null,
  };
}

/**
 * Create a school log. Routes through `/api/school` so the server-side
 * service handles calendar mirroring atomically (events row + FK +
 * rollback on failure). Native does NOT use safeWrite for this flow
 * because the calendar mirror requires server logic; offline creation
 * of an event-kind log would leave the calendar out of sync.
 */
export async function createSchoolLog(params: {
  groupId: string;
  childId: string;
  subtype: SchoolLogType;
  title: string;
  description?: string | null;
  logDate?: string | null;
  eventTime?: string | null;
  subject?: string | null;
  score?: string | null;
}): Promise<{ success: true; schoolLogId: string; eventId: string | null } | { success: false; error: string }> {
  const r = await apiFetch<{ success: true; schoolLogId: string; eventId: string | null }>('/api/school', {
    method: 'POST',
    body: {
      groupId: params.groupId,
      childId: params.childId,
      subtype: params.subtype,
      title: params.title,
      description: params.description ?? null,
      logDate: params.logDate || new Date().toISOString().split('T')[0],
      eventTime: params.eventTime ?? null,
      subject: params.subject ?? null,
      score: params.score ?? null,
    },
  });
  if (!r.ok || !r.data) return { success: false, error: r.error || 'Falha ao salvar' };
  return { success: true, schoolLogId: r.data.schoolLogId, eventId: r.data.eventId };
}

export async function updateSchoolLog(
  logId: string,
  updates: {
    title?: string;
    description?: string | null;
    subject?: string | null;
    score?: string | null;
    subtype?: SchoolLogType;
    childId?: string;
    logDate?: string;
    eventTime?: string | null;
  },
) {
  // Route through API so the calendar mirror stays in sync with all edits
  // (title/description/date/time/subtype/child) — service handles both
  // writes and the kind transition lifecycle (note↔event).
  const r = await apiFetch<{ success: true }>('/api/school', {
    method: 'PATCH',
    body: { logId, ...updates },
  });
  if (!r.ok) return { success: false as const, error: r.error || 'Falha ao atualizar' };
  return { success: true as const };
}

export async function deleteSchoolLog(logId: string) {
  // Route through API so the FK cascade is exercised on the server side
  // (calendar mirror disappears together).
  const r = await apiFetch<{ success: true }>(`/api/school?id=${encodeURIComponent(logId)}`, {
    method: 'DELETE',
  });
  if (!r.ok) return { success: false as const, error: r.error || 'Falha ao excluir' };
  return { success: true as const };
}

/**
 * Fetch the calendar mirror's `event_time` for a given log. Used when opening
 * the edit modal so the time picker can prefill (school_logs itself doesn't
 * store the time — it lives only on the events row).
 */
export async function fetchSchoolLogEventTime(logId: string): Promise<string | null> {
  const { data } = await supabase
    .from('events')
    .select('event_time')
    .eq('school_log_id', logId)
    .maybeSingle();
  return (data?.event_time as string | null) ?? null;
}

/**
 * Toggle the homework "completed" checkbox. This has no calendar effect,
 * so we keep using safeWrite — works offline.
 */
export async function toggleSchoolLogCompleted(logId: string, currentCompleted: boolean) {
  return safeWrite({
    table: 'school_logs',
    operation: 'update',
    payload: { id: logId, completed: !currentCompleted },
  });
}
