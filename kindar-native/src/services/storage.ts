/**
 * Storage signed-URL helper for the native iOS/Android app.
 *
 * Mirrors src/lib/storage-signed-url.ts on the PWA. After migration 062
 * the buckets are private — you MUST sign URLs to display receipts /
 * documents. This module handles both legacy (full URL) and new (path)
 * formats stored in `documents.file_url` and `expenses.receipt_url`.
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
  ttlSec = 3600,
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
  ttlSec = 3600,
): Promise<Record<string, string | null>> {
  const out: Record<string, string | null> = {};
  await Promise.all(
    items.map(async (it) => {
      out[it.id] = await getSignedFileUrl(it.bucket, it.pathOrUrl, ttlSec);
    }),
  );
  return out;
}
