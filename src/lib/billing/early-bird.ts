import { createAdminClient } from "@/lib/supabase/admin";

export const EARLY_BIRD_MONTHLY_PLAN = "harmonia_earlybird_monthly";
export const EARLY_BIRD_ANNUAL_PLAN = "harmonia_earlybird_annual";

export interface EarlyBirdStatus {
  planId: string;
  maxSubscribers: number;
  currentCount: number;
  slotsRemaining: number;
  isSoldOut: boolean;
}

type CachedStatus = { data: EarlyBirdStatus[]; at: number };
let cache: CachedStatus | null = null;
const CACHE_TTL_MS = 30_000; // 30 seconds — landing page freshness budget

/**
 * Returns live slots remaining per Early Bird plan, cached for 30s so the
 * landing page counter doesn't hammer Postgres. The trigger in migration
 * 00056 is still the source of truth for capacity enforcement — this
 * cache is UI-only.
 *
 * Uses admin client because the counter is exposed publicly on the
 * landing page before auth.
 */
export async function getEarlyBirdStatus(): Promise<EarlyBirdStatus[]> {
  const now = Date.now();
  if (cache && now - cache.at < CACHE_TTL_MS) {
    return cache.data;
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("v_early_bird_slots_remaining")
    .select("plan_id, max_subscribers, current_count, slots_remaining");

  if (error || !data) {
    // Fail-soft: if the view query fails, return "0 remaining" so the UI
    // degrades to a non-promotional CTA rather than showing stale numbers.
    return [];
  }

  const mapped: EarlyBirdStatus[] = data.map((row) => ({
    planId: row.plan_id,
    maxSubscribers: row.max_subscribers,
    currentCount: row.current_count,
    slotsRemaining: row.slots_remaining,
    isSoldOut: row.slots_remaining <= 0,
  }));

  cache = { data: mapped, at: now };
  return mapped;
}

/**
 * Quick-check helper for CTAs and purchase flows. Note: final enforcement
 * lives in the Postgres trigger (00056) — this is just an optimistic UI
 * check. A user who passes this check can still hit a "sold out" error
 * at INSERT time if someone else grabbed the last slot meanwhile.
 */
export async function canClaimEarlyBird(planId: string): Promise<boolean> {
  const all = await getEarlyBirdStatus();
  const entry = all.find((s) => s.planId === planId);
  return entry ? !entry.isSoldOut : false;
}

/** Test/admin helper — forces the next getEarlyBirdStatus call to hit DB. */
export function clearEarlyBirdCache(): void {
  cache = null;
}
