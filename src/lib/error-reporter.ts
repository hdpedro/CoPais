/* ------------------------------------------------------------------ */
/* Error Reporter — client-side utility to report errors               */
/* Non-blocking, deduplicating, never throws                           */
/* ------------------------------------------------------------------ */

const DEDUP_TTL_MS = 60_000;
const recentErrors = new Map<string, number>();

/** Extract a file path from an error stack trace */
function extractFilePath(stack: string | undefined): string | undefined {
  if (!stack) return undefined;

  // Match webpack-style paths: at Component (webpack-internal:///./src/components/Foo.tsx:12:5)
  // or standard paths containing src/
  const patterns = [
    /(?:src\/[^\s:)]+)/,
    /(?:webpack-internal:\/\/\/\.\/(src\/[^\s:)]+))/,
  ];

  for (const pattern of patterns) {
    const match = stack.match(pattern);
    if (match) return match[1] ?? match[0];
  }

  return undefined;
}

/** Create a fingerprint for deduplication */
function fingerprint(message: string, filePath?: string): string {
  return `${message}::${filePath ?? ""}`;
}

/** Clean expired entries from the dedup map */
function cleanExpired(): void {
  const now = Date.now();
  for (const [key, ts] of recentErrors) {
    if (now - ts > DEDUP_TTL_MS) recentErrors.delete(key);
  }
}

/**
 * Report an error to the tracking system.
 * Safe to call from anywhere — never throws, deduplicates within 60s.
 */
export async function reportError(
  error: Error,
  metadata?: Record<string, unknown>
): Promise<string | null> {
  try {
    cleanExpired();

    const filePath = extractFilePath(error.stack);
    const fp = fingerprint(error.message, filePath);

    // Skip if we recently reported the same error
    if (recentErrors.has(fp)) return null;
    recentErrors.set(fp, Date.now());

    const response = await fetch("/api/log-error", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: error.message,
        stack: error.stack,
        filePath,
        metadata,
      }),
    });

    if (!response.ok) return null;

    const data = await response.json();
    return data.id ?? null;
  } catch {
    // Never throw — error reporting must not cause cascading failures
    return null;
  }
}
