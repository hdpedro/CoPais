import type { SupabaseClient } from "@supabase/supabase-js";
import { tierFromPlanId, type PlanTier } from "./tiers";

export interface GroupSubscription {
  groupId: string;
  subscriptionId: string;
  payerUserId: string;
  planId: string;
  tier: PlanTier;
  status: string;
  trialEnd: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  paymentProvider: string;
  /** True if subscription is currently usable (active or trialing). */
  isActive: boolean;
  /** True if the status is 'trialing' — used to show "X days left" UI. */
  isTrial: boolean;
}

export const FREE_SUBSCRIPTION: GroupSubscription = {
  groupId: "",
  subscriptionId: "",
  payerUserId: "",
  planId: "free",
  tier: "free",
  status: "none",
  trialEnd: null,
  currentPeriodEnd: null,
  cancelAtPeriodEnd: false,
  paymentProvider: "none",
  isActive: false,
  isTrial: false,
};

/**
 * Resolves the currently effective subscription for a group.
 * Returns a "free" placeholder if the group has no active or trialing sub.
 *
 * Uses the v_group_active_subscription view which picks the best row when
 * multiple exist (active > trialing > past_due), scoped by
 * coparenting_group_id. This is the server-side source of truth —
 * clients (PWA / iOS / Android) must NOT infer tier from client state.
 */
export async function getGroupSubscription(
  supabase: SupabaseClient,
  groupId: string
): Promise<GroupSubscription> {
  const { data } = await supabase
    .from("v_group_active_subscription")
    .select("subscription_id, payer_user_id, plan_id, status, trial_end, current_period_end, cancel_at_period_end, payment_provider")
    .eq("group_id", groupId)
    .maybeSingle();

  if (!data) {
    return { ...FREE_SUBSCRIPTION, groupId };
  }

  return {
    groupId,
    subscriptionId: data.subscription_id,
    payerUserId: data.payer_user_id,
    planId: data.plan_id,
    tier: tierFromPlanId(data.plan_id),
    status: data.status,
    trialEnd: data.trial_end,
    currentPeriodEnd: data.current_period_end,
    cancelAtPeriodEnd: data.cancel_at_period_end,
    paymentProvider: data.payment_provider,
    isActive: data.status === "active" || data.status === "trialing",
    isTrial: data.status === "trialing",
  };
}

/**
 * Returns the user's primary group with this precedence:
 *
 *   1. `profiles.last_active_group_id` (migration 00097) — the group the user
 *      most recently navigated into. Best signal for "which group do they
 *      mean right now" when they're a member of more than one.
 *   2. Oldest membership by `joined_at` (legacy heuristic) — fallback when
 *      column is null (backfill missed a row, or migration not applied yet).
 *
 * Defensive: if reading the `last_active_group_id` column errors (e.g.
 * column doesn't exist on a staging clone), we silently fall through to
 * the legacy heuristic — same code path as before migration 00097.
 */
export async function getPrimaryGroupId(
  supabase: SupabaseClient,
  userId: string
): Promise<string | null> {
  // Prefer last_active_group_id. PG error 42703 (column doesn't exist) →
  // treat as null and fall through to the legacy heuristic.
  try {
    type ProfileRow = { last_active_group_id?: string | null };
    const { data: profileRow, error } = await supabase
      .from("profiles")
      .select("last_active_group_id")
      .eq("id", userId)
      .maybeSingle<ProfileRow>();
    if (!error && profileRow?.last_active_group_id) {
      // Verify the user is still a member of that group — they may have
      // been removed since last login. Cheap query, single row.
      const { data: membership } = await supabase
        .from("group_members")
        .select("group_id")
        .eq("user_id", userId)
        .eq("group_id", profileRow.last_active_group_id)
        .maybeSingle();
      if (membership?.group_id) return membership.group_id;
    }
  } catch {
    // Column doesn't exist or RLS edge — fall through.
  }

  // Legacy fallback — oldest membership.
  const { data } = await supabase
    .from("group_members")
    .select("group_id")
    .eq("user_id", userId)
    .order("joined_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  return data?.group_id ?? null;
}

/**
 * Days remaining in a trial — negative if expired, 0 if today is the
 * expiry day. Used for banner copy ("X days left").
 */
export function trialDaysRemaining(trialEnd: string | null): number {
  if (!trialEnd) return 0;
  const endMs = new Date(trialEnd).getTime();
  const nowMs = Date.now();
  return Math.ceil((endMs - nowMs) / (1000 * 60 * 60 * 24));
}
