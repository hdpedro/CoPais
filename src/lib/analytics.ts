/**
 * Analytics — standardized funnel events. CLIENT-SIDE ONLY.
 *
 * Why client-only: posthog-node imports `node:fs` and crashes Turbopack
 * if it's transitively pulled into a Client Component bundle. We split:
 *
 *   - `src/lib/analytics.ts` (this file) — client only, uses posthog-js
 *   - `src/lib/analytics-server.ts` — server only, uses posthog-node
 *
 * Both files share the EVENTS catalog so event names stay consistent.
 * Use `trackEvent` from "use client" components, `trackServerEvent`
 * from actions / route handlers.
 */

import { getPostHogClient } from "./posthog";

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
  CHECKOUT_CANCELED: "checkout_canceled",
  CHECKOUT_FAILED: "checkout_failed",
  COUPON_APPLIED: "coupon_applied",
  COUPON_REJECTED: "coupon_rejected",
  PAYMENT_METHOD_CHOSEN: "payment_method_chosen",
  SUBSCRIPTION_STARTED: "subscription_started",
  SUBSCRIPTION_SPLIT_ENABLED: "subscription_split_enabled",
  SUBSCRIPTION_SPLIT_DISABLED: "subscription_split_disabled",
  PAYMENT_FAILED: "payment_failed",
  // Native-only (no PWA path: IAP restore is only meaningful inside the
  // native app), but kept in the PWA catalog so the analytics-parity test
  // passes and so PostHog event-name typing stays consistent across surfaces.
  RESTORE_ATTEMPTED: "restore_attempted",
  RESTORE_SUCCEEDED: "restore_succeeded",

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

  // Collaborative Records Foundation — Fase 1 (school first, more later).
  // Drives the engagement / awareness metrics the team uses to decide
  // which modules to extend the foundation to next.
  NOTIFICATION_OPENED: "notification_opened",      // user tapped a push and landed on the record
  SCHOOL_LOG_READ: "school_log_read",              // user opened a school_log card (markAsRead)
  UNREAD_COUNT: "unread_count",                    // periodic snapshot of unread for dashboards
  URGENT_CREATED: "urgent_created",                // user created a record with priority=urgent

  // Calendar — custody integrity (Fase Calendar 1)
  // Disparado se o client receber custody_events com OVERLAP de mesmo
  // tipo no mesmo (group, child, dia). Em produção, isso só deve
  // acontecer ANTES da migration 00079 (trigger + EXCLUDE) — depois é
  // impossível inserir overlap. Vira regression alarm.
  CUSTODY_OVERLAP_DETECTED: "custody_overlap_detected",

  // Expenses — Fase 1B (edit / cancel / reopen flow)
  EXPENSE_READ: "expense_read",                    // user opened an expense card
  EXPENSE_CREATED: "expense_created",              // emitted server-side (already existed)
  EXPENSE_EDITED: "expense_edited",                // creator edited (may revert approval)
  EXPENSE_CANCELLED: "expense_cancelled",          // pending/rejected cancelled direct
  EXPENSE_CANCEL_REQUESTED: "expense_cancel_requested", // approved expense → cancel_pending
  EXPENSE_CANCEL_APPROVED: "expense_cancel_approved",   // reviewer confirmed cancel
  EXPENSE_CANCEL_REJECTED: "expense_cancel_rejected",   // reviewer refused cancel
  EXPENSE_REOPENED: "expense_reopened",            // reviewer reopened within 24h

  // Vaccine Engine — Motor de Saúde Preventiva (migration 00082)
  VACCINE_STATUS_VIEWED: "vaccine_status_viewed",          // user mounted /saude/vacinas
  VACCINE_TIMELINE_SCROLLED: "vaccine_timeline_scrolled",  // proxy de engajamento âncora
  VACCINE_MARKED_TAKEN: "vaccine_marked_taken",            // server-side, recordVaccination
  VACCINE_PENDING_DISMISSED: "vaccine_pending_dismissed",  // server-side, dismissPendingDose
  VACCINE_DUE_PUSH_SENT: "vaccine_due_push_sent",          // server-side, cron
  VACCINE_DUE_PUSH_OPENED: "vaccine_due_push_opened",      // client, deep link arrived
  VACCINE_CALENDAR_PREFERENCE_CHANGED: "vaccine_calendar_preference_changed", // server
  VACCINE_APPOINTMENT_LINKED: "vaccine_appointment_linked",// "Agendar pediatra" do pendência
  VACCINE_RECOMMENDATION_COMPUTED: "vaccine_recommendation_computed", // server (futuro telemetry)

  // Auth observability — dispara quando uma tela de auth renderiza um erro.
  // Drives "qual erro está pegando users" em PostHog (priorizar fixes
  // baseado em frequência, não em achismo).
  AUTH_ERROR_SHOWN: "auth_error_shown",
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

// SERVER-SIDE: import from "@/lib/analytics-server" — has trackServerEvent.
// Keeping client+server in the same file makes Turbopack pull `posthog-node`
// (which uses `node:fs`) into Client Component bundles, breaking the build.
