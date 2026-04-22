/**
 * Health service — write ops for saude module.
 * Mirrors PWA src/actions/health.ts (subset).
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
import { supabase } from '../lib/supabase';
import { safeWrite } from './offline';
import { notifyAction } from './notify';

export interface SymptomEntry {
  id: string;
  child_id: string;
  recorded_at: string;
  symptom_type: string;
  temperature: number | null;
  intensity: string | null;
  notes: string | null;
  illness_episode_id: string | null;
  created_by: string;
  authorName?: string;
}

export interface IllnessEpisode {
  id: string;
  child_id: string;
  title: string;
  start_date: string;
  end_date: string | null;
  status: 'active' | 'resolved';
  symptoms: string | null;
  severity: 'mild' | 'moderate' | 'severe' | null;
  notes: string | null;
  hospital: string | null;
  childName?: string;
}

// ── Symptom diary ──────────────────────────────────────────────────────────
export async function fetchSymptoms(childId: string, daysBack = 14): Promise<SymptomEntry[]> {
  const since = new Date();
  since.setDate(since.getDate() - daysBack);

  const { data } = await supabase
    .from('symptom_entries')
    .select('id, child_id, recorded_at, symptom_type, temperature, intensity, notes, illness_episode_id, created_by, profiles(full_name)')
    .eq('child_id', childId)
    .gte('recorded_at', since.toISOString())
    .order('recorded_at', { ascending: false })
    .limit(100);

  return (data || []).map((s: any) => ({
    id: s.id,
    child_id: s.child_id,
    recorded_at: s.recorded_at,
    symptom_type: s.symptom_type,
    temperature: s.temperature,
    intensity: s.intensity,
    notes: s.notes,
    illness_episode_id: s.illness_episode_id,
    created_by: s.created_by,
    authorName: s.profiles?.full_name?.split(' ')[0] || '',
  }));
}

export async function createSymptomEntry(params: {
  groupId: string;
  childId: string;
  symptomType: string;
  intensity?: 'mild' | 'moderate' | 'severe';
  temperature?: number;
  notes?: string;
  illnessEpisodeId?: string;
  createdBy: string;
}) {
  const result = await safeWrite({
    table: 'symptom_entries',
    operation: 'insert',
    payload: {
      group_id: params.groupId,
      child_id: params.childId,
      symptom_type: params.symptomType,
      intensity: params.intensity || null,
      temperature: params.temperature ?? null,
      notes: params.notes?.trim() || null,
      illness_episode_id: params.illnessEpisodeId || null,
      created_by: params.createdBy,
      recorded_at: new Date().toISOString(),
    },
  });
  if (result.success && !result.queued) {
    notifyAction('health_event_created', params.groupId, {
      title: `Sintoma: ${params.symptomType}`,
      childName: '',
    });
  }
  return result;
}

// ── Illness episodes ───────────────────────────────────────────────────────
export async function fetchIllnesses(groupId: string, status?: 'active' | 'resolved'): Promise<IllnessEpisode[]> {
  let q = supabase
    .from('illness_episodes')
    .select('id, child_id, title, start_date, end_date, status, symptoms, severity, notes, hospital, children(full_name)')
    .eq('group_id', groupId)
    .order('start_date', { ascending: false })
    .limit(100);
  if (status) q = q.eq('status', status);
  const { data } = await q;

  return (data || []).map((i: any) => ({
    id: i.id,
    child_id: i.child_id,
    title: i.title,
    start_date: i.start_date,
    end_date: i.end_date,
    status: i.status,
    symptoms: i.symptoms,
    severity: i.severity,
    notes: i.notes,
    hospital: i.hospital,
    childName: i.children?.full_name?.split(' ')[0] || '',
  }));
}

export async function createIllness(params: {
  groupId: string;
  childId: string;
  title: string;
  startDate: string;
  symptoms?: string;
  severity?: 'mild' | 'moderate' | 'severe';
  notes?: string;
  hospital?: string;
}) {
  const result = await safeWrite({
    table: 'illness_episodes',
    operation: 'insert',
    payload: {
      group_id: params.groupId,
      child_id: params.childId,
      title: params.title.trim(),
      start_date: params.startDate,
      symptoms: params.symptoms?.trim() || null,
      severity: params.severity || null,
      notes: params.notes?.trim() || null,
      hospital: params.hospital?.trim() || null,
      status: 'active',
    },
  });
  if (result.success && !result.queued) {
    notifyAction('health_event_created', params.groupId, {
      title: `Doenca: ${params.title}`,
      childName: '',
    });
  }
  return result;
}

export async function resolveIllness(illnessId: string, endDate: string) {
  return safeWrite({
    table: 'illness_episodes',
    operation: 'update',
    payload: { id: illnessId, status: 'resolved', end_date: endDate },
  });
}

/**
 * Append an evolution entry ("melhorou" / "piorou" + optional note) to an
 * illness episode's notes column. Mirrors PWA addEvolutionQuick action.
 */
export async function addEvolutionQuick(params: {
  episodeId: string;
  type: 'improving' | 'worsening';
  note: string;
  authorFullName: string | null;
}): Promise<{ success: true } | { success: false; error: string }> {
  const { data: episode, error: fetchErr } = await supabase
    .from('illness_episodes')
    .select('notes')
    .eq('id', params.episodeId)
    .single();
  if (fetchErr || !episode) return { success: false, error: fetchErr?.message || 'Episodio nao encontrado' };

  const authorName = params.authorFullName?.split(' ')[0] || 'Responsavel';
  const now = new Date();
  const dateStr = now.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', timeZone: 'America/Sao_Paulo' });
  const timeStr = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });
  const typeLabel = params.type === 'improving' ? 'melhorou' : 'piorou';
  const cleanNote = params.note.trim().slice(0, 500);
  const evolutionText = cleanNote ? `${typeLabel}: ${cleanNote}` : typeLabel;
  const newEntry = `[${dateStr} ${timeStr} - ${authorName}] ${evolutionText}`;
  const updatedNotes = episode.notes ? `${newEntry}\n${episode.notes}` : newEntry;

  const result = await safeWrite({
    table: 'illness_episodes',
    operation: 'update',
    payload: { id: params.episodeId, notes: updatedNotes },
  });
  if (!result.success) return { success: false, error: result.error || 'Falha' };
  return { success: true };
}
