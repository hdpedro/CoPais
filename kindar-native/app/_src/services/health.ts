/**
 * Health service — write ops for saude module.
 * Mirrors PWA src/actions/health.ts (subset).
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
import { supabase } from '../lib/supabase';
import { apiFetch } from '../lib/api-fetch';
import { safeWrite } from './offline';
import { notifyAction } from './notify';
import { notifySaudeCreateNative } from './saude-collab';

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
  /**
   * Schema (migration 00013): `CHECK (severity IN ('leve','moderado','grave'))`.
   * Tipo antigo declarava 'mild'/'moderate'/'severe' (ingles) — quebrava
   * INSERT silenciosamente em `app/saude/doencas/nova.tsx`.
   */
  severity: 'leve' | 'moderado' | 'grave' | null;
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
  /**
   * Schema (migration 00037): `symptom_type IN ('febre','vomito','diarreia',
   * 'tosse','dor','mancha','falta_apetite','outro')`. Mantido como `string`
   * livre aqui pra evitar duplicar o enum, mas a UI em `app/saude/sintomas.tsx`
   * SO permite os valores aceitos.
   */
  symptomType: string;
  /**
   * Schema (migration 00037): `intensity IN ('leve','moderado','forte')`.
   * Atencao: e DIFERENTE de `illness_episodes.severity` que usa 'grave'.
   * Tipo antigo era 'mild'/'moderate'/'severe' — quebrava INSERT (bug
   * Diogo 2026-05-13).
   */
  intensity?: 'leve' | 'moderado' | 'forte';
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
    // Bug Aline 2026-05-16 iOS: o native estava selecionando + inserindo a
    // coluna `hospital` (singular) que não existe no schema — Supabase
    // retornava PGRST204 ("Could not find the 'hospital' column of
    // 'illness_episodes' in the schema cache") e o INSERT falhava.
    // Schema real (migration original + 00040) tem `hospital_name` (text),
    // `hospital_visit` (bool) e `hospital_date` (date). O PWA já usa
    // `hospital_name` em src/actions/health.ts. Aqui mantemos o nome
    // externo do campo (IllnessEpisode.hospital) pra preservar o contrato
    // pros callers atuais (detalhe.tsx, registrar.tsx, doencas.tsx,
    // useHealth.ts) e só ajustamos o nome real da coluna na query +
    // mapper + INSERT.
    .select('id, child_id, title, start_date, end_date, status, symptoms, severity, notes, hospital_name, children(full_name)')
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
    // Mantém o nome externo `hospital` pro contrato existente — o
    // mapeamento server-side é `hospital_name` (schema), client-side é
    // `hospital` (interface IllnessEpisode + UI form).
    hospital: i.hospital_name,
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
  /**
   * Schema (migration 00013): `CHECK (severity IN ('leve','moderado','grave'))`.
   * Atencao: e DIFERENTE de `symptom_entries.intensity` ('leve','moderado','forte').
   * O tipo antigo era 'mild'/'moderate'/'severe' — quebrava INSERT silenciosamente.
   */
  severity?: 'leve' | 'moderado' | 'grave';
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
    returnInsertedId: true,  // capturado pra notifySaudeCreateNative
    payload: {
      group_id: params.groupId,
      child_id: params.childId,
      title: params.title.trim(),
      start_date: params.startDate,
      symptoms: symptomsArray && symptomsArray.length > 0 ? symptomsArray : null,
      severity: params.severity || null,
      notes: params.notes?.trim() || null,
      // Schema (migration original + 00040): coluna se chama `hospital_name`
      // (não `hospital`). Vide comentário em fetchIllnesses acima.
      hospital_name: params.hospital?.trim() || null,
      status: 'active',
    },
  });
  if (result.success && !result.queued) {
    notifyAction('health_event_created', params.groupId, {
      title: `Doenca: ${params.title}`,
      childName: '',
    });
    // Saúde Foundation: dispara push pra coparentes com coalescing 60s.
    // Trigger SQL ja promoveu priority pra 'urgent' se severity='grave'.
    // Body em PT-BR mapeado do enum.
    if (result.id) {
      const sevLabel = params.severity === 'grave'
        ? 'Grave'
        : params.severity === 'moderado'
          ? 'Moderado'
          : 'Leve';
      notifySaudeCreateNative({
        recordType: 'illness_episode',
        recordId: result.id,
        description: `${params.title.trim()} · ${sevLabel}`,
      });
    }
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

  const result = await safeWrite({
    table: 'medical_appointments',
    operation: 'insert',
    returnInsertedId: true,
    payload,
  });
  if (result.success && !result.queued) {
    notifyAction('health_event_created', params.groupId, {
      title: `Consulta: ${params.title}`, childName: '',
    });
    // Saúde Foundation: push com coalescing 60s. Body em formato DD/MM HH:MM
    // pra evitar timezone shift do new Date() em DATE column.
    if (result.id) {
      const dateBR = params.appointmentDate.split('-').reverse().join('/');
      notifySaudeCreateNative({
        recordType: 'medical_appointment',
        recordId: result.id,
        description: `${params.title.trim()} · ${dateBR} ${params.appointmentTime}`,
      });
    }
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
    returnInsertedId: true,
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
    // Saúde Foundation: push com coalescing 60s.
    if (result.id) {
      const desc = `${params.name.trim()} · ${params.dosage.trim()} · ${params.frequency.trim()}`;
      notifySaudeCreateNative({
        recordType: 'active_medication',
        recordId: result.id,
        description: desc,
      });
    }
  }
  return result;
}

