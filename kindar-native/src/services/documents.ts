/**
 * Documents Service — File management.
 *
 * Reads/writes the same `documents` table + `documents` storage bucket
 * as the PWA's /documentos and /criancas/[id] pages. Single source of
 * truth: when you upload from native, PWA users see it instantly via
 * Supabase realtime/refetch (and vice-versa).
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

/** Lighter fetch when filtering by a single child (used inside the
 *  Children detail screen — no need to ship every group document). */
export async function fetchDocumentsByChild(childId: string, groupId: string): Promise<Document[]> {
  const { data } = await supabase
    .from('documents')
    .select('id, name, category, file_url, file_size, mime_type, child_id, uploaded_by, created_at, profiles!documents_uploaded_by_fkey(full_name)')
    .eq('group_id', groupId)
    .eq('child_id', childId)
    .order('created_at', { ascending: false });

  return (data || []).map((d: any) => ({
    ...d,
    uploaderName: d.profiles?.full_name?.split(' ')[0] || '',
  }));
}

/**
 * Delete document + remove its file from storage. Mirrors the PWA's
 * `deleteChildDocument` action — same tables, same storage bucket.
 */
export async function deleteDocument(documentId: string): Promise<{ success: true } | { success: false; error: string }> {
  // Look up the file_url so we can also remove it from storage.
  const { data: doc, error: lookupErr } = await supabase
    .from('documents')
    .select('id, file_url')
    .eq('id', documentId)
    .maybeSingle();

  if (lookupErr || !doc) return { success: false, error: lookupErr?.message || 'Documento não encontrado' };

  // Try to remove from storage. If the file_url isn't a public Supabase URL
  // (e.g. legacy data) we just skip — the row delete still succeeds.
  try {
    const url = new URL(doc.file_url);
    const parts = url.pathname.split('/storage/v1/object/public/documents/');
    if (parts[1]) {
      await supabase.storage.from('documents').remove([decodeURIComponent(parts[1])]);
    }
  } catch {
    // ignore — storage cleanup is best-effort
  }

  const { error: delErr } = await supabase.from('documents').delete().eq('id', documentId);
  if (delErr) return { success: false, error: delErr.message };
  return { success: true };
}

export const DOCUMENT_CATEGORIES = [
  { value: 'rg', label: 'RG', icon: '🪪' },
  { value: 'cpf', label: 'CPF', icon: '📄' },
  { value: 'passaporte', label: 'Passaporte', icon: '🛂' },
  { value: 'certidao', label: 'Certidão', icon: '📜' },
  { value: 'plano_saude', label: 'Plano de Saúde', icon: '🏥' },
  { value: 'escola', label: 'Escolar', icon: '🎒' },
  { value: 'medico', label: 'Médico', icon: '💊' },
  { value: 'outro', label: 'Outro', icon: '📁' },
] as const;

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
