"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { stripe } from "@/lib/stripe";
import { assertAdmin } from "@/lib/admin";

/**
 * Admin actions for coupons. Only callable by users in ADMIN_EMAILS.
 *
 * Every mutation here syncs the internal `coupons` table with Stripe
 * so the discount math is always enforced by Stripe at checkout —
 * we never hand-roll prices.
 *
 * Flow on create:
 *   1. POST stripe.coupons.create (the discount math)
 *   2. POST stripe.promotionCodes.create (the user-facing code)
 *   3. INSERT row in `coupons` with both Stripe IDs
 */

interface CreateCouponInput {
  code: string;
  description?: string;
  amountOffBrl?: number; // R$ * 100 — 500 = R$5,00
  percentOff?: number; // 0-100
  duration: "forever" | "once" | "repeating";
  durationMonths?: number;
  maxRedemptions?: number;
  expiresAt?: string; // ISO
  applicablePlanIds?: string[];
  notes?: string;
}

export async function createCoupon(input: CreateCouponInput) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  assertAdmin({ id: user?.id ?? "", email: user?.email ?? null });

  // Validate input. Stripe enforces similar rules but we fail-fast for better UX.
  if (!input.code || !/^[A-Z0-9_-]{3,32}$/.test(input.code)) {
    return { error: "Código deve ter 3-32 caracteres: A-Z, 0-9, _ ou -" };
  }
  if ((input.amountOffBrl == null) === (input.percentOff == null)) {
    return { error: "Informe EXATAMENTE um de: amountOffBrl OU percentOff" };
  }
  if (input.duration === "repeating" && !input.durationMonths) {
    return { error: "durationMonths obrigatório quando duration=repeating" };
  }

  const admin = createAdminClient();

  // 1. Create Stripe coupon (the discount math)
  const stripeCoupon = await stripe.coupons.create({
    id: `kindar_${input.code.toLowerCase()}`,
    name: input.description || input.code,
    amount_off: input.amountOffBrl ?? undefined,
    currency: input.amountOffBrl ? "brl" : undefined,
    percent_off: input.percentOff ?? undefined,
    duration: input.duration,
    duration_in_months: input.duration === "repeating" ? input.durationMonths : undefined,
    max_redemptions: input.maxRedemptions ?? undefined,
    redeem_by: input.expiresAt ? Math.floor(new Date(input.expiresAt).getTime() / 1000) : undefined,
    metadata: {
      created_by: user!.id,
      ...(input.notes ? { notes: input.notes.slice(0, 500) } : {}),
    },
  });

  // 2. Create promotion code (what the user types at checkout).
  // Stripe API v22 wraps the coupon inside a discriminated union.
  const promotionCode = await stripe.promotionCodes.create({
    promotion: { type: "coupon", coupon: stripeCoupon.id },
    code: input.code,
    active: true,
    expires_at: input.expiresAt
      ? Math.floor(new Date(input.expiresAt).getTime() / 1000)
      : undefined,
    max_redemptions: input.maxRedemptions ?? undefined,
  });

  // 3. Insert in our table for analytics + listing
  const { error } = await admin.from("coupons").insert({
    code: input.code,
    description: input.description ?? null,
    amount_off_brl: input.amountOffBrl ?? null,
    percent_off: input.percentOff ?? null,
    duration: input.duration,
    duration_months: input.duration === "repeating" ? input.durationMonths : null,
    max_redemptions: input.maxRedemptions ?? null,
    expires_at: input.expiresAt ?? null,
    applicable_plan_ids: input.applicablePlanIds ?? [],
    stripe_coupon_id: stripeCoupon.id,
    stripe_promotion_code_id: promotionCode.id,
    created_by: user!.id,
    notes: input.notes ?? null,
  });

  if (error) {
    // Stripe succeeded but DB failed. Try to clean up Stripe to avoid orphans.
    await stripe.promotionCodes.update(promotionCode.id, { active: false }).catch(() => {});
    await stripe.coupons.del(stripeCoupon.id).catch(() => {});
    return { error: "DB insert failed: " + error.message };
  }

  revalidatePath("/admin/coupons");
  return { success: true };
}

export async function deactivateCoupon(couponId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  assertAdmin({ id: user?.id ?? "", email: user?.email ?? null });

  const admin = createAdminClient();

  const { data: coupon } = await admin
    .from("coupons")
    .select("stripe_promotion_code_id")
    .eq("id", couponId)
    .maybeSingle();

  // Deactivate Stripe promotion code (can't delete — only deactivate)
  if (coupon?.stripe_promotion_code_id) {
    try {
      await stripe.promotionCodes.update(coupon.stripe_promotion_code_id, { active: false });
    } catch (err) {
      console.warn("[admin-coupons] Failed to deactivate promo code on Stripe:", err);
      // Continue — at least mark it inactive in our DB so it won't apply.
    }
  }

  const { error } = await admin
    .from("coupons")
    .update({ is_active: false })
    .eq("id", couponId);

  if (error) return { error: error.message };

  revalidatePath("/admin/coupons");
  return { success: true };
}
