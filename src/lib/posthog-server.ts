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
// Revenue-critical events that we want loud in logs if PostHog is unreachable.
// Losing one of these means we can't attribute paid conversions, so an alert
// in Vercel logs / Sentry is worth the noise.
const REVENUE_CRITICAL = new Set([
  "checkout_started",
  "checkout_completed",
  "subscription_started",
  "subscription_renewed",
  "subscription_canceled",
  "payment_failed",
  "trial_started",
  "trial_expired",
]);

export function captureServerEvent(
  userId: string,
  event: string,
  properties?: Record<string, unknown>
) {
  // The async work runs in an IIFE so the public signature stays sync
  // (matches all existing call sites that fire-and-forget). Errors are
  // swallowed internally — analytics never breaks the app, but we log
  // revenue-critical events explicitly so a PostHog outage is visible.
  void (async () => {
    try {
      const ph = getServerPostHog();
      if (!ph) {
        if (REVENUE_CRITICAL.has(event)) {
          console.error(
            `[posthog-server] DROPPED revenue-critical event '${event}' for user ${userId} — PostHog client not configured`,
          );
        }
        return;
      }
      const platform = await resolveServerPlatform();
      ph.capture({
        distinctId: userId,
        event,
        properties: { ...properties, platform },
      });
    } catch (err) {
      // Log loudly for revenue events; silent for others so we don't spam logs.
      if (REVENUE_CRITICAL.has(event)) {
        console.error(
          `[posthog-server] FAILED to capture revenue-critical event '${event}' for user ${userId}:`,
          err,
        );
      }
    }
  })();
}

/**
 * Awaitable variant of {@link captureServerEvent} for short-lived requests
 * (e.g. redirect routes) where the function may freeze before a
 * fire-and-forget flush completes. Pair it with Next's `after()` so the
 * response is sent instantly while the event still reliably ships:
 *
 *   after(() => captureServerEventAndFlush(id, "store_link_click", {...}))
 *
 * Errors are swallowed — analytics never breaks the request.
 */
export async function captureServerEventAndFlush(
  userId: string,
  event: string,
  properties?: Record<string, unknown>,
): Promise<void> {
  try {
    const ph = getServerPostHog();
    if (!ph) return;
    const platform = await resolveServerPlatform();
    ph.capture({
      distinctId: userId,
      event,
      properties: { ...properties, platform },
    });
    await ph.flush();
  } catch {
    // analytics never breaks the app
  }
}
