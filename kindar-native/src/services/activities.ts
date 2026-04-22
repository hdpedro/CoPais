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
