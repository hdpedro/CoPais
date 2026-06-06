/**
 * Activities Service — All writes use safeWrite for offline support.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */

import { supabase } from '../lib/supabase';
import { apiFetch } from '../lib/api-fetch';
import { safeWrite } from './offline';
import { generateOccurrences } from '../lib/occurrence-generator';

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

export interface PendingActivityReport {
  activityId: string;
  activityName: string;
  childId: string | null;
  childName: string;
  occurrenceDate: string; // YYYY-MM-DD
  daysAgo: number;
}

/** Local YYYY-MM-DD. NUNCA toISOString() — à noite no Brasil (UTC-3) o UTC vira
 *  o dia seguinte e a janela de datas sai errada (mesma armadilha do
 *  formatDateKey/useDashboard). */
function localDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Lista TODOS os relatos de atividade pendentes — ocorrências dos últimos 7
 * dias (de ONTEM pra trás) que ainda não têm `activity_report`. É a versão
 * COMPLETA do que o dashboard mostra como "Status pendentes" (lá a RPC
 * `get_dashboard_payload.past_pending_reports` é limitada a 5 no client).
 *
 * Replica a regra server-side — anti-join occurrence × report por
 * (activity_id, occurrence_date), janela [hoje-7, ontem] — com 3 queries leves
 * + join no client. Sem RPC nova → entrega por OTA.
 *
 * Bug Henrique 2026-06-05: "ver tudo" em Status pendentes levava à lista de
 * atividades (definições), cujo "Relatar" reportava pra HOJE e nunca limpava o
 * pendente (que é de uma data passada). Aqui cada item relata pela
 * occurrence_date CERTA → some ao recarregar, igual ao dashboard.
 */
export async function fetchPendingReports(groupId: string): Promise<PendingActivityReport[]> {
  const now = new Date();
  const weekAgo = new Date(now); weekAgo.setDate(weekAgo.getDate() - 7);
  const yesterday = new Date(now); yesterday.setDate(yesterday.getDate() - 1);
  const weekAgoStr = localDateKey(weekAgo);
  const yesterdayStr = localDateKey(yesterday);

  const [occRes, repRes, actRes] = await Promise.all([
    supabase
      .from('calendar_occurrences')
      .select('activity_id, occurrence_date')
      .eq('group_id', groupId)
      .not('activity_id', 'is', null)
      .gte('occurrence_date', weekAgoStr)
      .lte('occurrence_date', yesterdayStr),
    supabase
      .from('activity_reports')
      .select('activity_id, occurrence_date')
      .eq('group_id', groupId)
      .gte('occurrence_date', weekAgoStr)
      .lte('occurrence_date', yesterdayStr),
    // SEM filtro is_active: a RPC do dashboard junta child_activities sem ele,
    // então uma atividade desativada com ocorrência passada ainda conta como
    // pendente. Manter paridade.
    supabase
      .from('child_activities')
      .select('id, name, child_id, children(full_name)')
      .eq('group_id', groupId),
  ]);

  if (occRes.error || !occRes.data) return [];

  const reported = new Set<string>(
    (repRes.data || []).map((r: any) => `${r.activity_id}|${r.occurrence_date}`),
  );
  const actMap = new Map<string, { name: string; childId: string | null; childName: string }>();
  for (const a of (actRes.data || []) as any[]) {
    actMap.set(a.id, {
      name: a.name,
      childId: a.child_id ?? null,
      childName: a.children?.full_name?.split(' ')[0] || 'Geral',
    });
  }

  const todayMs = now.getTime();
  const seen = new Set<string>();
  const out: PendingActivityReport[] = [];
  for (const occ of occRes.data as any[]) {
    const key = `${occ.activity_id}|${occ.occurrence_date}`;
    if (reported.has(key) || seen.has(key)) continue; // já relatado / dedupe
    const act = actMap.get(occ.activity_id);
    if (!act) continue; // atividade removida — não dá pra relatar
    seen.add(key);
    const occMs = new Date(`${occ.occurrence_date}T12:00:00`).getTime();
    out.push({
      activityId: occ.activity_id,
      activityName: act.name,
      childId: act.childId,
      childName: act.childName,
      occurrenceDate: occ.occurrence_date,
      daysAgo: Math.max(0, Math.floor((todayMs - occMs) / 86400000)),
    });
  }
  out.sort((a, b) => a.occurrenceDate.localeCompare(b.occurrenceDate)); // mais antigo primeiro
  return out;
}

