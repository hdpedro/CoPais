import type { SupabaseClient } from "@supabase/supabase-js";
import { getPlanAmountBrl } from "./split";

/**
 * Admin metrics aggregators. All queries run with the admin client
 * (bypasses RLS) so the dashboard sees the whole picture. Never expose
 * these helpers outside of /admin routes.
 *
 * Numbers are computed from the subscriptions and onboarding_quests
 * tables — no separate analytics store. For deep funnel work use PostHog.
 */

export interface AdminMetrics {
  mrr: { brl: number; activeSubs: number };
  byTier: Array<{ tier: string; activeSubs: number; mrrBrl: number }>;
  byPlanId: Array<{ planId: string; count: number; mrrBrl: number }>;
  earlyBird: {
    claimed: number;
    remaining: number;
    maxSubscribers: number;
    claimRate: number; // 0-1
  };
  trial: {
    active: number;
    expired30d: number;
    convertedTo30d: number;
    conversionRate: number; // 0-1
  };
  paymentMethod: {
    card: number;
    pix: number;
    appleIap: number;
    googleIap: number;
  };
  autoSplit: {
    enabled: number;
    eligible: number; // active subs with a co-parent in the group
    rate: number; // 0-1
  };
  quest: {
    usersWith0: number;
    usersWith1to2: number;
    usersWith3to4: number;
    usersWith5: number;
  };
  coupons: {
    activeCount: number;
    totalRedemptions: number;
  };
  churn30d: {
    canceledCount: number;
    newCount: number;
    netGrowth: number;
  };
}

const LIVE_STATUSES = ["active", "trialing", "past_due"] as const;

