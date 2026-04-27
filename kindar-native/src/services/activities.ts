/**
 * Activities Service — All writes use safeWrite for offline support.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */

import { supabase } from '../lib/supabase';
import { safeWrite } from './offline';

export interface Activity {
  id: string; name: string; category: string; child_id: string | null;
  recurrence_type: string; start_date: string; end_date: string | null;
  days_of_week: string | null; time_start: string | null; time_end: string | null;
  location: string | null; notes: string | null; is_active: boolean;
  teacher_name: string | null; class_name: string | null; responsible_id: string | null;
  childName?: string;
}

export async function fetchActivities(groupId: string): Promise<Activity[]> {
  const { data } = await supabase
    .from('child_activities')
    .select('id, name, category, child_id, recurrence_type, start_date, end_date, days_of_week, time_start, time_end, location, notes, is_active, teacher_name, class_name, responsible_id, children(full_name)')
    .eq('group_id', groupId).eq('is_active', true).order('name');
  return (data || []).map((a: any) => ({ ...a, childName: a.children?.full_name?.split(' ')[0] || 'Todos' }));
}

export async function updateActivity(activityId: string, updates: {
  name?: string; category?: string; location?: string | null; notes?: string | null;
  time_start?: string | null; time_end?: string | null; days_of_week?: string | null;
  recurrence_type?: string;
}) {
  return safeWrite({ table: 'child_activities', operation: 'update', payload: { id: activityId, ...updates } });
}

export async function deleteActivity(activityId: string) {
  // PWA soft-deletes via is_active=false to preserve history. Match that behavior.
  return safeWrite({ table: 'child_activities', operation: 'update', payload: { id: activityId, is_active: false } });
}

// ── Checklist ──────────────────────────────────────────────────────────────

export interface ChecklistItem { id: string; name: string; sort_order: number | null; }

export async function fetchChecklist(activityId: string): Promise<ChecklistItem[]> {
  const { data } = await supabase
    .from('activity_checklist_items')
    .select('id, name, sort_order')
    .eq('activity_id', activityId)
    .order('sort_order', { ascending: true });
  return (data || []) as ChecklistItem[];
}

export async function fetchChecklistCompletions(activityId: string, occurrenceDate: string): Promise<Set<string>> {
  const { data } = await supabase
    .from('checklist_completions')
    .select('item_id')
    .eq('activity_id', activityId)
    .eq('occurrence_date', occurrenceDate);
  return new Set((data || []).map((d: any) => d.item_id));
}

export async function toggleChecklistItem(params: {
  activityId: string;
  itemId: string;
  occurrenceDate: string;
  completed: boolean;
  completedBy: string;
}): Promise<{ success: true } | { success: false; error: string }> {
  if (params.completed) {
    const { error } = await supabase
      .from('checklist_completions')
      .upsert({
        activity_id: params.activityId,
        item_id: params.itemId,
        occurrence_date: params.occurrenceDate,
        completed_by: params.completedBy,
      }, { onConflict: 'item_id,occurrence_date' });
    if (error) return { success: false, error: error.message };
  } else {
    const { error } = await supabase
      .from('checklist_completions')
      .delete()
      .eq('item_id', params.itemId)
      .eq('occurrence_date', params.occurrenceDate);
    if (error) return { success: false, error: error.message };
  }
  return { success: true };
}

// ── Activity Report ────────────────────────────────────────────────────────

export type ActivityReportStatus = 'completed' | 'missed' | 'cancelled';
export type ActivityReportMood = 'happy' | 'neutral' | 'sad' | 'anxious' | 'tired';

export interface ActivityReport {
  id: string;
  activity_id: string;
  occurrence_date: string;
  status: ActivityReportStatus;
  notes: string | null;
  child_mood: ActivityReportMood | null;
  reported_by: string;
}

export async function fetchActivityReport(activityId: string, occurrenceDate: string): Promise<ActivityReport | null> {
  const { data } = await supabase
    .from('activity_reports')
    .select('id, activity_id, occurrence_date, status, notes, child_mood, reported_by')
    .eq('activity_id', activityId)
    .eq('occurrence_date', occurrenceDate)
    .maybeSingle();
  return (data as ActivityReport) || null;
}

