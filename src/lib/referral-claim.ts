import type { SupabaseClient } from "@supabase/supabase-js";
import { stripe } from "@/lib/stripe";

/**
 * Handle the referral reward when a referred user lands their first
 * paid subscription. Called from the Stripe webhook (checkout.session.
 * completed) AFTER the new subscription row is inserted.
 *
 * Flow:
 *   1. Check if this user was referred (profiles.referred_by not null)
 *   2. Check if this is actually their FIRST paid sub (not a re-sub after cancel)
 *   3. Find the referrer profile by referral_code
 *   4. Create 2 Stripe coupons (one-time, 100% off for 1 month each)
 *   5. Apply to referrer's Stripe customer (via credit balance)
 *   6. Mark the referral_rewards row so we never double-credit
 */
export async function claimReferralReward(
  admin: SupabaseClient,
  referredUserId: string,
  referredSubscriptionId: string
): Promise<{ claimed: boolean; reason?: string }> {
  // 1. Does this user have a referrer?
  const { data: referredProfile } = await admin
    .from("profiles")
    .select("id, referred_by, full_name")
    .eq("id", referredUserId)
    .maybeSingle();

  if (!referredProfile?.referred_by) {
    return { claimed: false, reason: "no_referrer" };
  }

  // 2. Is this actually the first paid sub? Check for any prior non-trial sub.
  const { count: priorPaidCount } = await admin
    .from("subscriptions")
    .select("id", { count: "exact", head: true })
    .eq("user_id", referredUserId)
    .neq("payment_provider", "trial")
    .neq("id", referredSubscriptionId);

  if ((priorPaidCount ?? 0) > 0) {
    return { claimed: false, reason: "not_first_paid_sub" };
  }

  // 3. Idempotency: already rewarded for this sub?
  const { data: existingReward } = await admin
    .from("referral_rewards")
    .select("id")
    .eq("referred_subscription_id", referredSubscriptionId)
    .maybeSingle();

  if (existingReward) {
    return { claimed: false, reason: "already_rewarded" };
  }

  // 4. Find the referrer
  const { data: referrerProfile } = await admin
    .from("profiles")
    .select("id, referral_code")
    .eq("referral_code", referredProfile.referred_by)
    .maybeSingle();

  if (!referrerProfile) {
    return { claimed: false, reason: "referrer_not_found" };
  }

  // 5. Create two one-time 100% coupons on Stripe (valid for 1 billing cycle)
  const safeCode = referrerProfile.referral_code?.toLowerCase() ?? "unknown";
  const nonce = Date.now().toString(36);

  let referrerCouponId: string | null = null;
  let referredCouponId: string | null = null;

  try {
    const referrerCoupon = await stripe.coupons.create({
      id: `ref_${safeCode}_referrer_${nonce}`,
      name: "1 mês grátis — Kindar indica",
      percent_off: 100,
      duration: "once",
      max_redemptions: 1,
      metadata: {
        kind: "referral_reward",
        referrer_user_id: referrerProfile.id,
        referred_user_id: referredUserId,
        subscription_id: referredSubscriptionId,
      },
    });
    referrerCouponId = referrerCoupon.id;

    const referredCoupon = await stripe.coupons.create({
      id: `ref_${safeCode}_referred_${nonce}`,
      name: "1 mês grátis — bem-vindo ao Kindar",
      percent_off: 100,
      duration: "once",
      max_redemptions: 1,
      metadata: {
        kind: "referral_reward",
        referrer_user_id: referrerProfile.id,
        referred_user_id: referredUserId,
        subscription_id: referredSubscriptionId,
      },
    });
    referredCouponId = referredCoupon.id;

    // Apply the referrer coupon to their next invoice if they have an
    // active Stripe subscription. If they pay via Apple/Google we mark
    // the reward as issued but they'll need to claim it manually next
    // time they interact with Stripe — trade-off of multi-provider.
    const { data: referrerSub } = await admin
      .from("subscriptions")
      .select("stripe_subscription_id, stripe_customer_id")
      .eq("user_id", referrerProfile.id)
      .eq("payment_provider", "stripe")
      .in("status", ["active", "trialing", "past_due"])
      .maybeSingle();

    if (referrerSub?.stripe_subscription_id) {
      await stripe.subscriptions.update(referrerSub.stripe_subscription_id, {
        discounts: [{ coupon: referrerCouponId }],
      });
    }
  } catch (err) {
    // Roll back whatever we created on Stripe so we don't leave dangling coupons.
    if (referrerCouponId) await stripe.coupons.del(referrerCouponId).catch(() => {});
    if (referredCouponId) await stripe.coupons.del(referredCouponId).catch(() => {});
    return { claimed: false, reason: `stripe_error:${(err as Error).message}` };
  }

  // 6. Record the reward — unique index on referred_subscription_id prevents
  // double-writes if the webhook retries.
  const { error: insertErr } = await admin.from("referral_rewards").insert({
    referrer_user_id: referrerProfile.id,
    referred_user_id: referredUserId,
    referred_subscription_id: referredSubscriptionId,
    referrer_coupon_id: referrerCouponId,
    referred_coupon_id: referredCouponId,
    reward_type: "one_month_free",
  });

  if (insertErr) {
    // Unique-violation = another concurrent webhook beat us. Not an error.
    if (insertErr.code !== "23505") {
      return { claimed: false, reason: `db_error:${insertErr.message}` };
    }
  }

  return { claimed: true };
}
