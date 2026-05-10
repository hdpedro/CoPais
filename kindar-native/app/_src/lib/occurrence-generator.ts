/**
 * Occurrence generator — porta direta de src/lib/occurrence-generator.ts (PWA).
 *
 * Pre-computa as datas de cada ocorrencia da atividade e insere em
 * calendar_occurrences. Sem isso, o calendario nao tem como saber em que
 * datas a atividade acontece.
 *
 * Chamado em:
 * - createActivity (services/activities.ts) — toda criacao
 * - updateActivity quando muda recorrencia/start_date/end_date/days_of_week
 *
 * Horizonte: 365 dias a partir de hoje (ou da start_date se for futura).
 *
 * IMPORTANTE: native usa o supabase client autenticado (RLS aplica). PWA
 * pode usar service role em backfill. Aqui so chamamos via user session,
 * entao RLS exige que o user seja membro do group.
 */

import { supabase } from './supabase';
import { getOccurrences, parseDaysOfWeek, type ActivityRecurrence } from './recurrence-utils';

const GENERATION_HORIZON_DAYS = 365;
const BATCH_SIZE = 500;

interface ActivityRow {
  id: string;
  group_id: string;
  child_id: string | null;
  recurrence_type: string;
  start_date: string;
  end_date: string | null;
  days_of_week: string | number[] | null;
  day_of_month: number | null;
  custom_interval: number | null;
  custom_unit: string | null;
}

function formatDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Gera e insere occurrences pra UMA atividade. Idempotente: deleta todas as
 * existing antes de gerar novamente. Retorna a contagem inserida.
 */
export async function generateOccurrences(
  activity: ActivityRow,
): Promise<{ count: number; error?: string }> {
  // Apaga existing pra atividade
  const { error: delErr } = await supabase
    .from('calendar_occurrences')
    .delete()
    .eq('activity_id', activity.id);
  if (delErr) {
    return { count: 0, error: `delete failed: ${delErr.message}` };
  }

  // Range: do start_date ate hoje+365 (ou end_date se antes)
  const today = new Date();
  const rangeStart = activity.start_date;
  const horizon = new Date(today);
  horizon.setDate(horizon.getDate() + GENERATION_HORIZON_DAYS);
  const rangeEnd = activity.end_date && new Date(activity.end_date + 'T00:00:00') < horizon
    ? activity.end_date
    : formatDateKey(horizon);

  const recurrence: ActivityRecurrence = {
    recurrence_type: activity.recurrence_type as ActivityRecurrence['recurrence_type'],
    start_date: activity.start_date,
    end_date: activity.end_date,
    days_of_week: parseDaysOfWeek(activity.days_of_week),
    day_of_month: activity.day_of_month,
    custom_interval: activity.custom_interval || 1,
    custom_unit: (activity.custom_unit as ActivityRecurrence['custom_unit']) || 'week',
  };

  const dates = getOccurrences(recurrence, rangeStart, rangeEnd);

  if (dates.length === 0) return { count: 0 };

  const rows = dates.map((date) => ({
    activity_id: activity.id,
    occurrence_date: date,
    group_id: activity.group_id,
    child_id: activity.child_id,
  }));

  // Batch insert pra evitar payload muito grande
  let inserted = 0;
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const { error } = await supabase
      .from('calendar_occurrences')
      .insert(batch);
    if (error) {
      return { count: inserted, error: error.message };
    }
    inserted += batch.length;
  }

  return { count: inserted };
}