export async function submitActivityReport(params: {
  groupId: string;
  activityId: string;
  childId: string | null;
  occurrenceDate: string;
  status: ActivityReportStatus;
  notes: string | null;
  childMood: ActivityReportMood | null;
  reportedBy: string;
}): Promise<{ success: true } | { success: false; error: string }> {
  const existing = await fetchActivityReport(params.activityId, params.occurrenceDate);
  if (existing) {
    const { error } = await supabase
      .from('activity_reports')
      .update({
        status: params.status,
        notes: params.notes,
        child_mood: params.childMood,
        reported_by: params.reportedBy,
      })
      .eq('id', existing.id);
    if (error) return { success: false, error: error.message };
  } else {
    const { error } = await supabase.from('activity_reports').insert({
      group_id: params.groupId,
      activity_id: params.activityId,
      child_id: params.childId,
      occurrence_date: params.occurrenceDate,
      status: params.status,
      notes: params.notes,
      child_mood: params.childMood,
      reported_by: params.reportedBy,
    });
    if (error) return { success: false, error: error.message };
  }
  return { success: true };
}

export async function createActivity(params: {
  groupId: string; name: string; category: string; childId?: string;
  recurrenceType?: string; startDate: string; timeStart?: string; timeEnd?: string;
  location?: string; notes?: string; daysOfWeek?: string; createdBy: string;
}) {
  return safeWrite({
    table: 'child_activities', operation: 'insert',
    payload: {
      group_id: params.groupId, child_id: params.childId || null,
      name: params.name.trim(), category: params.category || 'other',
      recurrence_type: params.recurrenceType || 'never', start_date: params.startDate,
      days_of_week: params.daysOfWeek || null, time_start: params.timeStart || null,
      time_end: params.timeEnd || null, location: params.location?.trim() || null,
      notes: params.notes?.trim() || null, is_active: true, created_by: params.createdBy,
    },
  });
}

// ── Single-occurrence overrides ─────────────────────────────────────────────
//
// Mirrors PWA `editActivityOccurrence` (src/actions/activities.ts:826-913).
// Schema: `activity_reports.overrides` JSONB (migration 00029) — when a
// row exists for (activity_id, occurrence_date), the calendar view applies
// override fields on top of the master child_activities row for that day.
//
// Supported override keys: name, time_start, time_end, location,
//   teacher_name, class_name, room, notes, responsible_id.
// Pass `null` (explicit) to clear an override; omit to leave unchanged.

export interface OccurrenceOverrides {
  name?: string | null;
  time_start?: string | null;
  time_end?: string | null;
  location?: string | null;
  teacher_name?: string | null;
  class_name?: string | null;
  room?: string | null;
  notes?: string | null;
  responsible_id?: string | null;
}

export async function editActivityOccurrence(params: {
  groupId: string;
  activityId: string;
  occurrenceDate: string;       // YYYY-MM-DD
  overrides: OccurrenceOverrides;
  reportedBy: string;
}): Promise<{ success: boolean; error?: string }> {
  // Sanity-check: only forward defined override fields. `null` is meaningful
  // (clears the override); `undefined` means "leave unchanged".
  const cleaned: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(params.overrides)) {
    if (v !== undefined) cleaned[k] = v === '' ? null : v;
  }
  if (Object.keys(cleaned).length === 0) {
    return { success: true }; // nothing to do
  }

  // Look up existing report row for this occurrence
  const { data: existing } = await supabase
    .from('activity_reports')
    .select('id, overrides')
    .eq('activity_id', params.activityId)
    .eq('occurrence_date', params.occurrenceDate)
    .maybeSingle();

  if (existing) {
    const merged = {
      ...((existing.overrides as Record<string, unknown>) ?? {}),
      ...cleaned,
    };
    const { error } = await supabase
      .from('activity_reports')
      .update({ overrides: merged })
      .eq('id', existing.id);
    if (error) return { success: false, error: error.message };
    return { success: true };
  }

  // No report yet: create one. PWA seeds with status='completed' as a
  // placeholder so the row passes its CHECK constraint; the actual report
  // can still be filled later via the report modal.
  const { error } = await supabase.from('activity_reports').insert({
    group_id: params.groupId,
    activity_id: params.activityId,
    occurrence_date: params.occurrenceDate,
    reported_by: params.reportedBy,
    status: 'completed',
    overrides: cleaned,
  });
  if (error) return { success: false, error: error.message };
  return { success: true };
}

/**
 * Clear (revert) all overrides for a specific occurrence. Returns the
 * occurrence to the master activity's defaults.
 */
export async function clearOccurrenceOverrides(params: {
  activityId: string;
  occurrenceDate: string;
}): Promise<{ success: boolean; error?: string }> {
  const { data: existing } = await supabase
    .from('activity_reports')
    .select('id')
    .eq('activity_id', params.activityId)
    .eq('occurrence_date', params.occurrenceDate)
    .maybeSingle();

  if (!existing) return { success: true };

  const { error } = await supabase
    .from('activity_reports')
    .update({ overrides: {} })
    .eq('id', existing.id);

  if (error) return { success: false, error: error.message };
  return { success: true };
}