export async function updateActivity(activityId: string, updates: {
  name?: string; category?: string; location?: string | null; notes?: string | null;
  time_start?: string | null; time_end?: string | null; days_of_week?: string | null;
  recurrence_type?: string;
  start_date?: string;
  end_date?: string | null;
  day_of_month?: number | null;
  custom_interval?: number;
  custom_unit?: string;
  responsible_id?: string | null;
  teacher_name?: string | null;
  class_name?: string | null;
  reminder_lead_minutes?: number | null;
}) {
  const r = await safeWrite({ table: 'child_activities', operation: 'update', payload: { id: activityId, ...updates } });
  if (!r.success) return r;

  // Se mudou algo que afeta as datas das ocorrencias, regenera. Senao
  // (so name/notes/time/location), as datas existentes continuam validas.
  const recurrenceFields = [
    'recurrence_type', 'start_date', 'end_date', 'days_of_week',
    'day_of_month', 'custom_interval', 'custom_unit',
  ] as const;
  const changedRecurrence = recurrenceFields.some(f => f in updates);
  if (!changedRecurrence) return r;

  // Busca a row atualizada pra alimentar o generator.
  const { data: act } = await supabase
    .from('child_activities')
    .select('id, group_id, child_id, recurrence_type, start_date, end_date, days_of_week, day_of_month, custom_interval, custom_unit')
    .eq('id', activityId)
    .single();
  if (!act) return r;

  const genResult = await generateOccurrences(act);
  if (genResult.error) {
    console.warn('[activities] regenerate occurrences failed:', genResult.error);
  }
  return r;
}

export type DeleteScope = 'occurrence' | 'future' | 'all';

/**
 * Excluir atividade — 3 modos (paridade Apple/Google Calendar):
 *   - 'occurrence': apaga so a ocorrencia daquele dia (calendar_occurrences)
 *   - 'future':     apaga ocorrencias >= occurrenceDate (calendar_occurrences)
 *   - 'all':        soft-delete da atividade (is_active=false) + apaga
 *                   TODAS as ocorrencias presentes/futuras
 *
 * Por que so deletamos `calendar_occurrences` no caso 'occurrence' e
 * 'future' (sem mexer em child_activities): o is_active=false e do
 * registro-pai. Se o user so quer pular UMA ocorrencia, manter a
 * activity ativa permite que ela continue aparecendo em outros dias.
 */
