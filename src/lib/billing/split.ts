import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Price table for split calculations. Stripe webhook, RevenueCat webhook
 * and the on-demand "split now" action all read from this same place to
 * avoid drift between what the user is charged and what the co-responsible
 * sees in the Despesas module.
 *
 * Amounts are in BRL, whole units (not cents), matching expenses.amount
 * NUMERIC(10,2) column.
 */
const PLAN_AMOUNTS: Record<string, number> = {
  harmonia_earlybird_monthly: 19.9,
  harmonia_earlybird_annual: 191.0,
  harmonia_monthly: 24.9,
  harmonia_annual: 239.0,
  premium_juridico_monthly: 39.9,
  premium_juridico_annual: 383.0,
  // Legacy — grandfathered subs keep splitting at their original amount.
  premium_monthly: 29.9,
  premium_annual: 297.0,
  elite_monthly: 49.9,
  elite_annual: 497.0,
};

export function getPlanAmountBrl(planId: string): number | null {
  return PLAN_AMOUNTS[planId] ?? null;
}

/**
 * Computes the co-responsible's share for a given plan + ratio.
 * Rounded to 2 decimals. Used when inserting the expense row.
 */
export function computeCoShareAmount(planId: string, coSharePercent: number): number | null {
  const total = PLAN_AMOUNTS[planId];
  if (total == null) return null;
  return Math.round((total * coSharePercent) / 100 * 100) / 100;
}

/**
 * Builds the split_ratio JSONB that expenses.split_ratio expects.
 * Shape: { [userId]: percent } where values sum to 100.
 */
export function buildSplitRatio(
  payerUserId: string,
  coUserId: string,
  coSharePercent: number
): Record<string, number> {
  return {
    [payerUserId]: 100 - coSharePercent,
    [coUserId]: coSharePercent,
  };
}

/**
 * Creates one split expense for a given subscription period. Idempotent
 * via the (source_subscription_id, source_period_start) unique index —
 * re-running with the same inputs returns the existing row.
 *
 * Called from:
 *   - enableSubscriptionSplit action (first time the payer opts in)
 *   - Stripe webhook on invoice.payment_succeeded (monthly renewals)
 *   - RevenueCat webhook on RENEWAL event (iOS/Android renewals)
 *
 * Uses the admin client so it works from webhooks where there's no
 * user session. Caller is responsible for passing a valid admin client.
 */
export async function createSplitExpenseForPeriod(
  admin: SupabaseClient,
  params: {
    subscriptionId: string;
    groupId: string;
    payerUserId: string;
    coUserId: string;
    coSharePercent: number;
    planId: string;
    periodStart: string; // ISO date YYYY-MM-DD
    expenseDate?: string; // defaults to periodStart
  }
): Promise<{ created: boolean; expenseId?: string; error?: string }> {
  const totalAmount = getPlanAmountBrl(params.planId);
  if (totalAmount == null) {
    return { created: false, error: `unknown_plan_id:${params.planId}` };
  }

  const splitRatio = buildSplitRatio(
    params.payerUserId,
    params.coUserId,
    params.coSharePercent
  );

  // Check for existing row first so we don't spam "already exists" errors.
  const { data: existing } = await admin
    .from("expenses")
    .select("id")
    .eq("source_subscription_id", params.subscriptionId)
    .eq("source_period_start", params.periodStart)
    .maybeSingle();

  if (existing) {
    return { created: false, expenseId: existing.id };
  }

  const { data, error } = await admin
    .from("expenses")
    .insert({
      group_id: params.groupId,
      child_id: null,
      category: "subscription",
      description: `Assinatura Kindar — ${params.periodStart.slice(0, 7)}`,
      amount: totalAmount,
      currency: "BRL",
      paid_by: params.payerUserId,
      split_ratio: splitRatio,
      status: "approved", // subscription expenses auto-approve (real charge happened)
      approved_by: params.payerUserId,
      approved_at: new Date().toISOString(),
      expense_date: params.expenseDate ?? params.periodStart,
      source_subscription_id: params.subscriptionId,
      source_period_start: params.periodStart,
    })
    .select("id")
    .single();

  if (error) {
    // 23505 = race between two concurrent webhooks; treat as success.
    if (error.code === "23505") {
      const { data: raced } = await admin
        .from("expenses")
        .select("id")
        .eq("source_subscription_id", params.subscriptionId)
        .eq("source_period_start", params.periodStart)
        .maybeSingle();
      return { created: false, expenseId: raced?.id };
    }
    return { created: false, error: error.message };
  }

  return { created: true, expenseId: data.id };
}
