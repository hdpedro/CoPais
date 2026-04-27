import { createClient } from "@/lib/supabase/server";
import { getUserSubscription } from "@/lib/subscription";
import { getEarlyBirdStatus } from "@/lib/billing/early-bird";
import { EVENTS } from "@/lib/analytics";
import PricingClient from "./PricingClient";
import FeatureMatrix from "./FeatureMatrix";
import PricingFaq from "./PricingFaq";
import PageViewTracker from "@/components/analytics/PageViewTracker";

// Revalidate every 30s so the Early Bird slot counter stays fresh.
export const revalidate = 30;

export default async function PricingPage() {
  const supabase = await createClient();

  // Fetch plans
  const { data: plans } = await supabase
    .from("plans")
    .select("id, name, description, price_brl, interval, stripe_price_id, apple_product_id, features, sort_order")
    .eq("is_active", true)
    .order("sort_order");

  // Try to get user subscription (may be null if not logged in)
  let currentPlanId = "free";
  let isLoggedIn = false;
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      isLoggedIn = true;
      const sub = await getUserSubscription(supabase, user.id);
      currentPlanId = sub.planId;
    }
  } catch {
    // Not logged in — that's fine for the pricing page
  }

  const earlyBird = await getEarlyBirdStatus();

  const earlyBirdSlots = earlyBird.find((e) => e.planId === "harmonia_earlybird_monthly");

  return (
    <>
      <PageViewTracker
        event={EVENTS.PRICING_VIEWED}
        properties={{
          early_bird_remaining: earlyBirdSlots?.slotsRemaining ?? 0,
          is_logged_in: isLoggedIn,
          current_plan: currentPlanId,
        }}
      />
      <PricingClient
        plans={(plans || []).map((p) => ({
          id: p.id,
          name: p.name,
          description: p.description || "",
          priceBrl: p.price_brl,
          interval: p.interval,
          stripePriceId: p.stripe_price_id,
          appleProductId: p.apple_product_id,
          features: p.features as string[],
        }))}
        currentPlanId={currentPlanId}
        isLoggedIn={isLoggedIn}
        earlyBird={earlyBird.map((e) => ({
          planId: e.planId,
          slotsRemaining: e.slotsRemaining,
          maxSubscribers: e.maxSubscribers,
          isSoldOut: e.isSoldOut,
        }))}
      />
      <FeatureMatrix />
      <PricingFaq />
    </>
  );
}
