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
  // Single-plan model (jun/2026): pagar = APP INTEIRO. O Harmonia absorveu as
  // features do antigo Premium Jurídico — qualquer tier pago (harmonia, ou
  // premium_juridico via trial/grandfathered) libera TODAS as features.
  if (tier === "harmonia" || tier === "premium_juridico") return true;
  // free (coorte grandfathered): features pagas continuam bloqueadas.
  if (PREMIUM_JURIDICO_FEATURES.has(feature) || HARMONIA_FEATURES.has(feature)) {
    return false;
  }
  // Feature não classificada = livre por padrão (nunca trava por engano).
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
