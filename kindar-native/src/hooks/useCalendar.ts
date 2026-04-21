/**
 * useCalendar — Fetches calendar data (custody events, activities, social events).
 */

import { useState, useCallback } from 'react';
import { useFocusEffect } from 'expo-router';
import { supabase } from '../lib/supabase';
import { useAuth } from '../store/auth';
import { PARENT_COLORS, getDisplayName } from '../lib/constants';

export interface CalendarEvent {
  id: string;
  date: string; // YYYY-MM-DD
  type: 'custody' | 'activity' | 'event';
  title: string;
  color: string;
  responsibleId?: string;
  time?: string;
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
      ] = await Promise.all([
        supabase.from('group_members')
          .select('user_id, profiles(full_name)')
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
        supabase.from('calendar_occurrences')
          .select('id, occurrence_date, child_activities(name, category, time_start)')
          .eq('group_id', groupId)
          .gte('occurrence_date', startKey)
          .lte('occurrence_date', endKey)
          .eq('status', 'active')
          .limit(500)
          .then(r => r, () => ({ data: [] as never[] })),
        supabase.from('events')
          .select('id, title, event_date, end_date')
          .eq('group_id', groupId)
          .gte('event_date', startKey)
          .lte('event_date', endKey)
          .limit(200)
          .then(r => r, () => ({ data: [] as never[] })),
      ]);

      // Members
      const memberList: MemberColor[] = (memberData || []).map((m: any, i: number) => ({
        userId: m.user_id,
        name: getDisplayName(m.profiles?.full_name),
        color: i === 0 ? PARENT_COLORS.primary : PARENT_COLORS.secondary,
      }));
      setMembers(memberList);

      const allEvents: CalendarEvent[] = [];

      // Custody events — expand date ranges into individual days
      (custodyData || []).forEach((ce: any) => {
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

      // Social events
      (socialEvents || []).forEach((e: any) => {
        allEvents.push({
          id: e.id,
          date: e.event_date,
          type: 'event',
          title: e.title,
          color: colors.secondary,
        });
      });

      setEvents(allEvents);
    } catch {
      // Silently fail
    } finally {
      setLoading(false);
    }
  }, [userId, activeGroup]);

  useFocusEffect(useCallback(() => { loadData(); }, [loadData]));

  return { events, members, loading, refresh: loadData };
}

// Re-export colors for use in the calendar
const colors = {
  accent: '#E8A228',
  secondary: '#D4735A',
};
