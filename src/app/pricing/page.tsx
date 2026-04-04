import { createClient } from "@/lib/supabase/server";
import { getUserSubscription } from "@/lib/subscription";
import PricingClient from "./PricingClient";

export default async function PricingPage() {
  const supabase = await createClient();

  // Fetch plans
  const { data: plans } = await supabase
    .from("plans")
    .select("id, name, description, price_brl, interval, stripe_price_id, features, sort_order")
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

  return (
    <PricingClient
      plans={(plans || []).map((p) => ({
        id: p.id,
        name: p.name,
        description: p.description || "",
        priceBrl: p.price_brl,
        interval: p.interval,
        stripePriceId: p.stripe_price_id,
        features: p.features as string[],
      }))}
      currentPlanId={currentPlanId}
      isLoggedIn={isLoggedIn}
    />
  );
}
