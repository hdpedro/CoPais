import type { PlanTier } from "./tiers";

/**
 * Feature gating by tier — single source of truth for "which features
 * does tier X unlock". Replaces the legacy free/premium/elite model with
 * free/harmonia/premium_juridico.
 *
 * Legacy tier names still map through via tierFromPlanId so old sub
 * rows work without mass migration.
 */

const HARMONIA_FEATURES = new Set([
  "ai_assistant",
  "chat",
  "custody_full",
  "documents_unlimited",
  "health_full",
  "reports",
  "unlimited_children",
  "unlimited_users",
  "support_priority",
  "calendar_full",
  "expenses_full",
  "ocr_prescription",
  "clinical_inference",
]);

const PREMIUM_JURIDICO_FEATURES = new Set([
  "support_vip",
  "legal_backup",
  "detailed_reports",
  "export_pdf",
  "data_backup",
  "prescription_alerts",
  "audit_trail",
]);

export function canAccessFeature(feature: string, tier: PlanTier): boolean {
  if (PREMIUM_JURIDICO_FEATURES.has(feature)) {
    return tier === "premium_juridico";
  }
  if (HARMONIA_FEATURES.has(feature)) {
    return tier === "harmonia" || tier === "premium_juridico";
  }
  // Unknown feature = free-by-default so we never accidentally lock a
  // feature the grader has not classified.
  return true;
}

/**
 * Convenience wrapper — "is the group allowed to use this feature?"
 * Takes the GroupSubscription shape directly so callers don't have to
 * juggle tier booleans.
 */
export function isPremiumFeature(
  feature: string,
  subscription: { tier: PlanTier; isActive: boolean }
): boolean {
  if (!subscription.isActive) return false;
  return canAccessFeature(feature, subscription.tier);
}
