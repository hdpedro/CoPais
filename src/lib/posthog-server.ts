import { PostHog } from "posthog-node";

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
 * Safely capture a server-side PostHog event.
 * No-ops if PostHog env vars are not configured.
 */
export function captureServerEvent(
  userId: string,
  event: string,
  properties?: Record<string, unknown>
) {
  try {
    const ph = getServerPostHog();
    if (!ph) return;
    ph.capture({
      distinctId: userId,
      event,
      properties,
    });
  } catch {
    // Never let analytics break the app
  }
}
