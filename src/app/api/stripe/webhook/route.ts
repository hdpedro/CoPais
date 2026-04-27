import { NextRequest, NextResponse } from "next/server";
import { reportServerError } from "@/lib/error-tracking/report-server";
import { stripe } from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import { createSplitExpenseForPeriod } from "@/lib/billing/split";
import { sendSubscriptionWelcomeEmail } from "@/lib/emails/subscription-welcome";
import { claimReferralReward } from "@/lib/referral-claim";
import type Stripe from "stripe";

export async function POST(req: NextRequest) {
  const body = await req.text();
  const signature = req.headers.get("stripe-signature");

  if (!signature || !process.env.STRIPE_WEBHOOK_SECRET) {
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error("[stripe/webhook] Signature verification failed:", err);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  const supabase = createAdminClient();

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.mode !== "subscription") break;

        const userId = session.metadata?.supabase_user_id;
        const planId = session.metadata?.plan_id;
        if (!userId || !planId) break;

        const subscriptionId = session.subscription as string;
        const subResponse = await stripe.subscriptions.retrieve(subscriptionId);
        const sub = subResponse as unknown as Stripe.Subscription;
        const periodStart = (sub as unknown as { current_period_start: number }).current_period_start;
        const periodEnd = (sub as unknown as { current_period_end: number }).current_period_end;

        // Expire only existing Stripe-provider subs for this user. CRITICAL:
        // scope by payment_provider="stripe" so an active Apple IAP sub is
        // NOT overwritten when the user starts/renews a subscription on web.
        // /api/iap/verify already filters symmetrically by payment_provider="apple".
        await supabase
          .from("subscriptions")
          .update({ status: "expired", updated_at: new Date().toISOString() })
          .eq("user_id", userId)
          .eq("payment_provider", "stripe")
          .in("status", ["active", "trialing", "past_due"]);

        // Insert the new subscription. payment_method_hint comes from
        // our checkout metadata so we can display "you're on PIX — saving R$5"
        // on the assinatura page without another Stripe round-trip.
        const paymentMethodHint = session.metadata?.payment_method_hint || "card";
        const couponCode = session.metadata?.coupon_code || null;
        await supabase.from("subscriptions").insert({
          user_id: userId,
          plan_id: planId,
          status: sub.status === "active" ? "active" : "trialing",
          payment_provider: "stripe",
          payment_method_hint: paymentMethodHint,
          coupon_code: couponCode,
          stripe_customer_id: session.customer as string,
          stripe_subscription_id: subscriptionId,
          current_period_start: new Date(periodStart * 1000).toISOString(),
          current_period_end: new Date(periodEnd * 1000).toISOString(),
          cancel_at_period_end: sub.cancel_at_period_end,
          trial_end: sub.trial_end ? new Date(sub.trial_end * 1000).toISOString() : null,
        });

        // Increment redemption counter on the internal coupons row.
        // Best-effort — if it fails, Stripe still has the true count via
        // promotion_codes.times_redeemed and we can reconcile later.
        if (couponCode) {
          const { data: existing } = await supabase
            .from("coupons")
            .select("id, current_redemptions")
            .eq("code", couponCode)
            .maybeSingle();
          if (existing) {
            await supabase
              .from("coupons")
              .update({ current_redemptions: (existing.current_redemptions ?? 0) + 1 })
              .eq("id", existing.id);
          }
        }

        // Welcome email (non-fatal — swallows its own errors)
        const { data: profile } = await supabase
          .from("profiles")
          .select("email, full_name")
          .eq("id", userId)
          .maybeSingle();
        if (profile?.email) {
          await sendSubscriptionWelcomeEmail(profile.email, profile.full_name, planId);
        }

        // Referral reward — if this user was referred and this is their
        // first paid sub, credit 1 month free to both parties. Runs after
        // the sub row exists so we can look it up.
        const { data: newSub } = await supabase
          .from("subscriptions")
          .select("id")
          .eq("stripe_subscription_id", subscriptionId)
          .maybeSingle();
        if (newSub) {
          const reward = await claimReferralReward(supabase, userId, newSub.id);
          if (reward.claimed) {
            console.log(`[stripe/webhook] Referral reward claimed for user ${userId}`);
          }
        }

        console.log(`[stripe/webhook] Subscription created for user ${userId}, plan ${planId}`);
        break;
      }

      case "customer.subscription.updated": {
        const sub = event.data.object as Stripe.Subscription;
        const userId = sub.metadata?.supabase_user_id;
        if (!userId) break;

        const planId = sub.metadata?.plan_id || "harmonia_monthly";
        const periodStart = (sub as unknown as { current_period_start: number }).current_period_start;
        const periodEnd = (sub as unknown as { current_period_end: number }).current_period_end;

        await supabase
          .from("subscriptions")
          .update({
            plan_id: planId,
            status: mapStripeStatus(sub.status),
            current_period_start: new Date(periodStart * 1000).toISOString(),
            current_period_end: new Date(periodEnd * 1000).toISOString(),
            cancel_at_period_end: sub.cancel_at_period_end,
            updated_at: new Date().toISOString(),
          })
          .eq("stripe_subscription_id", sub.id);

        console.log(`[stripe/webhook] Subscription updated for user ${userId}: ${sub.status}`);
        break;
      }

      case "invoice.payment_succeeded": {
        // Only trigger the split on renewals (billing_reason='subscription_cycle').
        // The first payment goes through checkout.session.completed which
        // also fires this event with billing_reason='subscription_create' —
        // we skip that to avoid a duplicate expense on day 1 (the enable
        // action already created one). Idempotency guard in createSplit-
        // ExpenseForPeriod protects against double-fire anyway.
        const invoice = event.data.object as Stripe.Invoice;
        const billingReason = (invoice as unknown as { billing_reason: string }).billing_reason;
        if (billingReason !== "subscription_cycle") break;

        const subscriptionId = (invoice as unknown as { subscription: string | null }).subscription;
        if (!subscriptionId) break;

        // Look up the subscription row in our DB to see if auto_split is on
        // and to resolve the group / counterparty / plan.
        const { data: dbSub } = await supabase
          .from("subscriptions")
          .select("id, coparenting_group_id, user_id, plan_id, auto_split, auto_split_co_user_id, auto_split_co_share")
          .eq("stripe_subscription_id", subscriptionId)
          .maybeSingle();

        if (!dbSub || !dbSub.auto_split || !dbSub.auto_split_co_user_id || !dbSub.auto_split_co_share || !dbSub.coparenting_group_id) {
          break;
        }

        const periodStartUnix = (invoice as unknown as { period_start: number }).period_start;
        const periodStart = new Date(periodStartUnix * 1000).toISOString().slice(0, 10);

        const result = await createSplitExpenseForPeriod(supabase, {
          subscriptionId: dbSub.id,
          groupId: dbSub.coparenting_group_id,
          payerUserId: dbSub.user_id,
          coUserId: dbSub.auto_split_co_user_id,
          coSharePercent: dbSub.auto_split_co_share,
          planId: dbSub.plan_id,
          periodStart,
        });

        console.log(
          `[stripe/webhook] Renewal split for sub ${dbSub.id}: ${
            result.created ? "created" : "existed"
          } expense ${result.expenseId ?? ""}`
        );
        break;
      }

      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;

        await supabase
          .from("subscriptions")
          .update({
            status: "canceled",
            updated_at: new Date().toISOString(),
          })
          .eq("stripe_subscription_id", sub.id);

        console.log(`[stripe/webhook] Subscription canceled: ${sub.id}`);
        break;
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        const subscriptionId = (invoice as unknown as { subscription: string | null }).subscription;
        if (!subscriptionId) break;

        await supabase
          .from("subscriptions")
          .update({
            status: "past_due",
            updated_at: new Date().toISOString(),
          })
          .eq("stripe_subscription_id", subscriptionId);

        console.log(`[stripe/webhook] Payment failed for subscription ${subscriptionId}`);
        break;
      }
    }
  } catch (error) {
    console.error(`[stripe/webhook] Error handling ${event.type}:`, error);
    reportServerError(error, { filePath: "src/app/api/stripe/webhook/route.ts", severity: "critical" });
    return NextResponse.json({ error: "Webhook handler failed" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}

function mapStripeStatus(status: string): string {
  switch (status) {
    case "active": return "active";
    case "trialing": return "trialing";
    case "past_due": return "past_due";
    case "canceled":
    case "unpaid": return "canceled";
    default: return "expired";
  }
}
