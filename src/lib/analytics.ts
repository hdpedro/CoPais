/**
 * Analytics — standardized funnel events.
 *
 * Why this exists: we already use PostHog via `captureServerEvent` and
 * the client `posthog-js` instance directly. That works but scatters
 * event names across dozens of files, causing typos and drift. This
 * module centralizes every growth-critical event so:
 *
 *   1. Event names are constants — no typos
 *   2. TypeScript types enforce the right properties per event
 *   3. Adding a new event means touching ONE file
 *   4. We document what each event means in one place
 *
 * Client-side: call `trackEvent(...)` from "use client" components.
 * Server-side: call `captureServerEvent(userId, EVENT, props)` from
 * actions / route handlers. (Note: analytics.ts re-exports the server
 * helper so you only import from one place.)
 */

import { getPostHogClient } from "./posthog";
import { captureServerEvent as captureServerEventRaw } from "./posthog-server";

// ============================================================
// EVENT CATALOG — every growth-critical event lives here
// ============================================================
export const EVENTS = {
  // Landing / acquisition
  LANDING_VIEWED: "landing_viewed",
  PRICING_VIEWED: "pricing_viewed",
  SIGNUP_STARTED: "signup_started",
  SIGNUP_COMPLETED: "signup_completed",

  // Onboarding
  GROUP_CREATED: "group_created",
  TRIAL_STARTED: "trial_started",
  QUEST_STEP_COMPLETED: "quest_step_completed",
  QUEST_ALL_COMPLETED: "quest_all_completed",

  // Conversion
  CHECKOUT_STARTED: "checkout_started",
  CHECKOUT_COMPLETED: "checkout_completed",
  COUPON_APPLIED: "coupon_applied",
  COUPON_REJECTED: "coupon_rejected",
  PAYMENT_METHOD_CHOSEN: "payment_method_chosen",
  SUBSCRIPTION_STARTED: "subscription_started",
  SUBSCRIPTION_SPLIT_ENABLED: "subscription_split_enabled",
  SUBSCRIPTION_SPLIT_DISABLED: "subscription_split_disabled",

  // Retention
  TRIAL_EXPIRED: "trial_expired",
  TRIAL_REMINDER_SENT: "trial_reminder_sent",
  RENEWAL_REMINDER_SENT: "renewal_reminder_sent",
  SUBSCRIPTION_CANCELED: "subscription_canceled",
  SUBSCRIPTION_RENEWED: "subscription_renewed",

  // Referral
  REFERRAL_LINK_COPIED: "referral_link_copied",
  REFERRAL_LINK_SHARED: "referral_link_shared",
  REFERRAL_CLICK: "referral_click",
  REFERRAL_REWARD_CLAIMED: "referral_reward_claimed",

  // A/B experiments
  EXPERIMENT_EXPOSED: "experiment_exposed",
} as const;

export type EventName = (typeof EVENTS)[keyof typeof EVENTS];

// ============================================================
// CLIENT-SIDE tracking
// ============================================================

/**
 * Track an event from client components. No-op if PostHog isn't
 * configured — never blocks the UI on analytics failure.
 */
export function trackEvent(event: EventName, properties?: Record<string, unknown>): void {
  const posthog = getPostHogClient();
  if (!posthog) return;
  try {
    posthog.capture(event, properties);
  } catch {
    // swallow — analytics failures never break UX
  }
}

/** Identify a user so subsequent events are attributed correctly. */
export function identifyUser(userId: string, traits?: Record<string, unknown>): void {
  const posthog = getPostHogClient();
  if (!posthog) return;
  try {
    posthog.identify(userId, traits);
  } catch {
    // swallow
  }
}

/** Reset on logout so the next session isn't fused with the previous user. */
export function resetAnalytics(): void {
  const posthog = getPostHogClient();
  if (!posthog) return;
  try {
    posthog.reset();
  } catch {
    // swallow
  }
}

// ============================================================
// SERVER-SIDE tracking — re-export for single import path
// ============================================================

/**
 * Server-side event capture. Wraps posthog-server with a typed
 * event name so we can't pass arbitrary strings.
 */
export function trackServerEvent(
  userId: string,
  event: EventName,
  properties?: Record<string, unknown>
): void {
  captureServerEventRaw(userId, event, properties);
}
