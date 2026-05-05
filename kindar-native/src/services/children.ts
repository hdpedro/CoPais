/**
 * Children Service — All writes use safeWrite.
 *
 * Same Supabase backend as the PWA (no separate native API). RLS policies
 * enforce group membership on every read/write — both platforms see
 * identical data because they query the same tables.
 */

import { supabase } from '../lib/supabase';
import { apiFetch } from '../lib/api-fetch';
import { safeWrite } from './offline';
import { notifyAction } from './notify';

export interface Child {
  id: string;
  full_name: string;
  birth_date: string;
  /** 'M' | 'F' | null — matches DB CHECK constraint (migration 00036). */
  sex: 'M' | 'F' | null;
  photo_url: string | null;
  notes: string | null;
  allergies: string[] | null;
  cpf: string | null;
  rg: string | null;
}

export interface MedicalInfo {
  id: string;
  child_id: string;
  blood_type: string | null;
  /** DB column is `insurance_name` (migration history). */
  insurance_name: string | null;
  /** DB column is `insurance_number`. */
  insurance_number: string | null;
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
  // NB: `blood_type` lives on `child_medical_info`, not `children`. Listing
  // it here used to make PostgREST 400 the whole query and the Crianças list
  // came up empty / the detail page rendered "Criança não encontrada".
  const { data } = await supabase.from('children')
    .select('id, full_name, birth_date, sex, photo_url, notes, allergies, cpf, rg')
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
      .select('id, full_name, birth_date, sex, photo_url, notes, allergies, cpf, rg')
      .eq('id', childId)
      .eq('group_id', groupId)
      .maybeSingle(),
    supabase
      .from('child_medical_info')
      .select('id, child_id, blood_type, insurance_name, insurance_number')
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

  // Sign avatar URL just-in-time. We store the storage path (no host) in
  // children.photo_url for new uploads. Legacy rows may already contain a
  // full URL — pass those through unchanged.
  const childRow = childRes.data as Child;
  if (childRow.photo_url && !/^https?:\/\//i.test(childRow.photo_url)) {
    const signed = await signChildAvatar(childRow.photo_url);
    if (signed) childRow.photo_url = signed;
  }

  return {
    child: childRow,
    medicalInfo: (medicalRes.data as MedicalInfo | null) ?? null,
    latestGrowth: (growthRes.data?.[0] as GrowthRecord | undefined) ?? null,
    allergies: (allergiesRes.data ?? []) as Allergy[],
    medications: (medsRes.data ?? []) as ActiveMedication[],
    vaccinations: (vaccinesRes.data ?? []) as Vaccination[],
    documents,
    education: (educationRes.data as ChildEducation | null) ?? null,
  };
}

/**
 * Sign a child avatar storage path via the `documents` bucket. Avatars share
 * the bucket because its RLS already restricts access to group members
 * (folder[0] = group_id). Path convention: `{groupId}/_avatars/{childId}.jpg`.
 */
export async function signChildAvatar(path: string): Promise<string | null> {
  const { data, error } = await supabase.storage
    .from('documents')
    .createSignedUrl(path, 60 * 60); // 1h is enough for a screen view
  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
}

/**
 * Upload a new avatar for a child. Overwrites the prior file at the same
 * path (`{groupId}/_avatars/{childId}.jpg`) so we never accumulate orphans.
 * Stores only the storage path in `children.photo_url`; the URL is signed
 * on read by `fetchChildDetail`.
 *
 * The asset must be a local file URI from expo-image-picker.
 */
