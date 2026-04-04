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
]);

export function canAccess(feature: string, tier: PlanTier): boolean {
  if (ELITE_FEATURES.has(feature)) {
    return tier === "elite";
  }
  if (PREMIUM_FEATURES.has(feature)) {
    return tier === "premium" || tier === "elite";
  }
  return true;
}
