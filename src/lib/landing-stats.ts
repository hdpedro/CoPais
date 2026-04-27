import { createAdminClient } from "@/lib/supabase/admin";

export interface LandingStats {
  activeFamilies: number;
  childrenOrganized: number;
}

const FALLBACK: LandingStats = {
  activeFamilies: 0,
  childrenOrganized: 0,
};

/**
 * Counts for the landing page social-proof band. Cached at the page
 * level via Next's `revalidate = 30` — no need for an in-memory cache
 * here.
 *
 * Uses admin client because the landing is anonymous-rendered and the
 * `coparenting_groups` table has RLS that blocks anon reads.
 */
export async function getLandingStats(): Promise<LandingStats> {
  try {
    const admin = createAdminClient();

    // Run both counts in parallel. We use `head: true` to avoid pulling
    // any rows — Postgres returns the count alone.
    const [{ count: families }, { count: kids }] = await Promise.all([
      admin.from("coparenting_groups").select("*", { count: "exact", head: true }),
      admin.from("children").select("*", { count: "exact", head: true }),
    ]);

    return {
      activeFamilies: families ?? 0,
      childrenOrganized: kids ?? 0,
    };
  } catch (err) {
    console.warn("[landing-stats] Failed to read counters:", err);
    return FALLBACK;
  }
}
