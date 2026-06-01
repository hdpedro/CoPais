import { describe, it, expect } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getGroupAccessState } from "@/lib/billing/access";

/**
 * Minimal Supabase stub. getGroupAccessState reads two tables:
 *   - coparenting_groups (paywall_enforced + created_at)
 *   - v_group_active_subscription (via getGroupSubscription)
 * Both use the `.from(t).select(...).eq(...).maybeSingle()` chain.
 */
function makeSupabase(opts: {
  group?: { paywall_enforced: boolean | null; created_at: string | null } | null;
  groupError?: { code?: string } | null;
  sub?: Record<string, unknown> | null;
}): SupabaseClient {
  return {
    from(table: string) {
      const result =
        table === "coparenting_groups"
          ? { data: opts.group ?? null, error: opts.groupError ?? null }
          : { data: opts.sub ?? null, error: null };
      const chain = {
        select: () => chain,
        eq: () => chain,
        maybeSingle: async () => result,
      };
      return chain;
    },
  } as unknown as SupabaseClient;
}

const isoDaysAgo = (n: number) => new Date(Date.now() - n * 24 * 60 * 60 * 1000).toISOString();
const futureIso = () => new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString();

const trialingSub = {
  subscription_id: "s1",
  payer_user_id: "u1",
  plan_id: "harmonia_monthly",
  status: "trialing",
  trial_end: futureIso(),
  current_period_end: null,
  cancel_at_period_end: false,
  payment_provider: "trial",
};

const activeSub = { ...trialingSub, status: "active", payment_provider: "stripe" };

describe("getGroupAccessState", () => {
  it("never locks a grandfathered group (paywall_enforced=false)", async () => {
    const supabase = makeSupabase({
      group: { paywall_enforced: false, created_at: isoDaysAgo(400) },
      sub: null, // no active sub, but grandfathered → still open
    });
    const state = await getGroupAccessState(supabase, "g1");
    expect(state.locked).toBe(false);
    expect(state.paywallEnforced).toBe(false);
    expect(state.reason).toBe("grandfathered");
  });

  it("keeps an enforced group open while trialing", async () => {
    const supabase = makeSupabase({
      group: { paywall_enforced: true, created_at: isoDaysAgo(10) },
      sub: trialingSub,
    });
    const state = await getGroupAccessState(supabase, "g1");
    expect(state.locked).toBe(false);
    expect(state.reason).toBe("trialing");
  });

  it("keeps an enforced group open with an active paid sub", async () => {
    const supabase = makeSupabase({
      group: { paywall_enforced: true, created_at: isoDaysAgo(60) },
      sub: activeSub,
    });
    const state = await getGroupAccessState(supabase, "g1");
    expect(state.locked).toBe(false);
    expect(state.reason).toBe("active");
  });

  it("locks an enforced group whose trial expired (no active sub, old group)", async () => {
    const supabase = makeSupabase({
      group: { paywall_enforced: true, created_at: isoDaysAgo(40) },
      sub: null, // expired trial → not in the active-subscription view
    });
    const state = await getGroupAccessState(supabase, "g1");
    expect(state.locked).toBe(true);
    expect(state.paywallEnforced).toBe(true);
    expect(state.reason).toBe("trial_expired_or_no_entitlement");
  });

  it("does NOT lock a brand-new enforced group with no sub row yet (safety net)", async () => {
    const supabase = makeSupabase({
      group: { paywall_enforced: true, created_at: isoDaysAgo(1) },
      sub: null, // trial grant may have raced — give grace
    });
    const state = await getGroupAccessState(supabase, "g1");
    expect(state.locked).toBe(false);
    expect(state.reason).toBe("trial_grace_no_sub_row");
  });

  it("never locks when there is no group (onboarding)", async () => {
    const supabase = makeSupabase({ group: null });
    const state = await getGroupAccessState(supabase, null);
    expect(state.locked).toBe(false);
    expect(state.reason).toBe("no_group");
  });

  it("fails open when the paywall_enforced column can't be read (old clone)", async () => {
    const supabase = makeSupabase({
      group: null,
      groupError: { code: "42703" }, // column does not exist
    });
    const state = await getGroupAccessState(supabase, "g1");
    expect(state.locked).toBe(false);
    expect(state.paywallEnforced).toBe(false);
  });
});
