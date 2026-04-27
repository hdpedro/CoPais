import type { SupabaseClient } from "@supabase/supabase-js";

export const TRIAL_PLAN_ID = "premium_juridico_monthly";
export const TRIAL_DURATION_DAYS = 7;

/**
 * Idempotently grants a 7-day Premium Jurídico trial to a user's first
 * group. Called from createGroup on signup.
 *
 * Business rules:
 *   - One trial per user, EVER — even across multiple groups. Re-joining
 *     or leaving and rejoining doesn't reset the clock.
 *   - We use payment_provider='trial' to distinguish from real IAP/Stripe
 *     subs; the trial-expiry cron only acts on this provider.
 *   - If the user already has ANY subscription row (trial, active,
 *     canceled, expired — anything), we skip. A past trial counts.
 *
 * This function assumes the caller holds RLS permissions for both the
 * subscriptions and group rows — typically it runs inside the server
 * action that just created the group.
 */
export async function grantTrialIfEligible(
  supabase: SupabaseClient,
  userId: string,
  groupId: string
): Promise<{ granted: boolean; reason?: string }> {
  // Check existing subs — any row disqualifies (past trial, canceled,
  // expired all count as "already had a chance").
  const { data: existing } = await supabase
    .from("subscriptions")
    .select("id")
    .eq("user_id", userId)
    .limit(1);

  if (existing && existing.length > 0) {
    return { granted: false, reason: "user_had_prior_subscription" };
  }

  const now = new Date();
  const trialEnd = new Date(now.getTime() + TRIAL_DURATION_DAYS * 24 * 60 * 60 * 1000);

  const { error } = await supabase.from("subscriptions").insert({
    user_id: userId,
    coparenting_group_id: groupId,
    plan_id: TRIAL_PLAN_ID,
    status: "trialing",
    payment_provider: "trial",
    current_period_start: now.toISOString(),
    current_period_end: trialEnd.toISOString(),
    trial_end: trialEnd.toISOString(),
    cancel_at_period_end: false,
  });

  if (error) {
    // Non-fatal — group creation should succeed even if trial grant
    // fails (e.g. unique constraint race). The user can still upgrade
    // manually. Logged upstream.
    return { granted: false, reason: error.message };
  }

  return { granted: true };
}
