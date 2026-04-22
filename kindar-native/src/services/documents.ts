/**
 * Documents Service — File management.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */

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

const ALLOWED_DOC_TYPES = [
  'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'image/gif',
  'application/pdf', 'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

function sanitizeName(raw: string): string {
  return raw
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/_+/g, '_');
}

export interface UploadDocumentInput {
  uri: string;
  fileName: string;
  mimeType: string;
  size: number;
  groupId: string;
  childId: string | null;
  category: string;
  displayName: string;
  uploadedBy: string;
}

export async function uploadDocument(input: UploadDocumentInput): Promise<{ success: true } | { success: false; error: string }> {
  if (input.size > MAX_FILE_SIZE) return { success: false, error: 'Arquivo muito grande. Maximo 10MB.' };
  if (!ALLOWED_DOC_TYPES.includes(input.mimeType)) return { success: false, error: 'Tipo de arquivo nao permitido.' };

  try {
    // Convert URI to ArrayBuffer for Supabase upload in React Native
    const res = await fetch(input.uri);
    const arrayBuffer = await res.arrayBuffer();

    const safeName = sanitizeName(input.fileName);
    const path = `${input.groupId}/${Date.now()}-${safeName}`;

    const { error: uploadErr } = await supabase.storage
      .from('documents')
      .upload(path, arrayBuffer, { contentType: input.mimeType, upsert: false });
    if (uploadErr) return { success: false, error: uploadErr.message };

    const { data: urlData } = supabase.storage.from('documents').getPublicUrl(path);

    const { error: insertErr } = await supabase.from('documents').insert({
      group_id: input.groupId,
      child_id: input.childId,
      category: input.category,
      name: input.displayName,
      file_url: urlData.publicUrl,
      file_size: input.size,
      mime_type: input.mimeType,
      uploaded_by: input.uploadedBy,
    });
    if (insertErr) return { success: false, error: insertErr.message };

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Falha ao enviar documento' };
  }
}
