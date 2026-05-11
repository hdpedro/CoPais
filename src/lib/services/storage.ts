/* ------------------------------------------------------------------ */
/* services/storage.ts                                                  */
/* Source of truth pra acesso a arquivos privados nos buckets           */
/* `documents` e `receipts`.                                            */
/*                                                                      */
/* Funções:                                                             */
/*   - getSignedDocumentUrl / getSignedReceiptUrl                       */
/*       Gera signed URL TTL=300s. Continuam aqui pra compatibilidade   */
/*       com os endpoints `/sign` (deprecated, ver SIGNED_URLS_DEPRECATED). */
/*                                                                      */
/*   - streamDocumentForUser / streamReceiptForUser                     */
/*       Faz download server-side via admin client e retorna o blob +   */
/*       metadata pro endpoint GET /api/files/[id] streamear pro client.*/
/*       Cada byte passa pelo Vercel → rate-limit + audit log aplicáveis.*/
/*                                                                      */
/*   - validateFileAccess (helper interno usado por todas as 4 acima)   */
/*       Centraliza a checagem de group membership pra reuso.           */
/* ------------------------------------------------------------------ */

import { SupabaseClient } from "@supabase/supabase-js";
import {
  extractStoragePath,
  getSignedFileUrl,
  type StorageBucket,
} from "@/lib/storage-signed-url";

export type ServiceResult<T = Record<string, unknown>> =
  | { ok: true; data: T }
  | { ok: false; error: string; status: number };

export interface SignedUrlResult {
  url: string;
  expiresAt: string;
  ttlSec: number;
  mimeType: string | null;
  name: string;
}

export interface StreamFileResult {
  blob: Blob;
  bytes: number;
  mimeType: string;
  name: string;
  /** Path final usado no Storage (pra audit). */
  path: string;
  /** Bucket onde o arquivo está. */
  bucket: StorageBucket;
}

const REFRESH_TTL_SEC = 300; // 5 min — TTL signed URL (path deprecated)

interface ResolvedFile {
  groupId: string;
  path: string;
  bucket: StorageBucket;
  name: string;
  mimeType: string | null;
}

async function validateFileAccess(
  admin: SupabaseClient,
  userId: string,
  groupId: string,
): Promise<ServiceResult<{ ok: true }>> {
  const { data: membership } = await admin
    .from("group_members")
    .select("user_id")
    .eq("group_id", groupId)
    .eq("user_id", userId)
    .single();

  if (!membership) {
    return { ok: false, error: "Sem permissão para este grupo.", status: 403 };
  }
  return { ok: true, data: { ok: true } };
}

async function resolveDocument(
  admin: SupabaseClient,
  documentId: string,
): Promise<ServiceResult<ResolvedFile>> {
  const { data: doc } = await admin
    .from("documents")
    .select("id, group_id, file_url, name, mime_type")
    .eq("id", documentId)
    .single();

  if (!doc) return { ok: false, error: "Documento não encontrado.", status: 404 };
  if (!doc.file_url) return { ok: false, error: "Documento sem arquivo associado.", status: 404 };

  const { path } = extractStoragePath(doc.file_url);
  if (!path) return { ok: false, error: "Path do arquivo inválido.", status: 500 };

  return {
    ok: true,
    data: {
      groupId: doc.group_id,
      path,
      bucket: "documents",
      name: doc.name,
      mimeType: doc.mime_type,
    },
  };
}

async function resolveReceipt(
  admin: SupabaseClient,
  expenseId: string,
): Promise<ServiceResult<ResolvedFile>> {
  const { data: expense } = await admin
    .from("expenses")
    .select("id, group_id, receipt_url, description")
    .eq("id", expenseId)
    .single();

  if (!expense) return { ok: false, error: "Despesa não encontrada.", status: 404 };
  if (!expense.receipt_url) return { ok: false, error: "Despesa sem recibo associado.", status: 404 };

  const { path } = extractStoragePath(expense.receipt_url);
  if (!path) return { ok: false, error: "Path do arquivo inválido.", status: 500 };

  return {
    ok: true,
    data: {
      groupId: expense.group_id,
      path,
      bucket: "receipts",
      name: expense.description || "recibo",
      mimeType: null,
    },
  };
}

// ------------------- Signed URL (deprecated) -------------------

async function signResolved(
  admin: SupabaseClient,
  resolved: ResolvedFile,
): Promise<ServiceResult<SignedUrlResult>> {
  const url = await getSignedFileUrl(admin, resolved.bucket, resolved.path, REFRESH_TTL_SEC);
  if (!url) {
    return { ok: false, error: "Não foi possível gerar URL do arquivo.", status: 500 };
  }

  return {
    ok: true,
    data: {
      url,
      expiresAt: new Date(Date.now() + REFRESH_TTL_SEC * 1000).toISOString(),
      ttlSec: REFRESH_TTL_SEC,
      mimeType: resolved.mimeType,
      name: resolved.name,
    },
  };
}

/** @deprecated Use streamDocumentForUser via /api/files/[id]?type=document. */
export async function getSignedDocumentUrl(
  admin: SupabaseClient,
  userId: string,
  documentId: string,
): Promise<ServiceResult<SignedUrlResult>> {
  const resolved = await resolveDocument(admin, documentId);
  if (!resolved.ok) return resolved;
  const access = await validateFileAccess(admin, userId, resolved.data.groupId);
  if (!access.ok) return access;
  return signResolved(admin, resolved.data);
}

/** @deprecated Use streamReceiptForUser via /api/files/[id]?type=receipt. */
export async function getSignedReceiptUrl(
  admin: SupabaseClient,
  userId: string,
  expenseId: string,
): Promise<ServiceResult<SignedUrlResult>> {
  const resolved = await resolveReceipt(admin, expenseId);
  if (!resolved.ok) return resolved;
  const access = await validateFileAccess(admin, userId, resolved.data.groupId);
  if (!access.ok) return access;
  return signResolved(admin, resolved.data);
}

// ------------------- Stream proxy -------------------

async function streamResolved(
  admin: SupabaseClient,
  resolved: ResolvedFile,
): Promise<ServiceResult<StreamFileResult>> {
  const { data, error } = await admin.storage
    .from(resolved.bucket)
    .download(resolved.path);

  if (error || !data) {
    console.warn(
      `[storage] download falhou ${resolved.bucket}/${resolved.path}:`,
      error?.message,
    );
    return { ok: false, error: "Arquivo indisponível.", status: 502 };
  }

  return {
    ok: true,
    data: {
      blob: data,
      bytes: data.size,
      mimeType: resolved.mimeType || data.type || "application/octet-stream",
      name: resolved.name,
      path: resolved.path,
      bucket: resolved.bucket,
    },
  };
}

export async function streamDocumentForUser(
  admin: SupabaseClient,
  userId: string,
  documentId: string,
): Promise<ServiceResult<StreamFileResult>> {
  const resolved = await resolveDocument(admin, documentId);
  if (!resolved.ok) return resolved;
  const access = await validateFileAccess(admin, userId, resolved.data.groupId);
  if (!access.ok) return access;
  return streamResolved(admin, resolved.data);
}

export async function streamReceiptForUser(
  admin: SupabaseClient,
  userId: string,
  expenseId: string,
): Promise<ServiceResult<StreamFileResult>> {
  const resolved = await resolveReceipt(admin, expenseId);
  if (!resolved.ok) return resolved;
  const access = await validateFileAccess(admin, userId, resolved.data.groupId);
  if (!access.ok) return access;
  return streamResolved(admin, resolved.data);
}
