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
import { apiFetch } from '../lib/api-fetch';
import * as FileSystem from 'expo-file-system/legacy';
import { uploadSizeError, resolveFileSize } from '../lib/upload-size';

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
 * Delete document + remove its file from storage via PWA admin route
 * (`/api/documents`). The route does the membership gate, RLS-bypass deletion
 * and best-effort storage cleanup — same code path the PWA uses.
 */
export async function deleteDocument(documentId: string): Promise<{ success: true } | { success: false; error: string }> {
  const r = await apiFetch<{ success: true }>(`/api/documents?id=${encodeURIComponent(documentId)}`, { method: 'DELETE' });
  if (!r.ok) return { success: false, error: r.error || 'Falha ao apagar documento' };
  return { success: true };
}

// Categories match the DB enum `document_category` defined in migration
// 00001_initial_schema.sql: ('personal', 'health', 'education', 'legal', 'other').
// PWA uses the same values — DocumentList/DocumentsDashboard label them as
// Pessoal, Saúde, Educação, Legal, Outro. Don't add new values here without
// also extending the enum on the database side, or inserts will fail with
// `invalid input value for enum document_category`.
export const DOCUMENT_CATEGORIES = [
  { value: 'personal', label: 'Pessoal', icon: '🪪' },
  { value: 'health', label: 'Saúde', icon: '🏥' },
  { value: 'education', label: 'Escolar', icon: '🎓' },
  { value: 'legal', label: 'Legal', icon: '📜' },
  { value: 'other', label: 'Outro', icon: '📁' },
] as const;

const ALLOWED_DOC_TYPES = [
  'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'image/gif',
  'application/pdf', 'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];
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
  if (!ALLOWED_DOC_TYPES.includes(input.mimeType)) return { success: false, error: 'Tipo de arquivo nao permitido.' };

  // Resolve the real on-disk size BEFORE reading the file into memory.
  // ImagePicker reports fileSize=0 on Android, which used to bypass the size
  // guard and let a huge image hit fetch().arrayBuffer() → native OOM → the app
  // "restarts" on send (bug Murilo, 2026-06-08; nothing in app_errors = native crash).
  let statSize: number | null = null;
  try {
    const info = await FileSystem.getInfoAsync(input.uri);
    if (info.exists && !info.isDirectory && typeof info.size === 'number') statSize = info.size;
  } catch {
    // best-effort: fall back to the picker-reported size
  }
  const sizeErr = uploadSizeError(input.size, statSize);
  if (sizeErr) return { success: false, error: sizeErr };
  const resolvedSize = resolveFileSize(input.size, statSize);

  try {
    // Convert URI to ArrayBuffer for Supabase upload in React Native.
    // Safe now that oversized files are rejected above (a document photo is a few MB).
    const res = await fetch(input.uri);
    const arrayBuffer = await res.arrayBuffer();

    const safeName = sanitizeName(input.fileName);
    const path = `${input.groupId}/${Date.now()}-${safeName}`;

    const { error: uploadErr } = await supabase.storage
      .from('documents')
      .upload(path, arrayBuffer, { contentType: input.mimeType, upsert: false });
    if (uploadErr) return { success: false, error: uploadErr.message };

    // After migration 062: store path-only. Reads sign URLs at render time
    // via getSignedFileUrl() from src/services/storage.ts.
    // Insert via PWA route so child-belongs-to-group gate runs once.
    const r = await apiFetch<{ success: true }>(`/api/documents`, {
      method: 'POST',
      body: {
        groupId: input.groupId,
        childId: input.childId,
        category: input.category,
        name: input.displayName,
        filePath: path,
        fileSize: resolvedSize,
        mimeType: input.mimeType,
      },
    });
    if (!r.ok) return { success: false, error: r.error || 'Falha ao registrar documento' };

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Falha ao enviar documento' };
  }
}
