/**
 * Documents Service — File management.
 */

import { supabase } from '../lib/supabase';

export interface Document {
  id: string;
  name: string;
  category: string;
  file_url: string;
  file_size: number | null;
  mime_type: string | null;
  child_id: string | null;
  uploaded_by: string;
  created_at: string;
  childName?: string;
  uploaderName?: string;
}

export async function fetchDocuments(groupId: string): Promise<Document[]> {
  const { data } = await supabase
    .from('documents')
    .select('id, name, category, file_url, file_size, mime_type, child_id, uploaded_by, created_at, children(full_name), profiles!documents_uploaded_by_fkey(full_name)')
    .eq('group_id', groupId)
    .order('created_at', { ascending: false })
    .limit(100);

  return (data || []).map((d: any) => ({
    ...d,
    childName: d.children?.full_name?.split(' ')[0] || '',
    uploaderName: d.profiles?.full_name?.split(' ')[0] || '',
  }));
}
