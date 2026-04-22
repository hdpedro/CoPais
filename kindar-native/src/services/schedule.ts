/**
 * Schedule service — gera custody_events a partir de um padrao quinzenal.
 * Mirrors PWA src/actions/calendar.ts generateSchedule.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
import { supabase } from '../lib/supabase';
import { notifyAction } from './notify';

function formatDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Generate custody events from a 14-day pattern.
 *
 * pattern[0-6]  = Week 1: Sunday → Saturday
 * pattern[7-13] = Week 2: Sunday → Saturday
 * Each cell contains a user_id (responsible) or null (unassigned).
 *
 * The cycle is anchored to the Monday of startDate's week so that
 * Sunday belongs to the same week as the following Monday.
 */
export async function generateSchedule(params: {
  groupId: string;
  childId: string;
  pattern: (string | null)[];
  startDate: string; // YYYY-MM-DD
  months: number;
  createdBy: string;
}): Promise<{ success: boolean; error?: string; inserted?: number }> {
  if (params.pattern.length !== 14) return { success: false, error: 'Padrao deve ter 14 dias' };
  if (params.pattern.every(p => p === null)) return { success: false, error: 'Nenhum dia atribuido' };

  const startDate = new Date(params.startDate + 'T12:00:00');
  const endDate = new Date(startDate);
  endDate.setMonth(endDate.getMonth() + params.months);

  const startDayOfWeek = startDate.getDay();
  const refMonday = new Date(startDate);
  const daysToMonday = startDayOfWeek === 0 ? -6 : -(startDayOfWeek - 1);
  refMonday.setDate(refMonday.getDate() + daysToMonday);

  const events: any[] = [];
  const current = new Date(startDate);
  let rangeStart: Date | null = null;
  let rangeUserId: string | null = null;

  function closeRange(endDay: Date) {
    if (rangeStart && rangeUserId) {
      events.push({
        group_id: params.groupId,
        child_id: params.childId,
        responsible_user_id: rangeUserId,
        start_date: formatDateKey(rangeStart),
        end_date: formatDateKey(endDay),
        custody_type: 'regular',
        notes: 'Gerado pela escala quinzenal',
        created_by: params.createdBy,
      });
    }
    rangeStart = null;
    rangeUserId = null;
  }

  while (current < endDate) {
    const dayOfWeek = current.getDay();
    const daysSinceRef = Math.round((current.getTime() - refMonday.getTime()) / 86400000);
    const weekInCycle = Math.floor(daysSinceRef / 7) % 2;
    const patternIdx = weekInCycle * 7 + dayOfWeek;
    const userId = params.pattern[patternIdx];

    if (userId !== null) {
      if (rangeUserId === userId) {
        // continue
      } else {
        if (rangeStart && rangeUserId) {
          const prevDay = new Date(current);
          prevDay.setDate(prevDay.getDate() - 1);
          closeRange(prevDay);
        }
        rangeStart = new Date(current);
        rangeUserId = userId;
      }
    } else {
      if (rangeStart && rangeUserId) {
        const prevDay = new Date(current);
        prevDay.setDate(prevDay.getDate() - 1);
        closeRange(prevDay);
      }
    }
    current.setDate(current.getDate() + 1);
  }
  if (rangeStart && rangeUserId) {
    const lastDay = new Date(endDate);
    lastDay.setDate(lastDay.getDate() - 1);
    closeRange(lastDay);
  }

  if (events.length === 0) return { success: false, error: 'Nenhum evento gerado' };

  // Delete existing custody events for this child in the range, then insert
  const { error: delError } = await supabase
    .from('custody_events')
    .delete()
    .eq('group_id', params.groupId)
    .eq('child_id', params.childId)
    .eq('custody_type', 'regular')
    .gte('start_date', formatDateKey(startDate))
    .lte('end_date', formatDateKey(endDate));

  if (delError) return { success: false, error: `Falha ao limpar eventos anteriores: ${delError.message}` };

  const { error: insertError } = await supabase.from('custody_events').insert(events);
  if (insertError) return { success: false, error: insertError.message };

  // Store the pattern on the group so it can be edited later
  await supabase
    .from('coparenting_groups')
    .update({
      custody_pattern: params.pattern,
      custody_pattern_start_date: params.startDate,
      custody_enabled: true,
    })
    .eq('id', params.groupId);

  notifyAction('event_created', params.groupId, { title: `Escala quinzenal (${events.length} eventos)` });

  return { success: true, inserted: events.length };
}

/** Fetch existing pattern stored on the group. */
export async function fetchSchedulePattern(groupId: string): Promise<{ pattern: (string | null)[] | null; startDate: string | null }> {
  const { data } = await supabase
    .from('coparenting_groups')
    .select('custody_pattern, custody_pattern_start_date')
    .eq('id', groupId)
    .maybeSingle();
  return {
    pattern: (data as any)?.custody_pattern || null,
    startDate: (data as any)?.custody_pattern_start_date || null,
  };
}
