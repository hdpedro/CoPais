/**
 * Storage signed-URL helper for the native iOS/Android app.
 *
 * @deprecated pra download de arquivo completo (anexo, recibo). Use
 * `services/files.ts:openFileNative/downloadFileNative` que passa pelo
 * stream proxy `/api/files/[id]` autenticado + rate-limited.
 *
 * Mantida pra preview inline de imagem em chat — `<Image source={{uri}}>`
 * não suporta custom headers. TTL alinhado com a versão PWA (300s) pra
 * mitigar replay.
 */

import { supabase } from '../lib/supabase';

export type StorageBucket = 'receipts' | 'documents';

const PUBLIC_URL_RE =
  /\/storage\/v1\/object\/(?:public|sign)\/(receipts|documents)\/(.+?)(?:\?.*)?$/;

export function extractStoragePath(value: string): {
  bucket: StorageBucket | null;
  path: string;
} {
  if (!value) return { bucket: null, path: '' };
  const match = value.match(PUBLIC_URL_RE);
  if (match) {
    return { bucket: match[1] as StorageBucket, path: match[2] };
  }
  return { bucket: null, path: value };
}

export async function getSignedFileUrl(
  bucket: StorageBucket,
  pathOrUrl: string,
  ttlSec = 300,
): Promise<string | null> {
  if (!pathOrUrl) return null;
  const { path } = extractStoragePath(pathOrUrl);
  if (!path) return null;

  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(path, ttlSec);

  if (error || !data?.signedUrl) {
    if (error) console.warn(`[storage] signed url failed for ${bucket}/${path}:`, error.message);
    return null;
  }
  return data.signedUrl;
}

/** Batch signer — same pattern as PWA helper. */
export async function getSignedFileUrls(
  items: Array<{ id: string; bucket: StorageBucket; pathOrUrl: string }>,
  ttlSec = 300,
): Promise<Record<string, string | null>> {
  const out: Record<string, string | null> = {};
  await Promise.all(
    items.map(async (it) => {
      out[it.id] = await getSignedFileUrl(it.bucket, it.pathOrUrl, ttlSec);
    }),
  );
  return out;
}
