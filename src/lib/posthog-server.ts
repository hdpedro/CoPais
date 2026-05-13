import { PostHog } from "posthog-node";
import { headers, cookies } from "next/headers";

let serverPostHog: PostHog | null = null;

function getServerPostHog(): PostHog | null {
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  const host =
    process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://us.i.posthog.com";

  if (!key) return null;

  if (!serverPostHog) {
    serverPostHog = new PostHog(key, {
      host,
      flushAt: 1,
      flushInterval: 0,
    });
  }

  return serverPostHog;
}

/**
 * Resolves the originating client platform from the current request.
 *
 * - Native clients (`kindar-native`) send `X-Client-Platform` via
 *   `apiFetch` — wins when present.
 * - PWA clients set the `kindar-platform` cookie from
 *   `PostHogAnonymousInit` — falls back here.
 * - Cron jobs, webhooks, background tasks: no request context, returns
 *   `'server'`.
 *
 * Returns `'server'` on any failure (no request context, malformed header)
 * so analytics never blocks the call.
 */
async function resolveServerPlatform(): Promise<string> {
  try {
    const h = await headers();
    const fromHeader = h.get("x-client-platform");
    if (fromHeader) return fromHeader;
    const c = await cookies();
    const fromCookie = c.get("kindar-platform")?.value;
    if (fromCookie) return fromCookie;
    return "server";
  } catch {
    return "server";
  }
}

/**
 * Safely capture a server-side PostHog event. Fire-and-forget — never
 * blocks the caller. No-ops if PostHog env vars are not configured.
 *
 * Stamps every event with `platform` so server-side captures (e.g.,
 * `user_login`, `swap_request_created`) can be broken down alongside
 * client events in PostHog Trends.
 */
export function captureServerEvent(
  userId: string,
  event: string,
  properties?: Record<string, unknown>
) {
  // The async work runs in an IIFE so the public signature stays sync
  // (matches all existing call sites that fire-and-forget). Errors are
  // swallowed internally — analytics never breaks the app.
  void (async () => {
    try {
      const ph = getServerPostHog();
      if (!ph) return;
      const platform = await resolveServerPlatform();
      ph.capture({
        distinctId: userId,
        event,
        properties: { ...properties, platform },
      });
    } catch {
      // Never let analytics break the app
    }
  })();
}
