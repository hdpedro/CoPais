/**
 * Events Service — All writes use safeWrite.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */

import { supabase } from '../lib/supabase';
import { safeWrite, safeWriteMany } from './offline';
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

/**
 * Teto de dias pra evento "de vários dias" — cada dia vira UMA linha em
 * `events`. Espelha o cap do PWA (src/actions/events.ts). A tela
 * calendario/novo avisa quando o range escolhido passa disso, em vez de
 * truncar calado. Bug 2026-06-03 (grupo Android).
 */
export const MULTI_DAY_EVENT_CAP = 60;

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
  const maxDays = Math.min(dayCount, MULTI_DAY_EVENT_CAP);
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

  // Multi-day: build ALL rows and insert them in ONE batch (espelha a action
  // do PWA src/actions/events.ts:createEvent, que faz `insert(eventRows)`).
  // O código antigo fazia N `await safeWrite()` sequenciais — até 60
  // round-trips numa rede móvel ruim. Bastava UMA travar (fetch sem timeout)
  // pro save inteiro pendurar e o botão "Salvar evento" ficar preso (branco),
  // sem gravar nada. Bug 2026-06-03 (grupo Android). safeWriteMany faz 1
  // request + withTimeout. Ver services/offline.ts.
  const fmt = (d: Date) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };

  const endDateStr = fmt(endDate);
  const rows: Record<string, unknown>[] = [];
  for (let i = 0; i < maxDays; i++) {
    const d = new Date(startDate);
    d.setDate(d.getDate() + i);
    rows.push({
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
    });
  }

  const result = await safeWriteMany({ table: 'events', rows });
  if (result.success && !result.queued) {
    notifyAction('event_created', params.groupId, { title: cleanTitle });
  }
  return result;
}

export async function updateEvent(eventId: string, updates: {
  title?: string;
  description?: string | null;
  event_date?: string;
  end_date?: string | null;
  event_time?: string | null;
  location?: string | null;
  all_day?: boolean;
  assigned_to?: string | null;
  child_id?: string | null;
}) {
  return safeWrite({ table: 'events', operation: 'update', payload: { id: eventId, ...updates } });
}

export async function deleteEvent(eventId: string) {
  return safeWrite({ table: 'events', operation: 'delete', payload: { id: eventId } });
}

/** Detalhe completo de um evento — paridade com /eventos/[id]. */
export async function fetchEventDetail(eventId: string): Promise<(SocialEvent & {
  child_id: string | null;
  childName: string | null;
  description: string | null;
  end_date: string | null;
  created_by: string | null;
  createdByName: string | null;
}) | null> {
  const { data } = await supabase.from('events')
    .select('id, title, description, event_date, end_date, event_time, location, all_day, assigned_to, child_id, created_by, profiles!events_assigned_to_fkey(full_name), children(full_name), creator:profiles!events_created_by_fkey(full_name)')
    .eq('id', eventId)
    .maybeSingle();
  if (!data) return null;
  const ev = data as any;
  const child = Array.isArray(ev.children) ? ev.children[0] : ev.children;
  const creator = Array.isArray(ev.creator) ? ev.creator[0] : ev.creator;
  return {
    id: ev.id,
    title: ev.title,
    description: ev.description,
    event_date: ev.event_date,
    end_date: ev.end_date,
    event_time: ev.event_time,
    location: ev.location,
    all_day: ev.all_day,
    assigned_to: ev.assigned_to,
    assignedName: ev.profiles?.full_name?.split(' ')[0] || '',
    child_id: ev.child_id,
    childName: child?.full_name?.split(' ')[0] || null,
    created_by: ev.created_by,
    createdByName: creator?.full_name?.split(' ')[0] || null,
  };
}
