import type { PlanTier } from "./subscription";

const PREMIUM_FEATURES = new Set([
  "ai_assistant",
  "documents_unlimited",
  "health_full",
  "reports",
  "chat",
  "custody_full",
  "unlimited_children",
  "unlimited_users",
  "support_priority",
]);

const ELITE_FEATURES = new Set([
  "support_vip",
  "legal_backup",
  "detailed_reports",
  "export_pdf",
  "data_backup",
  "prescription_alerts",
]);

export function canAccess(feature: string, tier: PlanTier): boolean {
  // Single-plan model (jun/2026): pagar = app inteiro. "premium" (Harmonia) e
  // "elite" (trial / grandfathered) liberam TODAS as features.
  if (tier === "premium" || tier === "elite") return true;
  // free: features pagas continuam bloqueadas (coorte grandfathered).
  if (ELITE_FEATURES.has(feature) || PREMIUM_FEATURES.has(feature)) return false;
  return true;
}
