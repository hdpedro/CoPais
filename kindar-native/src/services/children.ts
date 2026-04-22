/**
 * Children Service — All writes use safeWrite.
 */

import { supabase } from '../lib/supabase';
import { safeWrite } from './offline';
import { notifyAction } from './notify';

export interface Child {
  id: string; full_name: string; birth_date: string; gender: string | null;
  photo_url: string | null; blood_type: string | null; notes: string | null;
  allergies: string[] | null; cpf: string | null; rg: string | null;
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
