/**
 * Shared upload size guard (native).
 *
 * Pure — no platform imports — so it's unit-testable without mocks and reusable
 * across every upload path (documents, chat, expenses, children photos).
 *
 * Why this exists: ImagePicker reports `fileSize=0`/undefined on Android. The old
 * `input.size > MAX` check then silently passed (0 > 10MB === false) and let a huge
 * image reach `fetch(uri).arrayBuffer()` — which loads the whole file into memory
 * and OOM-crashes the app on send (the app "restarts"; nothing is captured in
 * app_errors because it's a native crash). Bug reported by Murilo, 2026-06-08.
 */

export const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

/**
 * Returns a human-readable over-limit error, or `null` if within the limit.
 *
 * Uses the MAX of the picker-reported size and the on-disk (stat) size, so an
 * unknown/zero reported size can't slip a huge file past the guard.
 */
export function uploadSizeError(
  reportedSize: number,
  statSize: number | null,
  maxBytes: number = MAX_FILE_SIZE,
): string | null {
  const size = Math.max(reportedSize || 0, statSize || 0);
  if (size > maxBytes) {
    const mb = (size / (1024 * 1024)).toFixed(1);
    const maxMb = Math.round(maxBytes / (1024 * 1024));
    return `Arquivo muito grande (${mb} MB). Máximo ${maxMb}MB.`;
  }
  return null;
}

/**
 * Best-known byte size from the picker-reported size and the on-disk size.
 * Returns 0 when neither is known (caller may store 0 = unknown).
 */
export function resolveFileSize(reportedSize: number, statSize: number | null): number {
  return Math.max(reportedSize || 0, statSize || 0);
}
