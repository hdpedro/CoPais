/**
 * Schedule service — gera custody_events a partir de um padrao quinzenal.
 *
 * Wave G: a geração roda no servidor via /api/calendar/generate-schedule
 * para preservar o histórico (delete só com `start_date >= today`) e fazer
 * rollback em caso de falha — antes o native deletava todo o range,
 * apagando histórico de custódia (P0 data-loss). A leitura do padrão
 * (`fetchSchedulePattern`) continua client-side via Supabase.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
import { supabase } from '../lib/supabase';
import { apiFetch } from '../lib/api-fetch';
import { notifyAction } from './notify';
import { markQuestStep } from './quest';

export async function generateSchedule(params: {
  groupId: string;
  childId: string;
  pattern: (string | null)[];
  startDate: string; // YYYY-MM-DD
  months: number;
  createdBy: string;
}): Promise<{ success: boolean; error?: string; inserted?: number }> {
  const r = await apiFetch<{ success: boolean; events: number }>(
    '/api/calendar/generate-schedule',
    {
      method: 'POST',
      body: {
        groupId: params.groupId,
        childId: params.childId,
        pattern: params.pattern,
        startDate: params.startDate,
        months: params.months,
      },
    },
  );

  if (!r.ok || !r.data) {
    return { success: false, error: r.error };
  }

  // Flip custody_enabled on the group (calendar features key off this flag).
  // RLS allows admins to flip group fields; leaving here keeps the call cheap.
  await supabase
    .from('coparenting_groups')
    .update({ custody_enabled: true })
    .eq('id', params.groupId);

  notifyAction('event_created', params.groupId, {
    title: `Escala quinzenal (${r.data.events} eventos)`,
  });
  markQuestStep('setup_calendar', { count: r.data.events });

  return { success: true, inserted: r.data.events };
}

/**
 * Fetch existing schedule pattern. Mirrors PWA page.tsx load logic:
 *   1. Primary: custody_schedules row for (group, child) — dedicated table
 *   2. If no child match, take ANY saved schedule for the group (PWA does
 *      this — its query is `.eq(group_id, …).limit(1).single()` with no
 *      child filter). Keeps parity when patterns were saved before a
 *      specific child was selected, or saved at group level.
 *   3. Fallback: reconstruct from existing regular custody_events by walking
 *      14 days from the earliest event.
 */
export async function fetchSchedulePattern(
  groupId: string,
  childId?: string
): Promise<{ pattern: (string | null)[] | null; startDate: string | null }> {
  // 1a. Try child-specific row first (prefers exact match)
  if (childId) {
    const { data: childRow } = await supabase
      .from('custody_schedules')
      .select('pattern, start_date')
      .eq('group_id', groupId)
      .eq('child_id', childId)
      .limit(1)
      .maybeSingle();
    if (childRow) {
      return {
        pattern: (childRow as any).pattern || null,
        startDate: (childRow as any).start_date || null,
      };
    }
  }

  // 1b. Fall back to ANY saved schedule for the group (mirrors PWA behavior
  //     which does `.eq(group_id).limit(1).single()` without child filter).
  const { data: anyRow } = await supabase
    .from('custody_schedules')
    .select('pattern, start_date')
    .eq('group_id', groupId)
    .limit(1)
    .maybeSingle();
  if (anyRow) {
    return {
      pattern: (anyRow as any).pattern || null,
      startDate: (anyRow as any).start_date || null,
    };
  }

  // 2. Fallback: walk existing regular custody events and reconstruct
  const { data: events } = await supabase
    .from('custody_events')
    .select('start_date, end_date, responsible_user_id, child_id')
    .eq('group_id', groupId)
    .eq('custody_type', 'regular')
    .order('start_date', { ascending: true })
    .limit(60);

  if (!events || events.length === 0) return { pattern: null, startDate: null };
  const firstStart = events[0].start_date as string;
  const origin = new Date(firstStart + 'T12:00:00');
  const fmt = (d: Date) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };
  const pattern: (string | null)[] = Array(14).fill(null);
  for (let i = 0; i < 14; i++) {
    const target = new Date(origin);
    target.setDate(target.getDate() + i);
    const targetStr = fmt(target);
    const hit = (events as any[]).find((e: any) => targetStr >= e.start_date && targetStr <= e.end_date);
    if (hit) pattern[i] = hit.responsible_user_id;
  }
  return { pattern, startDate: firstStart };
}
