/**
 * Events Service — All writes use safeWrite.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */

import { supabase } from '../lib/supabase';
import { safeWrite } from './offline';
import { notifyAction } from './notify';

export interface SocialEvent {
  id: string; title: string; description: string | null; event_date: string;
  end_date: string | null; event_time: string | null; location: string | null; all_day: boolean;
  assigned_to: string | null; assignedName?: string;
}

export async function fetchEvents(groupId: string): Promise<SocialEvent[]> {
  const { data } = await supabase.from('events')
    .select('id, title, description, event_date, end_date, event_time, location, all_day, assigned_to, profiles!events_assigned_to_fkey(full_name)')
    .eq('group_id', groupId).order('event_date', { ascending: false }).limit(100);
  return (data || []).map((e: any) => ({ ...e, assignedName: e.profiles?.full_name?.split(' ')[0] || '' }));
}

export async function createEvent(params: {
  groupId: string;
  title: string;
  description?: string;
  notes?: string;
  eventDate: string;
  endDate?: string;
  eventTime?: string;
  location?: string;
  allDay?: boolean;
  childId?: string;
  /** UUID of the group_member assigned to take/transport. Mirrors PWA `assigned_to`. */
  assignedTo?: string | null;
  createdBy: string;
}) {
  const allDay = params.allDay ?? !params.eventTime;
  const eventTime = params.eventTime ? (params.eventTime.length === 5 ? `${params.eventTime}:00` : params.eventTime) : null;

  // Multi-day expansion — mirrors PWA `createEvent` action exactly:
  // creates one event row per day with title suffixed " (i/N)".
  // Caps at 60 days for safety.
  const startDate = new Date(params.eventDate + 'T12:00:00');
  const hasEnd = params.endDate && params.endDate >= params.eventDate;
  const endDate = hasEnd ? new Date(params.endDate + 'T12:00:00') : startDate;
  const dayCount = Math.max(1, Math.round((endDate.getTime() - startDate.getTime()) / 86400000) + 1);
  const maxDays = Math.min(dayCount, 60);
  const cleanTitle = params.title.trim();
  const description = params.description?.trim() || params.notes?.trim() || null;
  const location = params.location?.trim() || null;
  const assignedTo = params.assignedTo && params.assignedTo !== 'other' ? params.assignedTo : null;

  // Single-day fast path — keep existing behaviour & queueing
  if (maxDays === 1) {
    const result = await safeWrite({
      table: 'events', operation: 'insert',
      payload: {
        group_id: params.groupId,
        title: cleanTitle,
        description,
        event_date: params.eventDate,
        end_date: hasEnd ? params.endDate : null,
        event_time: eventTime,
        location,
        all_day: allDay,
        child_id: params.childId || null,
        assigned_to: assignedTo,
        created_by: params.createdBy,
      },
    });
    if (result.success && !result.queued) {
      notifyAction('event_created', params.groupId, { title: cleanTitle });
    }
    return result;
  }

  // Multi-day: insert N rows, one per day. safeWrite operates on a single
  // payload so we loop and short-circuit on the first failure (mirrors PWA
  // behaviour, where a single insert error triggers a redirect).
  const fmt = (d: Date) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };

  const endDateStr = fmt(endDate);
  let lastResult: Awaited<ReturnType<typeof safeWrite>> | null = null;
  for (let i = 0; i < maxDays; i++) {
    const d = new Date(startDate);
    d.setDate(d.getDate() + i);
    lastResult = await safeWrite({
      table: 'events', operation: 'insert',
      payload: {
        group_id: params.groupId,
        title: `${cleanTitle} (${i + 1}/${maxDays})`,
        description,
        event_date: fmt(d),
        end_date: endDateStr,
        event_time: eventTime,
        location,
        all_day: allDay,
        child_id: params.childId || null,
        assigned_to: assignedTo,
        created_by: params.createdBy,
      },
    });
    if (!lastResult.success) return lastResult;
  }

  if (lastResult?.success && !lastResult.queued) {
    notifyAction('event_created', params.groupId, { title: cleanTitle });
  }
  return lastResult ?? { success: false, error: 'Falha ao criar evento' };
}

export async function updateEvent(eventId: string, updates: {
  title?: string;
  description?: string | null;
  event_date?: string;
  event_time?: string | null;
  location?: string | null;
  all_day?: boolean;
}) {
  return safeWrite({ table: 'events', operation: 'update', payload: { id: eventId, ...updates } });
}

export async function deleteEvent(eventId: string) {
  return safeWrite({ table: 'events', operation: 'delete', payload: { id: eventId } });
}
