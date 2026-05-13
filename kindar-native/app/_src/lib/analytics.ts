/**
 * Analytics — Kindar Native (iOS + Android).
 *
 * Mirrors the PWA's `src/lib/analytics.ts` API so cross-platform metrics
 * stay clean: same event names, same `distinctId` (Supabase user UUID),
 * same `platform` super-property. PostHog merges sessions across all
 * three surfaces into a single "person" automatically.
 *
 * Setup contract:
 *   1. Bootstrap once in `app/_layout.tsx`:        `initAnalytics()`
 *   2. After Supabase auth resolves a user:        `identify(userId, traits?)`
 *   3. On logout:                                  `reset()`
 *   4. Fire events from anywhere:                  `track('event_name', { ... })`
 *
 * Performance / clean-code notes:
 *   - Singleton: PostHog is constructed at most once per process.
 *   - Non-blocking: constructor returns immediately; SDK flushes in
 *     background. UI never awaits analytics.
 *   - Resilient: every public call is wrapped in try/catch — an
 *     analytics failure must never break user-facing code.
 *   - No session recording (would balloon storage + free-tier usage).
 */

import { Platform, type PlatformOSType } from 'react-native';
import PostHog from 'posthog-react-native';

// ============================================================
// EVENT CATALOG — keep names IDENTICAL to PWA's src/lib/analytics.ts.
// No monorepo here, so we duplicate the constant rather than introduce
// a shared package. Drift between web and mobile names would silently
// break Trends breakdowns — keep them aligned.
// ============================================================
export const EVENTS = {
  // Acquisition
  LANDING_VIEWED: 'landing_viewed',
  PRICING_VIEWED: 'pricing_viewed',
  SIGNUP_STARTED: 'signup_started',
  SIGNUP_COMPLETED: 'signup_completed',

  // Onboarding
  GROUP_CREATED: 'group_created',
  TRIAL_STARTED: 'trial_started',
  QUEST_STEP_COMPLETED: 'quest_step_completed',
  QUEST_ALL_COMPLETED: 'quest_all_completed',

  // Conversion
  CHECKOUT_STARTED: 'checkout_started',
  CHECKOUT_COMPLETED: 'checkout_completed',
  SUBSCRIPTION_STARTED: 'subscription_started',

  // Retention
  TRIAL_EXPIRED: 'trial_expired',
  SUBSCRIPTION_CANCELED: 'subscription_canceled',
  SUBSCRIPTION_RENEWED: 'subscription_renewed',

  // Referral
  REFERRAL_LINK_COPIED: 'referral_link_copied',
  REFERRAL_LINK_SHARED: 'referral_link_shared',

  // Collaborative Records Foundation — Fase 1.
  NOTIFICATION_OPENED: 'notification_opened',
  SCHOOL_LOG_READ: 'school_log_read',
  UNREAD_COUNT: 'unread_count',
  URGENT_CREATED: 'urgent_created',

  // Calendar — custody integrity regression alarm
  CUSTODY_OVERLAP_DETECTED: 'custody_overlap_detected',

  // Expenses — Fase 1B
  EXPENSE_READ: 'expense_read',
  EXPENSE_CREATED: 'expense_created',
  EXPENSE_EDITED: 'expense_edited',
  EXPENSE_CANCELLED: 'expense_cancelled',
  EXPENSE_CANCEL_REQUESTED: 'expense_cancel_requested',
  EXPENSE_CANCEL_APPROVED: 'expense_cancel_approved',
  EXPENSE_CANCEL_REJECTED: 'expense_cancel_rejected',
  EXPENSE_REOPENED: 'expense_reopened',
} as const;

export type EventName = (typeof EVENTS)[keyof typeof EVENTS];

// ============================================================
// Singleton
// ============================================================
let client: PostHog | null = null;

/**
 * Returns the initialized PostHog client (or `null` if analytics is
 * disabled). Used by the React tree to mount `<PostHogProvider>` and
 * by the screen tracker to emit `$screen` events.
 */
export function getAnalyticsClient(): PostHog | null {
  return client;
}

const PLATFORM_BY_OS: Record<PlatformOSType, 'ios' | 'android' | 'web'> = {
  ios: 'ios',
  android: 'android',
  // Everything else (RN-web, native desktop targets) is folded into
  // `web` — in practice those users hit the PWA code path instead.
  web: 'web',
  windows: 'web',
  macos: 'web',
  native: 'web',
};

/**
 * Initializes the PostHog client. Safe to call multiple times — only
 * the first call performs work. No-ops (returns `null`) if the env
 * key is missing, e.g. local dev without analytics configured.
 */
export function initAnalytics(): PostHog | null {
  if (client) return client;

  const key = process.env.EXPO_PUBLIC_POSTHOG_KEY;
  const host = process.env.EXPO_PUBLIC_POSTHOG_HOST || 'https://us.i.posthog.com';
  if (!key) return null;

  try {
    const instance = new PostHog(key, {
      host,
      // Lifecycle events ($app_opened / $app_backgrounded) give us DAU
      // and MAU for free without instrumenting every screen.
      captureAppLifecycleEvents: true,
    });
    // Super-property: stamped on every event for clean cross-platform
    // breakdown alongside the PWA (`web`/`pwa`).
    instance.register({
      platform: PLATFORM_BY_OS[Platform.OS] ?? 'web',
    });
    client = instance;
    return client;
  } catch {
    // Never block the app on analytics failure.
    return null;
  }
}

// PostHog serializes properties to JSON, so the SDK constrains them to
// JSON-safe values. Callers pass plain objects — we cast at the boundary
// rather than forcing every call site to think about JSON types.
type Properties = Record<string, unknown>;

/** Track a typed event. No-op if analytics is disabled or not yet ready. */
export function track(event: EventName, properties?: Properties): void {
  try {
    client?.capture(event, properties as Parameters<PostHog['capture']>[1]);
  } catch {
    // swallow — analytics failures never break UX
  }
}

/**
 * Associates subsequent events with `userId`. Calling with the same id
 * twice is a no-op inside the SDK.
 */
export function identify(userId: string, traits?: Properties): void {
  try {
    client?.identify(userId, traits as Parameters<PostHog['identify']>[1]);
  } catch {
    // swallow
  }
}

/**
 * Forgets the current user (call on logout) so the next session on the
 * same device doesn't get fused with the previous user's identity.
 */
export function reset(): void {
  try {
    client?.reset();
  } catch {
    // swallow
  }
}
