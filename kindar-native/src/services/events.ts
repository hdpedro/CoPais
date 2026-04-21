/**
 * Events Service — All writes use safeWrite.
 */

import { supabase } from '../lib/supabase';
import { safeWrite } from './offline';
import { notifyAction } from './notify';

export interface SocialEvent {
  id: string; title: string; description: string | null; event_date: string;
  end_date: string | null; location: string | null; all_day: boolean;
  assigned_to: string | null; assignedName?: string;
}

export async function fetchEvents(groupId: string): Promise<SocialEvent[]> {
  const { data } = await supabase.from('events')
    .select('id, title, description, event_date, end_date, location, all_day, assigned_to, profiles!events_assigned_to_fkey(full_name)')
    .eq('group_id', groupId).order('event_date', { ascending: false }).limit(100);
  return (data || []).map((e: any) => ({ ...e, assignedName: e.profiles?.full_name?.split(' ')[0] || '' }));
}

export async function createEvent(params: {
  groupId: string; title: string; description?: string; eventDate: string;
  location?: string; allDay?: boolean; createdBy: string;
}) {
  const result = await safeWrite({
    table: 'events', operation: 'insert',
    payload: {
      group_id: params.groupId, title: params.title.trim(),
      description: params.description?.trim() || null, event_date: params.eventDate,
      location: params.location?.trim() || null, all_day: params.allDay ?? true,
      created_by: params.createdBy,
    },
  });
  if (result.success && !result.queued) {
    notifyAction('event_created', params.groupId, { title: params.title });
  }
  return result;
}
