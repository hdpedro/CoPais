import type { SupabaseClient } from "@supabase/supabase-js";

export type PlanTier = "free" | "premium" | "elite";

export interface UserSubscription {
  planId: string;
  tier: PlanTier;
  status: string;
  currentPeriodEnd: string;
  cancelAtPeriodEnd: boolean;
  stripeCustomerId: string | null;
}

export async function getUserSubscription(
  supabase: SupabaseClient,
  userId: string
): Promise<UserSubscription> {
  const { data } = await supabase
    .from("subscriptions")
    .select("plan_id, status, current_period_end, cancel_at_period_end, stripe_customer_id")
    .eq("user_id", userId)
    .in("status", ["active", "trialing"])
    .single();

  if (!data) {
    return {
      planId: "free",
      tier: "free",
      status: "active",
      currentPeriodEnd: "",
      cancelAtPeriodEnd: false,
      stripeCustomerId: null,
    };
  }

  return {
    planId: data.plan_id,
    // Map new + legacy plan IDs to the legacy tiers used by canAccess().
    // premium_juridico (the 30-day full-access trial grant) → "elite" so the
    // WHOLE app is unlocked during the trial. Harmonia (the paid plan) →
    // "premium". Fixes the stale mapping that sent harmonia → "free".
    tier:
      data.plan_id.startsWith("premium_juridico") || data.plan_id.startsWith("elite")
        ? "elite"
        : data.plan_id.startsWith("harmonia") || data.plan_id.startsWith("premium")
          ? "premium"
          : "free",
    status: data.status,
    currentPeriodEnd: data.current_period_end,
    cancelAtPeriodEnd: data.cancel_at_period_end,
    stripeCustomerId: data.stripe_customer_id,
  };
}

export function isPremium(sub: UserSubscription): boolean {
  return sub.tier === "premium" && ["active", "trialing"].includes(sub.status);
}
