import { NextRequest, NextResponse } from "next/server";
import { reportServerError } from "@/lib/error-tracking/report-server";
import { createClient } from "@/lib/supabase/server";
import { stripe } from "@/lib/stripe";

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { priceId, planId } = await req.json();
    if (!priceId || !planId) {
      return NextResponse.json({ error: "Missing priceId or planId" }, { status: 400 });
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

    // Create checkout session with 14-day trial for first-time subscribers
    const session = await stripe.checkout.sessions.create({
      customer: customerId!,
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${req.nextUrl.origin}/pricing/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${req.nextUrl.origin}/pricing/cancel`,
      metadata: {
        supabase_user_id: user.id,
        plan_id: planId,
      },
      subscription_data: {
        trial_period_days: isFirstSubscription ? 14 : undefined,
        metadata: {
          supabase_user_id: user.id,
          plan_id: planId,
        },
      },
      locale: "pt-BR",
      allow_promotion_codes: true,
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
