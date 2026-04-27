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
 * Returns the user's primary group — the oldest group they belong to.
 * Matches the heuristic used in the 00054 backfill so billing context is
 * consistent with migrated data.
 */
export async function getPrimaryGroupId(
  supabase: SupabaseClient,
  userId: string
): Promise<string | null> {
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
