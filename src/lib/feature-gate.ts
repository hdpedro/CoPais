import type { PlanTier } from "./subscription";

const PREMIUM_FEATURES = new Set([
  "ai_assistant",
  "documents_unlimited",
  "health_full",
  "reports",
  "export_pdf",
]);

export function canAccess(feature: string, tier: PlanTier): boolean {
  if (!PREMIUM_FEATURES.has(feature)) return true;
  return tier === "premium";
}
