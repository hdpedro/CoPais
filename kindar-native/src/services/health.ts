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
  /**
   * Schema: `illness_episodes.symptoms TEXT[]` (migration 00005). Earlier
   * versions of this interface declared it as `string | null`, which
   * caused inserts to fail at the DB level and rendered the array as
   * comma-joined text on read.
   */
  symptoms: string[] | null;
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
  /**
   * Accepts either a comma-separated string (legacy callers) or a string[]
   * (preferred). The DB column is `TEXT[]` (migration 00005) — string
   * inputs are split on commas/semicolons here so existing callers keep
   * working without code churn.
   */
  symptoms?: string | string[];
  severity?: 'mild' | 'moderate' | 'severe';
  notes?: string;
  hospital?: string;
}) {
  const symptomsArray = Array.isArray(params.symptoms)
    ? params.symptoms
        .map(s => s.trim())
        .filter(Boolean)
    : params.symptoms
      ? params.symptoms
          .split(/[,;]+/)
          .map(s => s.trim())
          .filter(Boolean)
      : null;

  const result = await safeWrite({
    table: 'illness_episodes',
    operation: 'insert',
    payload: {
      group_id: params.groupId,
      child_id: params.childId,
      title: params.title.trim(),
      start_date: params.startDate,
      symptoms: symptomsArray && symptomsArray.length > 0 ? symptomsArray : null,
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

// ── Medical appointments ───────────────────────────────────────────────────
export interface AppointmentInput {
  groupId: string;
  childId: string;
  title: string;
  appointmentDate: string;   // YYYY-MM-DD
  appointmentTime: string;   // HH:MM (Brazil time)
  professionalId?: string | null;
  location?: string;
  notes?: string;
  appointmentType?: 'first' | 'return' | 'routine' | 'urgent';
  returnDate?: string;
  returnNotes?: string;
}

export async function createAppointment(params: AppointmentInput) {
  // Combine date + time into TIMESTAMPTZ value (Brazil timezone -03:00) —
  // matches PWA src/actions/health.ts createAppointment exactly.
  const datetime = `${params.appointmentDate}T${params.appointmentTime}:00-03:00`;

  const payload: Record<string, unknown> = {
    group_id: params.groupId,
    child_id: params.childId,
    professional_id: params.professionalId ?? null,
    title: params.title.trim().slice(0, 200),
    appointment_date: datetime,
    location: params.location?.trim().slice(0, 200) || null,
    notes: params.notes?.trim().slice(0, 2000) || null,
  };
  if (params.appointmentType) payload.appointment_type = params.appointmentType;
  if (params.returnDate) payload.return_date = params.returnDate;
  if (params.returnNotes) payload.return_notes = params.returnNotes.trim().slice(0, 2000);

  const result = await safeWrite({ table: 'medical_appointments', operation: 'insert', payload });
  if (result.success && !result.queued) {
    notifyAction('health_event_created', params.groupId, {
      title: `Consulta: ${params.title}`, childName: '',
    });
  }
  return result;
}

export async function completeAppointment(params: {
  appointmentId: string;
  groupId: string;
  outcomeNotes?: string;
}) {
  const result = await safeWrite({
    table: 'medical_appointments',
    operation: 'update',
    payload: {
      id: params.appointmentId,
      status: 'completed',
      outcome_notes: params.outcomeNotes?.trim().slice(0, 2000) || null,
      completed_at: new Date().toISOString(),
    },
  });
  if (result.success && !result.queued) {
    notifyAction('health_event_created', params.groupId, {
      title: 'Consulta finalizada', childName: '',
    });
  }
  return result;
}

// ── Medications ────────────────────────────────────────────────────────────
export interface MedicationInput {
  groupId: string;
  childId: string;
  name: string;
  dosage: string;
  frequency: string;
  frequencyHours?: number | null;
  reason?: string;
  prescribedBy?: string;
  startDate: string;
  endDate?: string;
  notes?: string;
}

export async function createMedication(params: MedicationInput) {
  if (!params.name.trim()) return { success: false, error: 'Nome do medicamento é obrigatório' };
  if (!params.dosage.trim()) return { success: false, error: 'Dosagem é obrigatória' };
  if (!params.frequency.trim()) return { success: false, error: 'Frequência é obrigatória' };
  if (!params.startDate) return { success: false, error: 'Data de início é obrigatória' };

  const result = await safeWrite({
    table: 'active_medications',
    operation: 'insert',
    payload: {
      group_id: params.groupId,
      child_id: params.childId,
      name: params.name.trim().slice(0, 200),
      dosage: params.dosage.trim().slice(0, 200),
      frequency: params.frequency.trim().slice(0, 200),
      frequency_hours: params.frequencyHours ?? null,
      reason: params.reason?.trim().slice(0, 200) || null,
      prescribed_by: params.prescribedBy?.trim().slice(0, 200) || null,
      start_date: params.startDate,
      end_date: params.endDate || null,
      notes: params.notes?.trim().slice(0, 2000) || null,
      status: 'active',
    },
  });
  if (result.success && !result.queued) {
    notifyAction('health_event_created', params.groupId, {
      title: `Medicamento: ${params.name}`, childName: '',
    });
  }
  return result;
}

/**
 * Confirm a medication dose. Mirrors PWA logMedicationDose with the
 * same hard 30-min block + half-interval warning. The "warning" path
 * still inserts but the caller can show the user a softer message.
 */
export async function logMedicationDose(params: {
  medicationId: string;
  administeredBy: string;
}): Promise<{ success: true; warning?: string } | { success: false; error: string }> {
  const { data: medication } = await supabase
    .from('active_medications')
    .select('frequency_hours')
    .eq('id', params.medicationId)
    .single();

  const { data: lastDose } = await supabase
    .from('medication_doses')
    .select('administered_at')
    .eq('medication_id', params.medicationId)
    .order('administered_at', { ascending: false })
    .limit(1);

  let warning: string | undefined;
  if (lastDose && lastDose.length > 0) {
    const lastTime = new Date(lastDose[0].administered_at).getTime();
    const minutesSince = (Date.now() - lastTime) / (1000 * 60);
    if (minutesSince < 30) {
      return { success: false, error: 'Dose recusada: ultima dose foi ha menos de 30 minutos.' };
    }
    const freqHours = medication?.frequency_hours;
    const halfMin = freqHours ? (freqHours * 60) / 2 : 0;
    if (freqHours && halfMin > 0 && minutesSince < halfMin) {
      warning = 'Dose confirmada (intervalo menor que o recomendado)';
    }
  }

  const { error } = await supabase.from('medication_doses').insert({
    medication_id: params.medicationId,
    administered_at: new Date().toISOString(),
    administered_by: params.administeredBy,
  });
  if (error) return { success: false, error: error.message };

  return warning ? { success: true, warning } : { success: true };
}

// ── Vaccinations ───────────────────────────────────────────────────────────
export interface VaccinationInput {
  groupId: string;
  childId: string;
  vaccineName: string;
  doseLabel?: string;
  administeredDate?: string;
  batchNumber?: string;
  location?: string;
  notes?: string;
}

export async function createVaccinationRecord(params: VaccinationInput) {
  if (!params.vaccineName.trim()) return { success: false, error: 'Nome da vacina é obrigatório' };

  const result = await safeWrite({
    table: 'vaccination_records',
    operation: 'insert',
    payload: {
      group_id: params.groupId,
      child_id: params.childId,
      vaccine_name: params.vaccineName.trim().slice(0, 200),
      dose_label: params.doseLabel?.trim().slice(0, 100) || null,
      administered_date: params.administeredDate || null,
      batch_number: params.batchNumber?.trim().slice(0, 100) || null,
      location: params.location?.trim().slice(0, 200) || null,
      notes: params.notes?.trim().slice(0, 2000) || null,
    },
  });
  if (result.success && !result.queued) {
    notifyAction('health_event_created', params.groupId, {
      title: `Vacina: ${params.vaccineName}${params.doseLabel ? ` (${params.doseLabel})` : ''}`,
      childName: '',
    });
  }
  return result;
}

// ── Growth records ─────────────────────────────────────────────────────────
export interface GrowthInput {
  groupId: string;
  childId: string;
  measuredDate: string;
  weightKg?: number | null;
  heightCm?: number | null;
  headCm?: number | null;
  notes?: string;
}

export async function createGrowthRecord(params: GrowthInput) {
  const result = await safeWrite({
    table: 'growth_records',
    operation: 'insert',
    payload: {
      group_id: params.groupId,
      child_id: params.childId,
      measured_date: params.measuredDate,
      weight_kg: params.weightKg ?? null,
      height_cm: params.heightCm ?? null,
      head_cm: params.headCm ?? null,
      notes: params.notes?.trim().slice(0, 2000) || null,
    },
  });
  if (result.success && !result.queued) {
    const parts: string[] = [];
    if (params.weightKg) parts.push(`${params.weightKg}kg`);
    if (params.heightCm) parts.push(`${params.heightCm}cm`);
    notifyAction('health_event_created', params.groupId, {
      title: `Medida: ${parts.join(', ') || 'nova medida'}`, childName: '',
    });
  }
  return result;
}

// ── Allergies ──────────────────────────────────────────────────────────────
export interface AllergyInput {
  groupId: string;
  childId: string;
  name: string;
  allergyType?: 'food' | 'medication' | 'environmental' | 'other';
  severity?: 'mild' | 'moderate' | 'severe';
  reaction?: string;
}

export async function createAllergy(params: AllergyInput) {
  if (!params.name.trim()) return { success: false, error: 'Nome da alergia é obrigatório' };

  const result = await safeWrite({
    table: 'child_allergies',
    operation: 'insert',
    payload: {
      group_id: params.groupId,
      child_id: params.childId,
      name: params.name.trim().slice(0, 200),
      allergy_type: params.allergyType || null,
      severity: params.severity || null,
      reaction: params.reaction?.trim().slice(0, 500) || null,
    },
  });
  if (result.success && !result.queued) {
    notifyAction('health_event_created', params.groupId, {
      title: `Alergia: ${params.name} (${params.severity || 'leve'})`,
      childName: '',
    });
  }
  return result;
}

export async function deleteAllergy(allergyId: string) {
  const { error } = await supabase.from('child_allergies').delete().eq('id', allergyId);
  return error ? { success: false, error: error.message } : { success: true };
}
