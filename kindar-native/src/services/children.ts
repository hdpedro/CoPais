/**
 * Children Service — All writes use safeWrite.
 *
 * Same Supabase backend as the PWA (no separate native API). RLS policies
 * enforce group membership on every read/write — both platforms see
 * identical data because they query the same tables.
 */

import { supabase } from '../lib/supabase';
import { safeWrite } from './offline';
import { notifyAction } from './notify';

export interface Child {
  id: string; full_name: string; birth_date: string; gender: string | null;
  photo_url: string | null; blood_type: string | null; notes: string | null;
  allergies: string[] | null; cpf: string | null; rg: string | null;
}

export interface MedicalInfo {
  id: string;
  child_id: string;
  blood_type: string | null;
  health_insurance: string | null;
  insurance_card_number: string | null;
}

export interface GrowthRecord {
  id: string;
  child_id: string;
  weight_kg: number | null;
  height_cm: number | null;
  recorded_at: string;
}

export interface Allergy {
  id: string;
  child_id: string;
  allergen: string;
  severity: string | null;
  notes: string | null;
}

export interface ActiveMedication {
  id: string;
  child_id: string;
  name: string;
  dosage: string | null;
  frequency: string | null;
  status: string;
}

export interface Vaccination {
  id: string;
  child_id: string;
  vaccine_name: string;
  applied_date: string | null;
}

export interface ChildDocument {
  id: string;
  name: string;
  category: string;
  file_url: string;
  file_size: number | null;
  mime_type: string | null;
  child_id: string | null;
  uploaded_by: string;
  created_at: string;
  uploaderName?: string;
}

export interface ChildEducation {
  school_name: string | null; school_address: string | null; school_phone: string | null;
  grade: string | null; class_name: string | null; teacher_name: string | null; coordinator_name: string | null;
  entry_time: string | null; exit_time: string | null; extracurricular_activities: string[] | null;
}

export async function fetchChildren(groupId: string): Promise<Child[]> {
  const { data } = await supabase.from('children')
    .select('id, full_name, birth_date, gender, photo_url, blood_type, notes, allergies, cpf, rg')
    .eq('group_id', groupId).order('birth_date');
  return data || [];
}

/**
 * Single-call detail fetch matching the PWA's /criancas/[id] page exactly.
 * 8 parallel queries for first paint < 200ms on a warm Supabase pool.
 */
export interface ChildDetail {
  child: Child;
  medicalInfo: MedicalInfo | null;
  latestGrowth: GrowthRecord | null;
  allergies: Allergy[];
  medications: ActiveMedication[];
  vaccinations: Vaccination[];
  documents: ChildDocument[];
  education: ChildEducation | null;
}

export async function fetchChildDetail(childId: string, groupId: string): Promise<ChildDetail | null> {
  const [
    childRes,
    medicalRes,
    growthRes,
    allergiesRes,
    medsRes,
    vaccinesRes,
    documentsRes,
    educationRes,
  ] = await Promise.all([
    supabase
      .from('children')
      .select('id, full_name, birth_date, gender, photo_url, blood_type, notes, allergies, cpf, rg')
      .eq('id', childId)
      .eq('group_id', groupId)
      .maybeSingle(),
    supabase
      .from('child_medical_info')
      .select('id, child_id, blood_type, health_insurance, insurance_card_number')
      .eq('child_id', childId)
      .maybeSingle(),
    supabase
      .from('growth_records')
      .select('id, child_id, weight_kg, height_cm, recorded_at')
      .eq('child_id', childId)
      .order('recorded_at', { ascending: false })
      .limit(1),
    supabase
      .from('child_allergies')
      .select('id, child_id, allergen, severity, notes')
      .eq('child_id', childId)
      .order('created_at', { ascending: false }),
    supabase
      .from('active_medications')
      .select('id, child_id, name, dosage, frequency, status')
      .eq('child_id', childId)
      .eq('status', 'active'),
    supabase
      .from('vaccination_records')
      .select('id, child_id, vaccine_name, applied_date')
      .eq('child_id', childId)
      .order('applied_date', { ascending: false }),
    supabase
      .from('documents')
      .select('id, name, category, file_url, file_size, mime_type, child_id, uploaded_by, created_at, profiles!documents_uploaded_by_fkey(full_name)')
      .eq('group_id', groupId)
      .eq('child_id', childId)
      .order('created_at', { ascending: false }),
    supabase
      .from('child_education')
      .select('school_name, school_address, school_phone, grade, class_name, teacher_name, coordinator_name, entry_time, exit_time, extracurricular_activities')
      .eq('child_id', childId)
      .maybeSingle(),
  ]);

  if (!childRes.data) return null;

  // Supabase types FK joins as arrays of length 1; treat as opaque + extract.
  const documents = ((documentsRes.data ?? []) as unknown as Array<
    ChildDocument & { profiles?: { full_name?: string } | { full_name?: string }[] | null }
  >).map((d) => {
    const prof = Array.isArray(d.profiles) ? d.profiles[0] : d.profiles;
    return {
      ...d,
      uploaderName: prof?.full_name?.split(' ')[0] ?? '',
    } as ChildDocument;
  });

  return {
    child: childRes.data as Child,
    medicalInfo: (medicalRes.data as MedicalInfo | null) ?? null,
    latestGrowth: (growthRes.data?.[0] as GrowthRecord | undefined) ?? null,
    allergies: (allergiesRes.data ?? []) as Allergy[],
    medications: (medsRes.data ?? []) as ActiveMedication[],
    vaccinations: (vaccinesRes.data ?? []) as Vaccination[],
    documents,
    education: (educationRes.data as ChildEducation | null) ?? null,
  };
}

export async function fetchChildEducation(childId: string): Promise<ChildEducation | null> {
  const { data } = await supabase.from('child_education')
    .select('school_name, school_address, school_phone, grade, class_name, teacher_name, coordinator_name, entry_time, exit_time, extracurricular_activities')
    .eq('child_id', childId).maybeSingle();
  return data;
}

export async function upsertChildEducation(params: {
  childId: string;
  groupId: string;
  school_name: string | null;
  school_address: string | null;
  school_phone: string | null;
  grade: string | null;
  class_name: string | null;
  teacher_name: string | null;
  coordinator_name: string | null;
  entry_time: string | null;
  exit_time: string | null;
  extracurricular_activities: string[] | null;
}): Promise<{ success: true } | { success: false; error: string }> {
  const { childId, groupId, ...rest } = params;
  const { data: existing } = await supabase.from('child_education').select('id').eq('child_id', childId).maybeSingle();
  if (existing) {
    const { error } = await supabase.from('child_education').update(rest).eq('id', existing.id);
    if (error) return { success: false, error: error.message };
  } else {
    const { error } = await supabase.from('child_education').insert({ child_id: childId, group_id: groupId, ...rest });
    if (error) return { success: false, error: error.message };
  }
  return { success: true };
}

export async function createChild(params: { groupId: string; fullName: string; birthDate: string; gender?: string; notes?: string }) {
  const result = await safeWrite({
    table: 'children', operation: 'insert',
    payload: { group_id: params.groupId, full_name: params.fullName.trim(), birth_date: params.birthDate, gender: params.gender || null, notes: params.notes?.trim() || null },
  });
  if (result.success && !result.queued) {
    notifyAction('child_created', params.groupId, { childName: params.fullName });
  }
  return result;
}

export async function updateChild(childId: string, updates: Partial<Child>) {
  return safeWrite({ table: 'children', operation: 'update', payload: { id: childId, ...updates } });
}
