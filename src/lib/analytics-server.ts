/**
 * Analytics — server-side companion to analytics.ts.
 *
 * SERVER ONLY. Importing from a Client Component bundles posthog-node
 * (uses `node:fs`) into the browser bundle, which Turbopack rejects.
 *
 * If you're in "use client" code, import `trackEvent` from "@/lib/analytics".
 */

import { captureServerEvent as captureServerEventRaw } from "./posthog-server";
import { EVENTS, type EventName } from "./analytics";

export { EVENTS };
export type { EventName };

/**
 * Wraps posthog-server with a typed event name so we can't pass arbitrary
 * strings. No-op if PostHog env vars are not configured.
 */
export function trackServerEvent(
  userId: string,
  event: EventName,
  properties?: Record<string, unknown>
): void {
  captureServerEventRaw(userId, event, properties);
}
