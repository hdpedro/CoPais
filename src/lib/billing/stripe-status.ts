/**
 * Maps Stripe subscription statuses to our internal canonical set.
 *
 * The `v_group_active_subscription` view filters by status IN ('active',
 * 'trialing', 'past_due') as access-granting. Any status outside that set
 * is treated as no-access. This mapping is conservative — only sub.status
 * values that Stripe explicitly considers paid/access-granting flow into
 * the access-granting buckets.
 *
 * Extracted from src/app/api/stripe/webhook/route.ts (2026-05-25) so it
 * can be unit-tested without spinning up the whole webhook handler.
 */

export type InternalSubscriptionStatus =
  | "active"
  | "trialing"
  | "past_due"
  | "canceled"
  | "expired"
  | "pending";

export function mapStripeStatus(status: string): InternalSubscriptionStatus {
  switch (status) {
    case "active":
      return "active";
    case "trialing":
      return "trialing";
    // grace period during retry — Stripe still considers active for access
    case "past_due":
      return "past_due";
    case "canceled":
      return "canceled";
    // Stripe gave up on retries — same access state as canceled
    case "unpaid":
      return "canceled";
    // 3DS/SCA in progress, no access yet — sub row exists but doesn't grant access
    case "incomplete":
      return "pending";
    // 3DS confirmation timed out — terminal
    case "incomplete_expired":
      return "expired";
    case "paused":
      return "expired";
    default:
      return "expired";
  }
}

/** Statuses where the user should see premium features. */
export const ACCESS_GRANTING_STATUSES: ReadonlyArray<InternalSubscriptionStatus> = [
  "active",
  "trialing",
  "past_due",
];
