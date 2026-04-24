import { NextRequest, NextResponse } from "next/server";
import { reportServerError } from "@/lib/error-tracking/report-server";
import { stripe } from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase/admin";
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

        // Insert the new subscription
        await supabase.from("subscriptions").insert({
          user_id: userId,
          plan_id: planId,
          status: sub.status === "active" ? "active" : "trialing",
          payment_provider: "stripe",
          stripe_customer_id: session.customer as string,
          stripe_subscription_id: subscriptionId,
          current_period_start: new Date(periodStart * 1000).toISOString(),
          current_period_end: new Date(periodEnd * 1000).toISOString(),
          cancel_at_period_end: sub.cancel_at_period_end,
          trial_end: sub.trial_end ? new Date(sub.trial_end * 1000).toISOString() : null,
        });

        console.log(`[stripe/webhook] Subscription created for user ${userId}, plan ${planId}`);
        break;
      }

      case "customer.subscription.updated": {
        const sub = event.data.object as Stripe.Subscription;
        const userId = sub.metadata?.supabase_user_id;
        if (!userId) break;

        const planId = sub.metadata?.plan_id || "premium_monthly";
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