export async function deleteActivity(activityId: string, opts?: {
  scope?: DeleteScope;
  occurrenceDate?: string;
  groupId?: string;
}) {
  const scope: DeleteScope = opts?.scope ?? 'all';
  const today = new Date().toISOString().slice(0, 10);

  if (scope === 'occurrence') {
    if (!opts?.occurrenceDate) return { success: false, error: 'Data da ocorrencia obrigatoria' };
    const { error } = await supabase
      .from('calendar_occurrences')
      .delete()
      .eq('activity_id', activityId)
      .eq('occurrence_date', opts.occurrenceDate);
    return error ? { success: false, error: error.message } : { success: true };
  }

  if (scope === 'future') {
    const cutoff = opts?.occurrenceDate || today;
    const { error } = await supabase
      .from('calendar_occurrences')
      .delete()
      .eq('activity_id', activityId)
      .gte('occurrence_date', cutoff);
    return error ? { success: false, error: error.message } : { success: true };
  }

  // 'all' (default): soft-delete + apaga ocorrencias futuras pra sumirem
  // imediatamente do calendario sem esperar reidx. Historico (ocorrencias
  // passadas) preservado.
  const r = await safeWrite({
    table: 'child_activities',
    operation: 'update',
    payload: { id: activityId, is_active: false },
  });
  if (!r.success) return r;
  const { error: occErr } = await supabase
    .from('calendar_occurrences')
    .delete()
    .eq('activity_id', activityId)
    .gte('occurrence_date', today);
  if (occErr) return { success: false, error: occErr.message };
  return { success: true };
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
  /** Nao persistido em activity_reports (a tabela nao tem child_id —
   * crianca e derivada via activity_id -> child_activities.child_id).
   * Mantido na interface por compat com callers que ja sabem do childId. */
  childId?: string | null;
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
  recurrenceType?: string; startDate: string; endDate?: string | null;
  timeStart?: string; timeEnd?: string;
  location?: string; notes?: string; daysOfWeek?: string;
  dayOfMonth?: number | null; customInterval?: number; customUnit?: string;
  responsibleId?: string | null;
  reminderLeadMinutes?: number | null;
  createdBy: string;
}) {
  // 1. Insere a atividade master. NAO usamos safeWrite aqui porque
  //    precisamos do id retornado pra gerar occurrences imediatamente
  //    (offline queue nao retorna id sincrono).
  const recurrenceType = params.recurrenceType || 'never';
  const { data, error } = await supabase
    .from('child_activities')
    .insert({
      group_id: params.groupId,
      child_id: params.childId || null,
      name: params.name.trim(),
      category: params.category || 'other',
      recurrence_type: recurrenceType,
      start_date: params.startDate,
      end_date: params.endDate || null,
      days_of_week: params.daysOfWeek || null,
      day_of_month: params.dayOfMonth ?? null,
      custom_interval: params.customInterval ?? 1,
      custom_unit: params.customUnit || 'week',
      time_start: params.timeStart || null,
      time_end: params.timeEnd || null,
      location: params.location?.trim() || null,
      notes: params.notes?.trim() || null,
      responsible_id: params.responsibleId || null,
      reminder_lead_minutes: params.reminderLeadMinutes ?? null,
      is_active: true,
      created_by: params.createdBy,
    })
    .select('id')
    .single();

  if (error || !data) {
    return { success: false as const, error: error?.message || 'Erro ao criar atividade' };
  }

  // 2. Trigger no banco (migration 00074) ja gerou as calendar_occurrences
  //    automaticamente. Esta chamada JS e DEFESA EM PROFUNDIDADE: se o
  //    trigger nao existir (DB rollback, ambiente local sem migration),
  //    a UI ainda funciona. ON CONFLICT DO NOTHING no insert torna a
  //    operacao idempotente — duplicar nao gera linhas extras.
  const genResult = await generateOccurrences({
    id: data.id,
    group_id: params.groupId,
    child_id: params.childId || null,
    recurrence_type: recurrenceType,
    start_date: params.startDate,
    end_date: params.endDate || null,
    days_of_week: params.daysOfWeek || null,
    day_of_month: params.dayOfMonth ?? null,
    custom_interval: params.customInterval ?? 1,
    custom_unit: params.customUnit || 'week',
  });
  if (genResult.error) {
    console.warn('[activities] generateOccurrences (defense in depth) failed:', genResult.error);
  }

  return { success: true as const, id: data.id, occurrencesGenerated: genResult.count };
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
  // Wave I: server is the single source of truth — it validates allowed
  // keys, group membership, responsible_id membership, fires the
  // activity_cancelled push when applicable, and performs the jsonb merge.
  // Sanity-check: only forward defined override fields. `null` is meaningful
  // (clears a single override key); `undefined` means "leave unchanged".
  const cleaned: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(params.overrides)) {
    if (v !== undefined) cleaned[k] = v === '' ? null : v;
  }
  if (Object.keys(cleaned).length === 0) {
    return { success: true }; // nothing to do
  }

  const r = await apiFetch<{ success: boolean; overrides: Record<string, unknown> }>(
    '/api/activities/overrides',
    {
      method: 'POST',
      body: {
        activityId: params.activityId,
        occurrenceDate: params.occurrenceDate,
        overrides: cleaned,
        mode: 'merge',
      },
    },
  );
  if (!r.ok) return { success: false, error: r.error };
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
  const r = await apiFetch<{ success: boolean; overrides: Record<string, unknown> }>(
    '/api/activities/overrides',
    {
      method: 'POST',
      body: {
        activityId: params.activityId,
        occurrenceDate: params.occurrenceDate,
        overrides: {},
        mode: 'clear',
      },
    },
  );
  if (!r.ok) return { success: false, error: r.error };
  return { success: true };
}
