/**
 * useCalendar — Fetches calendar data (custody events, activities, social events).
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useCallback } from 'react';
import { useFocusEffect } from 'expo-router';
import { supabase } from '../lib/supabase';
import { useAuth } from '../store/auth';
import { PARENT_COLORS, getDisplayName } from '../lib/constants';
import { loadMyPendingSwaps, type SwapRequestDetail } from '../services/swaps';
import { listBalanceOperations, type BalanceOperation } from '../services/balance-operations';
import { fetchMyPendingEventRequests, type EventRequest } from '../services/event-requests';

export interface CalendarEvent {
  id: string;
  date: string; // YYYY-MM-DD
  type: 'custody' | 'activity' | 'event' | 'appointment';
  title: string;
  color: string;
  responsibleId?: string;
  time?: string;
  /** When set, this is a calendar mirror of a school_logs row; tap → /escola */
  schoolLogId?: string | null;
}

export interface MemberColor {
  userId: string;
  name: string;
  color: string;
}

function formatDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function useCalendar() {
  const { userId, activeGroup } = useAuth();
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [members, setMembers] = useState<MemberColor[]>([]);
  const [pendingSwaps, setPendingSwaps] = useState<SwapRequestDetail[]>([]);
  const [balanceOps, setBalanceOps] = useState<BalanceOperation[]>([]);
  const [pendingEventRequests, setPendingEventRequests] = useState<EventRequest[]>([]);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    if (!userId || !activeGroup) return;
    const groupId = activeGroup.groupId;

    // Range: 1 month back + 12 months ahead
    const now = new Date();
    const rangeStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const rangeEnd = new Date(now.getFullYear(), now.getMonth() + 13, 0);
    const startKey = formatDateKey(rangeStart);
    const endKey = formatDateKey(rangeEnd);

    try {
      const [
        { data: memberData },
        { data: custodyData },
        { data: occurrences },
        { data: socialEvents },
        { data: appointments },
      ] = await Promise.all([
        supabase.from('group_members')
          .select('user_id, profiles(full_name, display_name, email)')
          .eq('group_id', groupId)
          .then(r => r, () => ({ data: [] as never[] })),
        activeGroup.custodyEnabled
          ? supabase.from('custody_events')
              .select('id, start_date, end_date, responsible_user_id, custody_type, children(full_name)')
              .eq('group_id', groupId)
              .gte('end_date', startKey)
              .lte('start_date', endKey)
              .order('start_date')
              .limit(500)
              .then(r => r, () => ({ data: [] as never[] }))
          : Promise.resolve({ data: [] as never[] }),
        // calendar_occurrences has NO `status` column — that filter used to
        // make PostgREST silently 400 the whole query, so activities never
        // appeared on the native calendar. Mirrors PWA src/app/(app)/
        // calendario/page.tsx — `child_activities!inner` ensures we only
        // return rows where the parent activity still exists.
        supabase.from('calendar_occurrences')
          .select('id, occurrence_date, child_activities!inner(name, category, time_start)')
          .eq('group_id', groupId)
          .gte('occurrence_date', startKey)
          .lte('occurrence_date', endKey)
          .limit(500)
          .then(r => r, () => ({ data: [] as never[] })),
        supabase.from('events')
          .select('id, title, event_date, event_time, end_date, status, school_log_id')
          .eq('group_id', groupId)
          .neq('status', 'cancelled')
          .gte('event_date', startKey)
          .lte('event_date', endKey)
          .limit(200)
          .then(r => r, () => ({ data: [] as never[] })),
        // Mirrors PWA src/app/(app)/calendario/page.tsx — scheduled medical
        // appointments rendered as health pills on the calendar.
        supabase.from('medical_appointments')
          .select('id, title, appointment_date')
          .eq('group_id', groupId)
          .eq('status', 'scheduled')
          .gte('appointment_date', startKey + 'T00:00:00')
          .lte('appointment_date', endKey + 'T23:59:59')
          .limit(200)
          .then(r => r, () => ({ data: [] as never[] })),
      ]);

      // Members — display name cascade: display_name → full_name.first →
      // email prefix. Never surface raw email (fixes screenshot complaint).
      const memberList: MemberColor[] = (memberData || []).map((m: any, i: number) => {
        const p = m.profiles || {};
        const raw = p.display_name
          || getDisplayName(p.full_name)
          || (p.email ? p.email.split('@')[0].split('.')[0] : '')
          || 'Parceiro';
        const name = raw.charAt(0).toUpperCase() + raw.slice(1);
        return {
          userId: m.user_id,
          name,
          color: i === 0 ? PARENT_COLORS.primary : PARENT_COLORS.secondary,
        };
      });
      setMembers(memberList);

      const allEvents: CalendarEvent[] = [];

      // Custody events — expand date ranges into individual days.
      // Tie-break: when a multi-day `regular` range and a single-day `swap`
      // row cover the same date, the consumer (`dayEvents.find(e => e.type === 'custody')`)
      // returns first-match. To make the swap win — and keep parity with
      // PWA `buildCustodyMap` — push swap rows BEFORE regular rows. Without
      // this the calendar still renders the old responsible after the
      // co-parent accepts the swap (Angelino bug 2026-04-27).
      const stable = (custodyData || []) as any[];
      const orderedCustody = [
        ...stable.filter((ce) => ce.custody_type === 'swap'),
        ...stable.filter((ce) => ce.custody_type === 'exception'),
        ...stable.filter((ce) => ce.custody_type !== 'swap' && ce.custody_type !== 'exception'),
      ];
      orderedCustody.forEach((ce: any) => {
        const start = new Date(ce.start_date + 'T12:00:00');
        const end = new Date(ce.end_date + 'T12:00:00');
        const member = memberList.find(m => m.userId === ce.responsible_user_id);

        for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
          allEvents.push({
            id: ce.id,
            date: formatDateKey(d),
            type: 'custody',
            title: getDisplayName(ce.children?.full_name),
            color: member?.color || PARENT_COLORS.primary,
            responsibleId: ce.responsible_user_id,
          });
        }
      });

      // Activity occurrences
      (occurrences || []).forEach((o: any) => {
        const act = o.child_activities;
        allEvents.push({
          id: o.id,
          date: o.occurrence_date,
          type: 'activity',
          title: act?.name || '',
          color: colors.accent,
          time: act?.time_start?.slice(0, 5),
        });
      });

      // Social events (includes school events mirrored via events.school_log_id)
      (socialEvents || []).forEach((e: any) => {
        allEvents.push({
          id: e.id,
          date: e.event_date,
          type: 'event',
          title: e.title,
          color: colors.secondary,
          time: e.event_time?.slice(0, 5) || undefined,
          schoolLogId: e.school_log_id || null,
        });
      });

      // Medical appointments — health pill (mirrors PWA calendario/page.tsx).
      (appointments || []).forEach((apt: any) => {
        const dateKey = apt.appointment_date?.split('T')[0];
        if (!dateKey) return;
        const time = apt.appointment_date?.split('T')[1]?.slice(0, 5) || undefined;
        allEvents.push({
          id: apt.id,
          date: dateKey,
          type: 'appointment',
          title: apt.title || 'Consulta',
          color: colors.health,
          time,
        });
      });

      setEvents(allEvents);

      // Pending swap requests + event-action requests addressed to me
      if (activeGroup.custodyEnabled) {
        const [swaps, ops, eventReqs] = await Promise.all([
          loadMyPendingSwaps(groupId, userId),
          listBalanceOperations(groupId),
          fetchMyPendingEventRequests(groupId, userId),
        ]);
        setPendingSwaps(swaps);
        setBalanceOps(ops);
        setPendingEventRequests(eventReqs);
      } else {
        setPendingSwaps([]);
        setBalanceOps([]);
        setPendingEventRequests(await fetchMyPendingEventRequests(groupId, userId));
      }
    } catch {
      // Silently fail
    } finally {
      setLoading(false);
    }
  }, [userId, activeGroup]);

  useFocusEffect(useCallback(() => { loadData(); }, [loadData]));

  return { events, members, pendingSwaps, balanceOps, pendingEventRequests, loading, refresh: loadData };
}

// Re-export colors for use in the calendar
const colors = {
  accent: '#E8A228',
  secondary: '#D4735A',
  health: '#E53935',
};