/**
 * Confirm a medication dose. Mirrors PWA logMedicationDose with the
 * same hard 30-min block + half-interval warning. The "warning" path
 * still inserts but the caller can show the user a softer message.
 *
 * Wave I (SoT): writes go through `/api/health/medication-doses` so the
 * group-membership + child-belongs-to-group gates and the dose-interval
 * validation live in one place. Native previously inserted directly on
 * `medication_doses`, relying on RLS only.
 *
 * The `administeredBy` parameter is kept in the signature for callers
 * but the server uses the authenticated user — passing a different uid
 * has no effect.
 */
export async function logMedicationDose(params: {
  medicationId: string;
  administeredBy: string;
}): Promise<{ success: true; warning?: string } | { success: false; error: string }> {
  void params.administeredBy;
  const r = await apiFetch<{ success: boolean; warning?: string }>(
    '/api/health/medication-doses',
    { method: 'POST', body: { medicationId: params.medicationId } },
  );
  if (!r.ok) return { success: false, error: r.error || 'Falha ao registrar dose' };
  return r.data?.warning ? { success: true, warning: r.data.warning } : { success: true };
}

/** Undo a previously logged dose. Native counterpart for `DELETE /api/health/medication-doses`. */
export async function deleteMedicationDose(doseId: string) {
  const r = await apiFetch<{ success: boolean }>('/api/health/medication-doses', {
    method: 'DELETE',
    query: { id: doseId },
  });
  return r.ok ? { success: true } : { success: false, error: r.error || 'Falha ao desfazer' };
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
    returnInsertedId: true,
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
    // Saúde Foundation: priority='info' default pra vacinas.
    if (result.id) {
      const desc = `${params.vaccineName.trim()}${params.doseLabel ? ` · ${params.doseLabel.trim()}` : ''}`;
      notifySaudeCreateNative({
        recordType: 'vaccination_record',
        recordId: result.id,
        description: desc,
      });
    }
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

/**
 * Wave I (SoT): allergies now go through `/api/health/allergies` so the
 * group-membership + child-belongs-to-group gates run server-side. Native
 * previously inserted/deleted directly on `child_allergies`, relying on
 * RLS only — letting a member touch records pointing to a child outside
 * their own group when policies were permissive.
 */
export async function createAllergy(params: AllergyInput) {
  if (!params.name.trim()) return { success: false, error: 'Nome da alergia é obrigatório' };

  const r = await apiFetch<{ success: boolean; id: string }>('/api/health/allergies', {
    method: 'POST',
    body: {
      groupId: params.groupId,
      childId: params.childId,
      name: params.name.trim(),
      allergyType: params.allergyType,
      severity: params.severity,
      reaction: params.reaction,
    },
  });
  if (!r.ok) return { success: false, error: r.error || 'Falha ao registrar alergia' };

  notifyAction('health_event_created', params.groupId, {
    title: `Alergia: ${params.name} (${params.severity || 'leve'})`,
    childName: '',
  });
  return { success: true };
}

export async function updateAllergy(params: {
  allergyId: string;
  name?: string;
  allergyType?: 'food' | 'medication' | 'environmental' | 'other';
  severity?: 'mild' | 'moderate' | 'severe';
  reaction?: string;
}) {
  const r = await apiFetch<{ success: boolean }>('/api/health/allergies', {
    method: 'PATCH',
    body: {
      allergyId: params.allergyId,
      name: params.name,
      allergyType: params.allergyType,
      severity: params.severity,
      reaction: params.reaction,
    },
  });
  return r.ok ? { success: true } : { success: false, error: r.error || 'Falha ao atualizar' };
}

export async function deleteAllergy(allergyId: string) {
  const r = await apiFetch<{ success: boolean }>('/api/health/allergies', {
    method: 'DELETE',
    query: { id: allergyId },
  });
  return r.ok ? { success: true } : { success: false, error: r.error || 'Falha ao remover' };
}

/**
 * Mirror of PWA `upsertMedicalInfo` (src/actions/health.ts:853).
 * RLS on `child_medical_info` blocks non-creator updates, so we go
 * through the Bearer-auth API which uses the service-role admin client
 * after enforcing membership + child-in-group.
 */
export async function upsertMedicalInfo(params: {
  groupId: string;
  childId: string;
  bloodType?: string | null;
  insuranceName?: string | null;
  insuranceNumber?: string | null;
  susNumber?: string | null;
  primaryPediatricianId?: string | null;
}) {
  const r = await apiFetch<{ success: boolean }>('/api/health/medical-info', {
    method: 'PUT',
    body: {
      groupId: params.groupId,
      childId: params.childId,
      blood_type: params.bloodType ?? null,
      insurance_name: params.insuranceName ?? null,
      insurance_number: params.insuranceNumber ?? null,
      sus_number: params.susNumber ?? null,
      primary_pediatrician_id: params.primaryPediatricianId ?? null,
    },
  });
  return r.ok ? { success: true } : { success: false, error: r.error || 'Falha ao salvar' };
}

/**
 * Mirror of PWA `regenerateEmergencyToken` (src/actions/health.ts:1160).
 * Rotates `children.emergency_token` so a new QR code is required to access
 * the public emergency page. Used when sharing the QR more broadly than
 * intended and we need to revoke it.
 */
export async function regenerateEmergencyToken(params: {
  groupId: string;
  childId: string;
}) {
  const r = await apiFetch<{ success: boolean; emergency_token: string }>(
    `/api/health/emergency/${params.childId}/regenerate`,
    {
      method: 'POST',
      body: { groupId: params.groupId },
    },
  );
  return r.ok && r.data
    ? { success: true as const, emergency_token: r.data.emergency_token }
    : { success: false as const, error: r.error || 'Falha ao regenerar' };
}

// ── Motor de Saúde Preventiva (Vacinas) ────────────────────────────────────
// Reflete `src/lib/services/vaccines.ts` no PWA. Fonte de verdade = banco
// (triggers regeneram `vaccine_recommended_doses`). Native chama a API REST
// pra obter o status agregado e disparar ações com inferência server-side.

export type VaccineStatus =
  | 'taken'
  | 'overdue'
  | 'due_soon'
  | 'upcoming'
  | 'future'
  | 'historical_gap'
  | 'out_of_window';

export type CalendarPreference = 'public' | 'private' | 'both';

export interface VaccineDoseStatus {
  id: string;
  vaccineId: string;
  vaccineCode: string;
  vaccineName: string;
  doseNumber: number;
  doseLabel: string;
  status: VaccineStatus;
  dueDate: string;
  validUntilDate: string | null;
  overdueDays: number | null;
  takenRecordId: string | null;
  takenDate: string | null;
  ruleNetwork: string;
  isBooster: boolean;
}

export interface TimelineGroup {
  ageBucket: string;
  doses: VaccineDoseStatus[];
}

export interface VaccineStatusResult {
  childId: string;
  coveragePct: number;
  statusLabel: string;
  totals: {
    recommended: number;
    taken: number;
    overdue: number;
    dueSoon: number;
    upcoming: number;
    historicalGap: number;
    outOfWindow: number;
  };
  nextDue: { doseId: string; vaccineName: string; dueDate: string } | null;
  overdue: VaccineDoseStatus[];
  dueSoon: VaccineDoseStatus[];
  upcoming: VaccineDoseStatus[];
  taken: VaccineDoseStatus[];
  historicalGaps: VaccineDoseStatus[];
  timelineByAge: TimelineGroup[];
}

export async function getVaccineStatus(childId: string): Promise<VaccineStatusResult | null> {
  // Resiliência: tenta primeiro consulta direta via supabase client.
  // - PWA usa o mesmo padrão server-side (services/vaccines.ts).
  // - Evita 401 silencioso quando cookie de cross-domain falha no Native.
  // - Fallback pro apiFetch se a consulta direta der erro (offline cache, etc).
  try {
    const direct = await fetchVaccineStatusDirect(childId);
    if (direct) return direct;
  } catch (e) {
    console.warn('[vaccines] direct fetch failed, falling back to apiFetch:', e);
  }
  const r = await apiFetch<VaccineStatusResult>(`/api/health/vaccines`, {
    method: 'GET',
    query: { childId },
  });
  return r.ok && r.data ? r.data : null;
}

/**
 * Consulta direta no banco — espelha `src/lib/services/vaccines.ts:getVaccineStatus`
 * sem passar pela layer REST. RLS continua aplicada (user logado via supabase.auth).
 */
async function fetchVaccineStatusDirect(childId: string): Promise<VaccineStatusResult | null> {
  const [coverageRes, dosesRes] = await Promise.all([
    supabase
      .from('child_vaccine_coverage')
      .select(
        'total_recommended, total_taken, overdue_count, due_soon_count, upcoming_count, historical_gap_count, out_of_window_count, coverage_pct, next_due_date, next_due_vaccine_name, next_due_dose_id',
      )
      .eq('child_id', childId)
      .maybeSingle(),
    supabase
      .from('vaccine_recommended_doses')
      .select(
        // eslint-disable-next-line @typescript-eslint/quotes
        `id, vaccine_id, dose_number, due_date, valid_until_date, status, taken_record_id, overdue_days,
         vaccine_catalog!inner(code, name, is_annual),
         vaccine_schedule_rules!inner(dose_label, network, is_booster, recommended_age_months)`,
      )
      .eq('child_id', childId)
      .order('due_date', { ascending: true }),
  ]);
  if (coverageRes.error && coverageRes.error.code !== 'PGRST116') {
    throw coverageRes.error;
  }
  if (dosesRes.error) throw dosesRes.error;
  // Se a view não retornou (criança sem birth_date ou sem permissão), bail.
  if (!coverageRes.data || !dosesRes.data || dosesRes.data.length === 0) return null;

  /* eslint-disable @typescript-eslint/no-explicit-any */
  function unwrap<T>(v: any): T | null {
    if (Array.isArray(v)) return v[0] ?? null;
    return v ?? null;
  }
  const rawDoses = (dosesRes.data as any[]).map((r) => ({
    id: r.id,
    vaccine_id: r.vaccine_id,
    dose_number: r.dose_number,
    due_date: r.due_date,
    valid_until_date: r.valid_until_date,
    status: r.status as VaccineStatus,
    taken_record_id: r.taken_record_id,
    overdue_days: r.overdue_days,
    catalog: unwrap<{ code: string; name: string; is_annual: boolean }>(r.vaccine_catalog) || { code: '', name: '', is_annual: false },
    rule: unwrap<{ dose_label: string; network: string; is_booster: boolean; recommended_age_months: number | null }>(r.vaccine_schedule_rules) || { dose_label: '', network: 'both', is_booster: false, recommended_age_months: null },
  }));

  // Resolve takenDate em batch
  const takenIds = rawDoses.map((d) => d.taken_record_id).filter((v): v is string => !!v);
  let takenDateById: Record<string, string> = {};
  if (takenIds.length > 0) {
    const { data: takenRecs } = await supabase
      .from('vaccination_records')
      .select('id, administered_date')
      .in('id', takenIds);
    if (takenRecs) {
      takenDateById = Object.fromEntries(takenRecs.map((r: any) => [r.id, r.administered_date]));
    }
  }

  const doses: VaccineDoseStatus[] = rawDoses.map((d) => ({
    id: d.id,
    vaccineId: d.vaccine_id,
    vaccineCode: d.catalog.code,
    vaccineName: d.catalog.name,
    doseNumber: d.dose_number,
    doseLabel: d.rule.dose_label,
    status: d.status,
    dueDate: d.due_date,
    validUntilDate: d.valid_until_date,
    overdueDays: d.overdue_days,
    takenRecordId: d.taken_record_id,
    takenDate: d.taken_record_id ? takenDateById[d.taken_record_id] ?? null : null,
    ruleNetwork: d.rule.network,
    isBooster: d.rule.is_booster,
  }));

  // Buckets idade
  const BUCKET_ORDER = ['0-2m', '2-4m', '4-6m', '6-12m', '1-2a', '2-4a', '4-6a', '6-9a', '9-14a', 'anual'];
  function bucketForAge(ageMonths: number | null, isAnnual: boolean): string {
    if (isAnnual) return 'anual';
    if (ageMonths === null) return 'anual';
    if (ageMonths < 2) return '0-2m';
    if (ageMonths < 4) return '2-4m';
    if (ageMonths < 6) return '4-6m';
    if (ageMonths < 12) return '6-12m';
    if (ageMonths < 24) return '1-2a';
    if (ageMonths < 48) return '2-4a';
    if (ageMonths < 72) return '4-6a';
    if (ageMonths < 108) return '6-9a';
    return '9-14a';
  }
  const buckets: Record<string, VaccineDoseStatus[]> = {};
  doses.forEach((d, i) => {
    const key = bucketForAge(rawDoses[i].rule.recommended_age_months, rawDoses[i].catalog.is_annual);
    if (!buckets[key]) buckets[key] = [];
    buckets[key].push(d);
  });
  const timelineByAge: TimelineGroup[] = BUCKET_ORDER.filter((b) => buckets[b]?.length).map((b) => ({
    ageBucket: b,
    doses: buckets[b],
  }));

  const cov: any = coverageRes.data;
  const rawTaken = cov?.total_taken || 0;
  const rawOverdue = cov?.overdue_count || 0;
  const rawDueSoon = cov?.due_soon_count || 0;
  const rawHistoricalGap = cov?.historical_gap_count || 0;
  // F#42 (E2E PRD 2026-05-25) — paridade PWA. Quando criança sem
  // nenhum vaccination_record (taken=0), reclassifica overdue/due_soon
  // como historicalGap pra evitar UI contraditória ("X está bem!" +
  // "1 reforço pendente" lado-a-lado). Vide src/lib/services/vaccines.ts.
  const isEmptyHistory = rawTaken === 0;
  const totals = {
    recommended: cov?.total_recommended || 0,
    taken: rawTaken,
    overdue: isEmptyHistory ? 0 : rawOverdue,
    dueSoon: isEmptyHistory ? 0 : rawDueSoon,
    upcoming: cov?.upcoming_count || 0,
    historicalGap: isEmptyHistory ? rawHistoricalGap + rawOverdue + rawDueSoon : rawHistoricalGap,
    outOfWindow: cov?.out_of_window_count || 0,
  };
  // statusLabel mesma lógica do PWA. (i18n keys aplicados pelo render)
  const actionable = totals.overdue + totals.dueSoon;
  let statusLabel: string;
  if (actionable === 0 && totals.recommended === 0) statusLabel = 'Complete a carteirinha';
  else if (actionable === 0 && totals.historicalGap > 0 && totals.taken === 0) statusLabel = 'Complete o histórico';
  else if (actionable === 0) statusLabel = 'Em dia';
  else if (actionable === 1) statusLabel = '1 reforço pendente';
  else statusLabel = `${actionable} reforços pendentes`;

  const nextDue = cov?.next_due_dose_id
    ? {
        doseId: cov.next_due_dose_id,
        vaccineName: cov.next_due_vaccine_name || '',
        dueDate: cov.next_due_date || '',
      }
    : null;

  return {
    childId,
    coveragePct: cov?.coverage_pct || 0,
    statusLabel,
    totals,
    nextDue,
    overdue: doses.filter((d) => d.status === 'overdue'),
    dueSoon: doses.filter((d) => d.status === 'due_soon'),
    upcoming: doses.filter((d) => d.status === 'upcoming'),
    taken: doses.filter((d) => d.status === 'taken'),
    historicalGaps: doses.filter((d) => d.status === 'historical_gap'),
    timelineByAge,
  };
  /* eslint-enable @typescript-eslint/no-explicit-any */
}

export async function recordVaccinationViaEngine(input: {
  groupId: string;
  childId: string;
  vaccineName: string;
  catalogId?: string | null;
  doseLabel?: string | null;
  doseNumber?: number | null;
  administeredDate: string;
  batchNumber?: string | null;
  location?: string | null;
  notes?: string | null;
  source?: 'manual' | 'ocr' | 'imported';
  confidenceScore?: number | null;
  forceDuplicate?: boolean;
}) {
  const r = await apiFetch<{
    success: boolean;
    id?: string;
    catalogId?: string | null;
    doseNumber?: number | null;
    warning?: 'duplicate_dose';
    inferredDose?: boolean;
    equivalenceMatch?: boolean;
  }>(`/api/health/vaccines`, {
    method: 'POST',
    body: { action: 'record', ...input },
  });
  if (!r.ok || !r.data) {
    return { success: false as const, error: r.error || 'Falha ao registrar vacina' };
  }
  // Server returns `success` field which conflicts with our wrapper — drop it.
  const { success: _ignored, ...rest } = r.data;
  return { success: true as const, ...rest };
}

export async function markRecommendedDoseTaken(input: {
  doseRecommendationId: string;
  administeredDate: string;
  batchNumber?: string | null;
  location?: string | null;
  notes?: string | null;
}) {
  const r = await apiFetch<{ success: boolean; id?: string }>(`/api/health/vaccines`, {
    method: 'POST',
    body: { action: 'mark', ...input },
  });
  return r.ok && r.data
    ? { success: true as const, id: r.data.id || null }
    : { success: false as const, error: r.error || 'Falha ao marcar dose' };
}

export async function dismissPendingDose(input: {
  childId: string;
  vaccineId: string;
  doseNumber: number;
  reason: 'snoozed_7d' | 'snoozed_30d' | 'already_scheduled' | 'medical_advice';
}) {
  const r = await apiFetch<{ success: boolean; dismissedUntil?: string }>(`/api/health/vaccines`, {
    method: 'POST',
    body: { action: 'dismiss', ...input },
  });
  return r.ok && r.data
    ? { success: true as const, dismissedUntil: r.data.dismissedUntil }
    : { success: false as const, error: r.error || 'Falha ao adiar' };
}

export async function setVaccinationCalendarPreference(input: {
  childId: string;
  preference: CalendarPreference;
}) {
  const r = await apiFetch<{ success: boolean }>(`/api/health/vaccines`, {
    method: 'PATCH',
    body: input,
  });
  return r.ok && r.data
    ? { success: true as const }
    : { success: false as const, error: r.error || 'Falha ao atualizar calendário' };
}

export async function updateVaccinationRecordViaEngine(input: {
  recordId: string;
  vaccineName?: string;
  doseLabel?: string | null;
  administeredDate?: string;
  batchNumber?: string | null;
  location?: string | null;
  notes?: string | null;
}) {
  const r = await apiFetch<{ success: boolean; id?: string }>(`/api/health/vaccines`, {
    method: 'PUT',
    body: input,
  });
  return r.ok && r.data
    ? { success: true as const, id: r.data.id || null }
    : { success: false as const, error: r.error || 'Falha ao atualizar' };
}

export async function deleteVaccinationRecordViaEngine(recordId: string) {
  const r = await apiFetch<{ success: boolean; childId?: string }>(`/api/health/vaccines`, {
    method: 'DELETE',
    query: { recordId },
  });
  return r.ok && r.data
    ? { success: true as const, childId: r.data.childId || null }
    : { success: false as const, error: r.error || 'Falha ao excluir' };
}

export async function matchVaccineCatalog(name: string): Promise<Array<{ id: string; code: string; name: string; similarity: number }>> {
  const r = await apiFetch<{ matches: Array<{ id: string; code: string; name: string; similarity: number }> }>(
    `/api/health/vaccines`,
    { method: 'GET', query: { match: name } },
  );
  return r.ok && r.data ? r.data.matches : [];
}
