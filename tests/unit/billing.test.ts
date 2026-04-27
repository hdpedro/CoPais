import { describe, it, expect } from "vitest";
import { tierFromPlanId, isEarlyBirdPlan } from "@/lib/billing/tiers";
import { trialDaysRemaining } from "@/lib/billing/group-subscription";
import { canAccessFeature, isPremiumFeature } from "@/lib/billing/feature-gate";

describe("tierFromPlanId", () => {
  it("maps harmonia plan IDs to harmonia tier", () => {
    expect(tierFromPlanId("harmonia_monthly")).toBe("harmonia");
    expect(tierFromPlanId("harmonia_annual")).toBe("harmonia");
    expect(tierFromPlanId("harmonia_earlybird_monthly")).toBe("harmonia");
    expect(tierFromPlanId("harmonia_earlybird_annual")).toBe("harmonia");
  });

  it("maps premium jurídico plan IDs", () => {
    expect(tierFromPlanId("premium_juridico_monthly")).toBe("premium_juridico");
    expect(tierFromPlanId("premium_juridico_annual")).toBe("premium_juridico");
  });

  it("maps legacy premium/elite to current tiers for grandfathered subs", () => {
    expect(tierFromPlanId("premium_monthly")).toBe("harmonia");
    expect(tierFromPlanId("elite_monthly")).toBe("premium_juridico");
  });

  it("returns free for null, undefined, or unknown plan IDs", () => {
    expect(tierFromPlanId(null)).toBe("free");
    expect(tierFromPlanId(undefined)).toBe("free");
    expect(tierFromPlanId("")).toBe("free");
    expect(tierFromPlanId("free")).toBe("free");
    expect(tierFromPlanId("made_up_plan")).toBe("free");
  });
});

describe("isEarlyBirdPlan", () => {
  it("identifies Early Bird plans", () => {
    expect(isEarlyBirdPlan("harmonia_earlybird_monthly")).toBe(true);
    expect(isEarlyBirdPlan("harmonia_earlybird_annual")).toBe(true);
  });

  it("rejects non-Early Bird plans", () => {
    expect(isEarlyBirdPlan("harmonia_monthly")).toBe(false);
    expect(isEarlyBirdPlan("premium_juridico_monthly")).toBe(false);
    expect(isEarlyBirdPlan("free")).toBe(false);
    expect(isEarlyBirdPlan(null)).toBe(false);
  });
});

describe("trialDaysRemaining", () => {
  it("returns positive days for future trial_end", () => {
    const futureTrial = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString();
    expect(trialDaysRemaining(futureTrial)).toBeGreaterThan(4);
    expect(trialDaysRemaining(futureTrial)).toBeLessThanOrEqual(5);
  });

  it("returns 0 or negative for past trial_end", () => {
    const pastTrial = new Date(Date.now() - 1000).toISOString();
    expect(trialDaysRemaining(pastTrial)).toBeLessThanOrEqual(0);
  });

  it("returns 0 for null", () => {
    expect(trialDaysRemaining(null)).toBe(0);
  });
});

describe("canAccessFeature", () => {
  it("gives free tier only non-premium features", () => {
    expect(canAccessFeature("ai_assistant", "free")).toBe(false);
    expect(canAccessFeature("export_pdf", "free")).toBe(false);
    expect(canAccessFeature("basic_calendar", "free")).toBe(true);
  });

  it("gives harmonia tier premium features", () => {
    expect(canAccessFeature("ai_assistant", "harmonia")).toBe(true);
    expect(canAccessFeature("ocr_prescription", "harmonia")).toBe(true);
    expect(canAccessFeature("unlimited_children", "harmonia")).toBe(true);
  });

  it("restricts Premium Jurídico features to premium_juridico tier", () => {
    expect(canAccessFeature("export_pdf", "harmonia")).toBe(false);
    expect(canAccessFeature("legal_backup", "harmonia")).toBe(false);
    expect(canAccessFeature("audit_trail", "harmonia")).toBe(false);

    expect(canAccessFeature("export_pdf", "premium_juridico")).toBe(true);
    expect(canAccessFeature("legal_backup", "premium_juridico")).toBe(true);
    expect(canAccessFeature("audit_trail", "premium_juridico")).toBe(true);
  });

  it("premium_juridico tier also unlocks all harmonia features", () => {
    expect(canAccessFeature("ai_assistant", "premium_juridico")).toBe(true);
    expect(canAccessFeature("ocr_prescription", "premium_juridico")).toBe(true);
  });
});

describe("isPremiumFeature", () => {
  it("returns false when subscription inactive", () => {
    expect(
      isPremiumFeature("ai_assistant", { tier: "harmonia", isActive: false })
    ).toBe(false);
  });

  it("returns true during trial (isActive=true applies)", () => {
    expect(
      isPremiumFeature("ai_assistant", { tier: "premium_juridico", isActive: true })
    ).toBe(true);
  });

  it("returns true for premium feature on harmonia tier if active", () => {
    expect(
      isPremiumFeature("ai_assistant", { tier: "harmonia", isActive: true })
    ).toBe(true);
  });

  it("returns false for Premium Jurídico feature on harmonia tier", () => {
    expect(
      isPremiumFeature("export_pdf", { tier: "harmonia", isActive: true })
    ).toBe(false);
  });
});
