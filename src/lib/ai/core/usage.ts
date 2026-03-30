/* ------------------------------------------------------------------ */
/* AI Usage — tracks usage per user/feature for monetization           */
/* ------------------------------------------------------------------ */

import { createAdminClient } from "@/lib/supabase/admin";
import { AIFeature } from "./types";
import { AI_BILLING_ENABLED, AI_LIMITS } from "./config";

/**
 * Check if a user can use a specific AI feature.
 * When AI_BILLING_ENABLED is false, always returns true.
 * When enabled, checks usage count against plan limits.
 */
export async function canUseAI(
  userId: string,
  feature: AIFeature
): Promise<{ allowed: boolean; remaining: number; limit: number }> {
  // Billing disabled — everything is allowed
  if (!AI_BILLING_ENABLED) {
    return { allowed: true, remaining: Infinity, limit: Infinity };
  }

  const supabase = createAdminClient();

  // Get user's plan (default: free)
  const { data: profile } = await supabase
    .from("profiles")
    .select("plan")
    .eq("id", userId)
    .single();

  const plan = (profile?.plan === "premium" ? "premium" : "free") as keyof typeof AI_LIMITS;
  const limit = AI_LIMITS[plan][feature];

  // Count today's usage
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const { count } = await supabase
    .from("ai_requests")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("feature", feature)
    .gte("created_at", todayStart.toISOString());

  const used = count || 0;
  const remaining = Math.max(0, limit - used);

  return {
    allowed: remaining > 0,
    remaining,
    limit,
  };
}

/**
 * Record a usage event (for analytics and billing).
 */
export async function recordUsage(
  userId: string,
  feature: AIFeature
): Promise<void> {
  try {
    const supabase = createAdminClient();
    await supabase.from("usage_events").insert({
      user_id: userId,
      feature,
    });
  } catch (err) {
    console.error("[ai-usage] Failed to record usage:", err);
  }
}
