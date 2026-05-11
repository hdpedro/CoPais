/* ------------------------------------------------------------------ */
/* services/storage.ts                                                  */
/* Single source of truth pra signed URLs on-demand de objetos privados */
/* nos buckets `documents` e `receipts`.                                */
/*                                                                      */
/* Por quê: depois da migration 062, ambos os buckets são privados e os */
/* reads passam por `createSignedUrl(path, ttlSec)`. Os reads da página */
/* (listagens, modais) já assinam server-side com TTL curto (5min). Mas */
/* algumas ações precisam de URL fresca fora do request inicial:        */
/*   - clique em "download" minutos depois do load da página            */
/*   - native que perdeu a URL anterior por TTL                         */
/*                                                                      */
/* Este service valida sessão + group membership antes de assinar.      */
/* É chamado por `/api/documents/[id]/sign` (PWA + native).             */
/* ------------------------------------------------------------------ */

import { SupabaseClient } from "@supabase/supabase-js";
import { getSignedFileUrl, type StorageBucket } from "@/lib/storage-signed-url";

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

const REFRESH_TTL_SEC = 300; // 5 min — janela curta o suficiente pra mitigar
                              // share/screenshot mas longa o suficiente pra
                              // download grande em conexão ruim.

async function signWithMembershipCheck(
  admin: SupabaseClient,
  userId: string,
  bucket: StorageBucket,
  groupId: string,
  filePath: string,
  meta: { name: string; mimeType: string | null },
): Promise<ServiceResult<SignedUrlResult>> {
  const { data: membership } = await admin
    .from("group_members")
    .select("user_id")
    .eq("group_id", groupId)
    .eq("user_id", userId)
    .single();

  if (!membership) {
    return { ok: false, error: "Sem permissão para este grupo.", status: 403 };
  }

  const url = await getSignedFileUrl(admin, bucket, filePath, REFRESH_TTL_SEC);
  if (!url) {
    return {
      ok: false,
      error: "Não foi possível gerar URL do arquivo.",
      status: 500,
    };
  }

  const expiresAt = new Date(Date.now() + REFRESH_TTL_SEC * 1000).toISOString();
  return {
    ok: true,
    data: {
      url,
      expiresAt,
      ttlSec: REFRESH_TTL_SEC,
      mimeType: meta.mimeType,
      name: meta.name,
    },
  };
}

export async function getSignedDocumentUrl(
  admin: SupabaseClient,
  userId: string,
  documentId: string,
): Promise<ServiceResult<SignedUrlResult>> {
  const { data: doc } = await admin
    .from("documents")
    .select("id, group_id, file_url, name, mime_type")
    .eq("id", documentId)
    .single();

  if (!doc) {
    return { ok: false, error: "Documento não encontrado.", status: 404 };
  }
  if (!doc.file_url) {
    return { ok: false, error: "Documento sem arquivo associado.", status: 404 };
  }

  return signWithMembershipCheck(admin, userId, "documents", doc.group_id, doc.file_url, {
    name: doc.name,
    mimeType: doc.mime_type,
  });
}

export async function getSignedReceiptUrl(
  admin: SupabaseClient,
  userId: string,
  expenseId: string,
): Promise<ServiceResult<SignedUrlResult>> {
  const { data: expense } = await admin
    .from("expenses")
    .select("id, group_id, receipt_url, description")
    .eq("id", expenseId)
    .single();

  if (!expense) {
    return { ok: false, error: "Despesa não encontrada.", status: 404 };
  }
  if (!expense.receipt_url) {
    return { ok: false, error: "Despesa sem recibo associado.", status: 404 };
  }

  return signWithMembershipCheck(admin, userId, "receipts", expense.group_id, expense.receipt_url, {
    name: expense.description || "recibo",
    mimeType: null,
  });
}
