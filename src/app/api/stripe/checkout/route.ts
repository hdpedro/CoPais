import { NextRequest, NextResponse } from "next/server";
import { reportServerError } from "@/lib/error-tracking/report-server";
import { createClient } from "@/lib/supabase/server";
import { stripe } from "@/lib/stripe";

type PaymentMethod = "card" | "pix" | "auto";

/**
 * Creates a Stripe checkout session.
 *
 * Accepts `planId` (our internal plan ID) — the stripe_price_id is
 * resolved server-side from the plans table so the client can't smuggle
 * a different SKU. `priceId` is kept as a legacy fallback for callers
 * that still pass it directly (e.g. the old /pricing PricingClient).
 *
 * `paymentMethod` controls which Stripe payment methods are offered:
 *   - "card" (default)     — card only, standard recurring
 *   - "pix"                — PIX flow (requires Stripe PIX Automático
 *                             to be enabled on the account for recurring).
 *                             Applies the PIX discount coupon if
 *                             STRIPE_PIX_COUPON_ID is set.
 *   - "auto"               — Stripe shows both; no discount applied
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const planId: string | undefined = body.planId;
    const paymentMethod: PaymentMethod = body.paymentMethod || "card";
    const couponCode: string | undefined = body.couponCode?.trim().toUpperCase();
    const groupIdFromClient: string | undefined = body.groupId;
    let priceId: string | undefined = body.priceId;

    if (!planId) {
      return NextResponse.json({ error: "Missing planId" }, { status: 400 });
    }

    // Resolve stripe_price_id from plans table if client didn't pass one.
    // This is the preferred path — keeps pricing authoritative on the DB.
    if (!priceId) {
      const { data: plan } = await supabase
        .from("plans")
        .select("stripe_price_id, is_active")
        .eq("id", planId)
        .maybeSingle();
      if (!plan?.is_active || !plan?.stripe_price_id) {
        return NextResponse.json(
          { error: `Plano ${planId} não tem stripe_price_id configurado. Configure em Stripe e atualize a tabela plans.` },
          { status: 400 }
        );
      }
      priceId = plan.stripe_price_id;
    }

    // Check if user already has an active subscription
    const { data: existingSub } = await supabase
      .from("subscriptions")
      .select("stripe_customer_id, status")
      .eq("user_id", user.id)
      .in("status", ["active", "trialing"])
      .single();

    let customerId = existingSub?.stripe_customer_id;

    // Create or retrieve Stripe customer
    if (!customerId) {
      // Check if a Stripe customer already exists for this email
      const existingCustomers = await stripe.customers.list({
        email: user.email!,
        limit: 1,
      });

      if (existingCustomers.data.length > 0) {
        customerId = existingCustomers.data[0].id;
      } else {
        const { data: profile } = await supabase
          .from("profiles")
          .select("full_name")
          .eq("id", user.id)
          .single();

        const customer = await stripe.customers.create({
          email: user.email!,
          name: profile?.full_name || undefined,
          metadata: { supabase_user_id: user.id },
        });
        customerId = customer.id;
      }
    }

    // If user already has an active subscription, redirect to portal instead
    if (existingSub?.status === "active") {
      const portalSession = await stripe.billingPortal.sessions.create({
        customer: customerId!,
        return_url: `${req.nextUrl.origin}/pricing`,
      });
      return NextResponse.json({ url: portalSession.url });
    }

    // Check if user ever had a subscription (no trial for returning users)
    const { count: pastSubCount } = await supabase
      .from("subscriptions")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id);

    const isFirstSubscription = (pastSubCount ?? 0) === 0;

    // Payment method types per flow. Stripe requires these up front.
    //   card  → renewal handled by Stripe automatically
    //   pix   → requires PIX Automático enabled on the Stripe account
    //           (see MANUAL_OPERACIONAL.md). Falls back to card if not.
    //   auto  → both — customer picks on the hosted checkout page
    let paymentMethodTypes: Array<"card" | "pix"> = ["card"];
    if (paymentMethod === "pix") paymentMethodTypes = ["pix"];
    else if (paymentMethod === "auto") paymentMethodTypes = ["card", "pix"];

    // Resolve the discount applied to this checkout. Priority:
    //   1. Admin-created coupon (user typed a code in /assinatura)
    //   2. Auto PIX discount (user chose PIX payment method)
    // Never stack — one discount per session is cleaner for support.
    const pixCoupon = process.env.STRIPE_PIX_COUPON_ID?.trim();
    let discounts: Array<{ coupon?: string; promotion_code?: string }> | undefined;

    if (couponCode) {
      // Look up the stripe_promotion_code_id. Row is in our coupons table.
      const { data: coupon } = await supabase
        .from("v_active_coupons")
        .select("stripe_promotion_code_id, applicable_plan_ids, is_expired, redemptions_remaining")
        .eq("code", couponCode)
        .maybeSingle();

      if (!coupon) {
        return NextResponse.json({ error: `Cupom ${couponCode} não é válido.` }, { status: 400 });
      }
      if (coupon.is_expired) {
        return NextResponse.json({ error: `Cupom ${couponCode} expirou.` }, { status: 400 });
      }
      if (coupon.redemptions_remaining !== null && coupon.redemptions_remaining <= 0) {
        return NextResponse.json({ error: `Cupom ${couponCode} esgotou.` }, { status: 400 });
      }
      if (
        coupon.applicable_plan_ids &&
        coupon.applicable_plan_ids.length > 0 &&
        !coupon.applicable_plan_ids.includes(planId)
      ) {
        return NextResponse.json(
          { error: `Cupom ${couponCode} não se aplica a este plano.` },
          { status: 400 }
        );
      }
      if (coupon.stripe_promotion_code_id) {
        discounts = [{ promotion_code: coupon.stripe_promotion_code_id }];
      }
    } else if (paymentMethod === "pix" && pixCoupon) {
      discounts = [{ coupon: pixCoupon }];
    }

    // Resolve the user's primary group so the webhook can persist
    // coparenting_group_id on the subscription row. Without this, the
    // group-scoped view v_group_active_subscription excludes the row
    // and the app shows the user as Free despite paying.
    let resolvedGroupId: string | null = null;
    if (groupIdFromClient) {
      // Trust-but-verify: the client says they want this group, but we
      // must confirm membership server-side. Otherwise a user could
      // attach their paid sub to someone else's group.
      const { data: membership } = await supabase
        .from("group_members")
        .select("group_id")
        .eq("user_id", user.id)
        .eq("group_id", groupIdFromClient)
        .maybeSingle();
      if (membership) {
        resolvedGroupId = membership.group_id;
      } else {
        return NextResponse.json(
          { error: `Você não é membro do grupo ${groupIdFromClient}.` },
          { status: 403 }
        );
      }
    }
    if (!resolvedGroupId) {
      const { data: gm } = await supabase
        .from("group_members")
        .select("group_id")
        .eq("user_id", user.id)
        .order("joined_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      resolvedGroupId = gm?.group_id ?? null;
    }

    // Legacy Stripe-level trial kept as a guard for anyone who somehow
    // reaches checkout without our app-level trial. isFirstSubscription
    // counts all sub rows (including payment_provider='trial'), so a user
    // who already got the 7-day app trial lands here with count≥1 and
    // won't get a second Stripe trial.
    const session = await stripe.checkout.sessions.create({
      customer: customerId!,
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      payment_method_types: paymentMethodTypes,
      success_url: `${req.nextUrl.origin}/pricing/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${req.nextUrl.origin}/pricing/cancel`,
      metadata: {
        supabase_user_id: user.id,
        plan_id: planId,
        payment_method_hint: paymentMethod,
        ...(resolvedGroupId ? { group_id: resolvedGroupId } : {}),
        ...(couponCode ? { coupon_code: couponCode } : {}),
      },
      subscription_data: {
        trial_period_days: isFirstSubscription ? 14 : undefined,
        metadata: {
          supabase_user_id: user.id,
          plan_id: planId,
          payment_method_hint: paymentMethod,
          ...(resolvedGroupId ? { group_id: resolvedGroupId } : {}),
          ...(couponCode ? { coupon_code: couponCode } : {}),
        },
      },
      ...(discounts ? { discounts } : { allow_promotion_codes: true }),
      locale: "pt-BR",
    });

    return NextResponse.json({ url: session.url });
  } catch (error) {
    console.error("[stripe/checkout] Error:", error);
    reportServerError(error, { filePath: "src/app/api/stripe/checkout/route.ts" });
    return NextResponse.json(
      { error: "Failed to create checkout session" },
      { status: 500 }
    );
  }
}
