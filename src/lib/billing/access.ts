import type { SupabaseClient } from "@supabase/supabase-js";
import { getGroupSubscription } from "./group-subscription";

/**
 * Hard-paywall access state for a group — single source of truth for
 * "can this group use the app, or is it locked behind the Harmonia
 * paywall?". Server-side authoritative; consumed by the PWA (app) layout
 * and exposed via /api/billing/status so Native gates identically.
 *
 * Model (jun/2026): new groups (coparenting_groups.paywall_enforced=true,
 * see migration 00105) get a 30-day Harmonia trial; when it ends without a
 * paid subscription, the whole app is blocked until they subscribe.
 * Existing groups are grandfathered (paywall_enforced=false) and keep the
 * old freemium behavior (usable Free tier + per-feature gating).
 */
export interface GroupAccessState {
  /** True → block the app; render the paywall instead of the normal UI. */
  locked: boolean;
  /** Whether this group is in the enforced cohort at all. */
  paywallEnforced: boolean;
  /** Machine-readable reason, for telemetry/debugging. */
  reason:
    | "grandfathered"
    | "active"
    | "trialing"
    | "trial_grace_no_sub_row"
    | "trial_expired_or_no_entitlement"
    | "no_group";
}

/** Safety window: a brand-new enforced group with no subscription row yet
 *  is treated as in-trial (the grant may have raced/failed) for this long. */
const TRIAL_GRACE_DAYS = 30;
const TRIAL_GRACE_MS = TRIAL_GRACE_DAYS * 24 * 60 * 60 * 1000;

/**
 * Resolves whether a group is locked out by the hard paywall.
 *
 * Defensive: if the `paywall_enforced` column doesn't exist yet (e.g. a
 * staging clone without migration 00105), the read errors and we treat the
 * group as NOT enforced — never lock a user out because we couldn't read
 * the flag.
 */
export async function getGroupAccessState(
  supabase: SupabaseClient,
  groupId: string | null
): Promise<GroupAccessState> {
  if (!groupId) {
    // No group yet (e.g. mid-onboarding) — nothing to lock.
    return { locked: false, paywallEnforced: false, reason: "no_group" };
  }

  const { data: group, error } = await supabase
    .from("coparenting_groups")
    .select("paywall_enforced, created_at")
    .eq("id", groupId)
    .maybeSingle<{ paywall_enforced: boolean | null; created_at: string | null }>();

  // Column missing / read error / row missing → fail open (don't lock).
  const paywallEnforced = !error && group ? group.paywall_enforced === true : false;
  if (!paywallEnforced) {
    return { locked: false, paywallEnforced: false, reason: "grandfathered" };
  }

  const subscription = await getGroupSubscription(supabase, groupId);

  // active | trialing → full access.
  if (subscription.isActive) {
    return {
      locked: false,
      paywallEnforced: true,
      reason: subscription.isTrial ? "trialing" : "active",
    };
  }

  // Safety net: enforced group with NO subscription row at all, created
  // within the trial window — the trial grant may have raced or failed.
  // Treat as in-trial rather than insta-locking a day-one user.
  if (subscription.status === "none" && group?.created_at) {
    const ageMs = Date.now() - new Date(group.created_at).getTime();
    if (ageMs >= 0 && ageMs < TRIAL_GRACE_MS) {
      return { locked: false, paywallEnforced: true, reason: "trial_grace_no_sub_row" };
    }
  }

  // Trial expired / canceled / no entitlement → hard paywall.
  return { locked: true, paywallEnforced: true, reason: "trial_expired_or_no_entitlement" };
}