export async function uploadChildAvatar(params: {
  childId: string;
  groupId: string;
  uri: string;
  mimeType?: string | null;
}): Promise<{ success: true; path: string } | { success: false; error: string }> {
  const ext = (() => {
    const m = (params.mimeType || '').match(/^image\/(\w+)/i);
    if (m) return m[1].toLowerCase().replace('jpeg', 'jpg');
    const u = params.uri.split('?')[0];
    const e = u.split('.').pop()?.toLowerCase();
    return e && /^[a-z0-9]+$/.test(e) ? e.replace('jpeg', 'jpg') : 'jpg';
  })();
  const path = `${params.groupId}/_avatars/${params.childId}.${ext}`;

  // RN file→Blob via fetch — the standard supabase-js + expo pattern.
  let body: Blob;
  try {
    const res = await fetch(params.uri);
    body = await res.blob();
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'Falha ao ler imagem' };
  }

  const { error: uploadErr } = await supabase.storage
    .from('documents')
    .upload(path, body, {
      contentType: params.mimeType || `image/${ext}`,
      upsert: true,
    });
  if (uploadErr) return { success: false, error: uploadErr.message };

  const writeRes = await safeWrite({
    table: 'children',
    operation: 'update',
    payload: { id: params.childId, photo_url: path },
  });
  if (!writeRes.success) return { success: false, error: writeRes.error || 'Falha ao salvar foto' };
  return { success: true, path };
}

/**
 * Upsert blood type (and other future fields) on `child_medical_info`.
 * RLS enforces group membership.
 */
export async function upsertChildMedicalInfo(params: {
  childId: string;
  groupId: string;
  blood_type?: string | null;
}): Promise<{ success: true } | { success: false; error: string }> {
  const { error } = await supabase
    .from('child_medical_info')
    .upsert(
      {
        child_id: params.childId,
        group_id: params.groupId,
        blood_type: params.blood_type ?? null,
      },
      { onConflict: 'child_id' }
    );
  if (error) return { success: false, error: error.message };
  return { success: true };
}

export async function fetchChildEducation(childId: string): Promise<ChildEducation | null> {
  const { data } = await supabase.from('child_education')
    .select('school_name, school_address, school_phone, grade, class_name, teacher_name, coordinator_name, entry_time, exit_time, extracurricular_activities')
    .eq('child_id', childId).maybeSingle();
  return data;
}

/**
 * Wave I (SoT): writes go through `/api/children/education` so the
 * group-membership + child-belongs-to-group gates run server-side.
 * Native previously upserted directly on `child_education`, relying on
 * RLS only.
 */
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
  const r = await apiFetch<{ success: boolean }>('/api/children/education', {
    method: 'PUT',
    body: {
      groupId: params.groupId,
      childId: params.childId,
      school_name: params.school_name,
      school_address: params.school_address,
      school_phone: params.school_phone,
      grade: params.grade,
      class_name: params.class_name,
      teacher_name: params.teacher_name,
      coordinator_name: params.coordinator_name,
      entry_time: params.entry_time,
      exit_time: params.exit_time,
      extracurricular_activities: params.extracurricular_activities,
    },
  });
  return r.ok ? { success: true } : { success: false, error: r.error || 'Falha ao salvar' };
}

/**
 * Create a child in the active group.
 *
 * Schema: migration 00036 added `sex TEXT CHECK (sex IN ('M','F'))`. Earlier
 * versions of this service tried to write `gender` which does not exist as
 * a column → all inserts failed with HTTP 400. Fixed 2026-04-27 by
 * aligning with the actual column name and accepting an `allergies: string[]`.
 */
export async function createChild(params: {
  groupId: string;
  fullName: string;
  birthDate: string;
  sex?: 'M' | 'F' | null;
  allergies?: string[] | null;
  notes?: string;
}) {
  const result = await safeWrite({
    table: 'children',
    operation: 'insert',
    payload: {
      group_id: params.groupId,
      full_name: params.fullName.trim(),
      birth_date: params.birthDate,
      sex: params.sex || null,
      allergies: params.allergies && params.allergies.length > 0 ? params.allergies : null,
      notes: params.notes?.trim() || null,
    },
  });
  if (result.success && !result.queued) {
    notifyAction('child_created', params.groupId, { childName: params.fullName });
  }
  return result;
}

export async function updateChild(childId: string, updates: Partial<Child>) {
  return safeWrite({ table: 'children', operation: 'update', payload: { id: childId, ...updates } });
}
