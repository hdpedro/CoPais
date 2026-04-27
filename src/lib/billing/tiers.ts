/**
 * Plan tier classification — single source of truth for mapping
 * plan_id strings to tiers. Called from feature-gate and UI code.
 */

export type PlanTier = "free" | "harmonia" | "premium_juridico";

const HARMONIA_IDS = new Set([
  "harmonia_earlybird_monthly",
  "harmonia_earlybird_annual",
  "harmonia_monthly",
  "harmonia_annual",
  // Legacy — grandfathered subs still reference these.
  "premium_monthly",
  "premium_annual",
]);

const PREMIUM_JURIDICO_IDS = new Set([
  "premium_juridico_monthly",
  "premium_juridico_annual",
  // Legacy — grandfathered Elite subs.
  "elite_monthly",
  "elite_annual",
]);

export function tierFromPlanId(planId: string | null | undefined): PlanTier {
  if (!planId) return "free";
  if (PREMIUM_JURIDICO_IDS.has(planId)) return "premium_juridico";
  if (HARMONIA_IDS.has(planId)) return "harmonia";
  return "free";
}

export function isEarlyBirdPlan(planId: string | null | undefined): boolean {
  return planId === "harmonia_earlybird_monthly" || planId === "harmonia_earlybird_annual";
}
