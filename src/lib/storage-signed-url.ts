/**
 * Storage signed-URL helper — works both pre and post migration 062.
 *
 * Before migration 062: `documents.file_url` and `expenses.receipt_url`
 * stored absolute public URLs (`https://<project>.supabase.co/storage/v1/object/public/<bucket>/<path>`).
 *
 * After migration 062: those columns store path-only (`{group_id}/{name}`)
 * and the buckets are private — public URLs return 404.
 *
 * This helper handles BOTH formats so code can call it unconditionally:
 *   - legacy URL detected → extract the path, then sign
 *   - path-only → sign directly
 *
 * Returns null on auth/permission failure so callers can fall back to a
 * "indisponivel" UI instead of broken images.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export type StorageBucket = "receipts" | "documents";

const PUBLIC_URL_RE =
  /\/storage\/v1\/object\/(?:public|sign)\/(receipts|documents)\/(.+?)(?:\?.*)?$/;

export function extractStoragePath(value: string): {
  bucket: StorageBucket | null;
  path: string;
} {
  if (!value) return { bucket: null, path: "" };

  const match = value.match(PUBLIC_URL_RE);
  if (match) {
    return { bucket: match[1] as StorageBucket, path: match[2] };
  }
  // Already a path
  return { bucket: null, path: value };
}

export async function getSignedFileUrl(
  supabase: SupabaseClient,
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

/**
 * Batch signer — useful for lists where many items each have a file_url.
 * Avoids round-trips by issuing requests in parallel; cap by bucket
 * because Supabase rate-limits per project.
 */
export async function getSignedFileUrls(
  supabase: SupabaseClient,
  items: Array<{ id: string; bucket: StorageBucket; pathOrUrl: string }>,
  ttlSec = 3600,
): Promise<Record<string, string | null>> {
  const out: Record<string, string | null> = {};
  await Promise.all(
    items.map(async (it) => {
      out[it.id] = await getSignedFileUrl(supabase, it.bucket, it.pathOrUrl, ttlSec);
    }),
  );
  return out;
}