export async function getAdminMetrics(admin: SupabaseClient): Promise<AdminMetrics> {
  // Run all queries in parallel. Each one is individually resilient — if
  // a single section fails, the others still render.
  const [
    activeSubsRes,
    earlyBirdRes,
    trialRes,
    questRes,
    couponsRes,
    churnNewRes,
    churnCanceledRes,
    splitEligibleRes,
  ] = await Promise.allSettled([
    admin
      .from("subscriptions")
      .select("plan_id, status, payment_method_hint, auto_split")
      .in("status", ["active", "trialing"])
      .neq("payment_provider", "trial"),

    admin
      .from("v_early_bird_slots_remaining")
      .select("plan_id, max_subscribers, current_count, slots_remaining")
      .eq("plan_id", "harmonia_earlybird_monthly"),

    admin
      .from("subscriptions")
      .select("id, status, trial_end, user_id, payment_provider")
      .eq("payment_provider", "trial"),

    admin.from("onboarding_quests").select("user_id"),

    admin.from("coupons").select("id, is_active, current_redemptions"),

    admin
      .from("subscriptions")
      .select("id, created_at", { count: "exact", head: false })
      .gte("created_at", new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
      .neq("payment_provider", "trial")
      .in("status", LIVE_STATUSES),

    admin
      .from("subscriptions")
      .select("id, updated_at", { count: "exact", head: false })
      .gte("updated_at", new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
      .in("status", ["canceled", "expired"])
      .neq("payment_provider", "trial"),

    // Eligible = active non-trial subs where the paying user's group
    // has at least 2 'parent' role members. Count gives denominator
    // for the split adoption rate.
    admin
      .from("subscriptions")
      .select("id, auto_split, coparenting_group_id")
      .in("status", ["active"])
      .neq("payment_provider", "trial"),
  ]);

  // === Active subs → MRR / tier / plan / payment method / split ===
  const activeSubs = activeSubsRes.status === "fulfilled" ? activeSubsRes.value.data ?? [] : [];

  const tierBreakdown: Record<string, { activeSubs: number; mrrBrl: number }> = {};
  const planBreakdown: Record<string, { count: number; mrrBrl: number }> = {};
  const methodBreakdown = { card: 0, pix: 0, appleIap: 0, googleIap: 0 };
  let mrrTotal = 0;
  let autoSplitEnabled = 0;

  for (const sub of activeSubs) {
    const planAmount = getPlanAmountBrl(sub.plan_id) ?? 0;
    // Annual plans → divide by 12 to get monthly recurring revenue
    const monthlyEquivalent = sub.plan_id.includes("annual") ? planAmount / 12 : planAmount;
    mrrTotal += monthlyEquivalent;

    const tier = sub.plan_id.includes("juridico") || sub.plan_id.includes("elite")
      ? "premium_juridico"
      : "harmonia";
    tierBreakdown[tier] = tierBreakdown[tier] || { activeSubs: 0, mrrBrl: 0 };
    tierBreakdown[tier].activeSubs += 1;
    tierBreakdown[tier].mrrBrl += monthlyEquivalent;

    planBreakdown[sub.plan_id] = planBreakdown[sub.plan_id] || { count: 0, mrrBrl: 0 };
    planBreakdown[sub.plan_id].count += 1;
    planBreakdown[sub.plan_id].mrrBrl += monthlyEquivalent;

    const hint = sub.payment_method_hint ?? "card";
    if (hint === "pix") methodBreakdown.pix += 1;
    else if (hint === "apple_iap") methodBreakdown.appleIap += 1;
    else if (hint === "google_iap") methodBreakdown.googleIap += 1;
    else methodBreakdown.card += 1;

    if (sub.auto_split) autoSplitEnabled += 1;
  }

  // === Early Bird ===
  const eb = earlyBirdRes.status === "fulfilled" ? (earlyBirdRes.value.data?.[0] ?? null) : null;
  const earlyBird = {
    claimed: eb?.current_count ?? 0,
    remaining: eb?.slots_remaining ?? 0,
    maxSubscribers: eb?.max_subscribers ?? 1000,
    claimRate: eb?.max_subscribers ? (eb.current_count ?? 0) / eb.max_subscribers : 0,
  };

  // === Trial → paid conversion (30-day window) ===
  const trialRows = trialRes.status === "fulfilled" ? trialRes.value.data ?? [] : [];
  const now = Date.now();
  const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;
  const trialActive = trialRows.filter(
    (t) => t.status === "trialing" && t.trial_end && new Date(t.trial_end).getTime() > now
  ).length;
  const trialExpired30d = trialRows.filter(
    (t) =>
      t.status === "expired" &&
      t.trial_end &&
      new Date(t.trial_end).getTime() > thirtyDaysAgo &&
      new Date(t.trial_end).getTime() <= now
  );
  const expiredUserIds = new Set(trialExpired30d.map((t) => t.user_id));

  // Of users whose trial expired in the last 30 days, how many bought?
  let convertedTo30d = 0;
  if (expiredUserIds.size > 0) {
    const { data: paidAfterTrial } = await admin
      .from("subscriptions")
      .select("user_id")
      .in("user_id", Array.from(expiredUserIds))
      .neq("payment_provider", "trial")
      .in("status", LIVE_STATUSES);
    convertedTo30d = new Set((paidAfterTrial ?? []).map((r) => r.user_id)).size;
  }

  const trial = {
    active: trialActive,
    expired30d: trialExpired30d.length,
    convertedTo30d,
    conversionRate: trialExpired30d.length > 0 ? convertedTo30d / trialExpired30d.length : 0,
  };

  // === Quest completion distribution ===
  const questRows = questRes.status === "fulfilled" ? questRes.value.data ?? [] : [];
  const questByUser: Record<string, number> = {};
  for (const q of questRows) {
    questByUser[q.user_id] = (questByUser[q.user_id] ?? 0) + 1;
  }
  const counts = Object.values(questByUser);
  const quest = {
    usersWith0: Math.max(activeSubs.length - counts.length, 0),
    usersWith1to2: counts.filter((c) => c >= 1 && c <= 2).length,
    usersWith3to4: counts.filter((c) => c >= 3 && c <= 4).length,
    usersWith5: counts.filter((c) => c >= 5).length,
  };

  // === Coupons ===
  const couponRows = couponsRes.status === "fulfilled" ? couponsRes.value.data ?? [] : [];
  const coupons = {
    activeCount: couponRows.filter((c) => c.is_active).length,
    totalRedemptions: couponRows.reduce((sum, c) => sum + (c.current_redemptions ?? 0), 0),
  };

  // === Churn 30d ===
  const newCount = churnNewRes.status === "fulfilled" ? churnNewRes.value.count ?? 0 : 0;
  const canceledCount = churnCanceledRes.status === "fulfilled" ? churnCanceledRes.value.count ?? 0 : 0;
  const churn30d = {
    canceledCount,
    newCount,
    netGrowth: newCount - canceledCount,
  };

  // === Auto-split eligibility rate ===
  const splitRows = splitEligibleRes.status === "fulfilled" ? splitEligibleRes.value.data ?? [] : [];
  const autoSplit = {
    enabled: autoSplitEnabled,
    eligible: splitRows.length, // approximation — narrower denominator needs a join
    rate: splitRows.length > 0 ? autoSplitEnabled / splitRows.length : 0,
  };

  return {
    mrr: { brl: Math.round(mrrTotal * 100) / 100, activeSubs: activeSubs.length },
    byTier: Object.entries(tierBreakdown).map(([tier, v]) => ({ tier, ...v })),
    byPlanId: Object.entries(planBreakdown).map(([planId, v]) => ({ planId, ...v })),
    earlyBird,
    trial,
    paymentMethod: methodBreakdown,
    autoSplit,
    quest,
    coupons,
    churn30d,
  };
}
