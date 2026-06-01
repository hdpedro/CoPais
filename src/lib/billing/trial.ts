import type { SupabaseClient } from "@supabase/supabase-js";
import { trialDaysInApp } from "./promo";

// The trial grants the TOP tier so the WHOLE app is unlocked for 30 days
// ("show the ceiling"). premium_juridico unlocks every feature in the gate;
// after the trial the user converts to the only purchasable plan, Harmonia.
// Note: premium_juridico is is_active=false (unpurchasable, migration 00106),
// but the trial is a DIRECT grant — is_active only gates checkout, not this.
export const TRIAL_PLAN_ID = "premium_juridico_monthly";
/**
 * Trial duration for the single-plan model (jun/2026): 30 days with the whole
 * app unlocked, no card. `trialDaysInApp()` returns 30 while the promo flag is
 * off (which it must be in this model).
 */
export const TRIAL_DURATION_DAYS = 30;

/**
 * Idempotently grants a 30-day full-access trial (top tier = whole app) to a
 * user's first group. Called from createGroup on signup. After expiry the
 * group is hard-locked (enforced cohort) until it subscribes to Harmonia.
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
  // Single source for trial length — 30 days in the single-plan model.
  const days = trialDaysInApp();
  const trialEnd = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);

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
