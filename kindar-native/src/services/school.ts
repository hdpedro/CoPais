/**
 * School Service — paridade com PWA `src/actions/school.ts`.
 *
 * Tabela: `school_logs` (group_id NOT NULL, child_id, log_type, title,
 * description, log_date, completed, logged_by). RLS força membership do
 * grupo, então não duplicamos a checagem aqui — o filtro `.eq('group_id')`
 * + as policies já garantem isolamento.
 *
 * Tipos válidos (mantém em sync com `validLogTypes` em
 * `src/actions/school.ts:28`):
 *   grade | meeting | behavior | homework | event | absence |
 *   achievement | concern | other
 */

import { supabase } from '../lib/supabase';
import { safeWrite } from './offline';

export const SCHOOL_LOG_TYPES = [
  'grade',
  'meeting',
  'behavior',
  'homework',
  'event',
  'absence',
  'achievement',
  'concern',
  'other',
] as const;

export type SchoolLogType = (typeof SCHOOL_LOG_TYPES)[number];

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
  created_at?: string;
  child_full_name?: string | null;
  logged_by_name?: string | null;
}

export async function fetchSchoolLogs(groupId: string, limit = 30): Promise<SchoolLog[]> {
  const { data, error } = await supabase
    .from('school_logs')
    .select(
      'id, group_id, child_id, log_type, title, description, log_date, completed, logged_by, created_at, children(full_name), profiles!school_logs_logged_by_fkey(full_name)',
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
      created_at: row.created_at as string | undefined,
      child_full_name: child?.full_name ?? null,
      logged_by_name: profile?.full_name ?? null,
    };
  });
}

export async function createSchoolLog(params: {
  groupId: string;
  childId: string | null;
  loggedBy: string;
  logType: SchoolLogType | string;
  title: string;
  description?: string | null;
  logDate?: string | null;
}) {
  const title = params.title.trim();
  if (!title) return { success: false, error: 'Titulo obrigatorio.' };

  const validLogType: SchoolLogType = (SCHOOL_LOG_TYPES as readonly string[]).includes(
    params.logType,
  )
    ? (params.logType as SchoolLogType)
    : 'other';

  return safeWrite({
    table: 'school_logs',
    operation: 'insert',
    payload: {
      group_id: params.groupId,
      child_id: params.childId,
      log_type: validLogType,
      title,
      description: params.description?.trim() || null,
      log_date: params.logDate || new Date().toISOString().split('T')[0],
      logged_by: params.loggedBy,
    },
  });
}

export async function updateSchoolLog(
  logId: string,
  updates: { title?: string; description?: string | null },
) {
  const payload: Record<string, unknown> = { id: logId };
  if (updates.title !== undefined) {
    const t = updates.title.trim();
    if (!t) return { success: false, error: 'Titulo obrigatorio.' };
    payload.title = t;
  }
  if (updates.description !== undefined) {
    payload.description = updates.description?.trim() || null;
  }
  return safeWrite({ table: 'school_logs', operation: 'update', payload });
}

export async function deleteSchoolLog(logId: string) {
  return safeWrite({ table: 'school_logs', operation: 'delete', payload: { id: logId } });
}

export async function toggleSchoolLogCompleted(logId: string, currentCompleted: boolean) {
  return safeWrite({
    table: 'school_logs',
    operation: 'update',
    payload: { id: logId, completed: !currentCompleted },
  });
}
