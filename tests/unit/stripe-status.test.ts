import { describe, it, expect } from "vitest";
import { mapStripeStatus, ACCESS_GRANTING_STATUSES } from "@/lib/billing/stripe-status";

describe("mapStripeStatus", () => {
  it("maps access-granting Stripe statuses 1:1", () => {
    expect(mapStripeStatus("active")).toBe("active");
    expect(mapStripeStatus("trialing")).toBe("trialing");
    expect(mapStripeStatus("past_due")).toBe("past_due");
  });

  it("maps canceled-equivalents to 'canceled'", () => {
    expect(mapStripeStatus("canceled")).toBe("canceled");
    // 'unpaid' means Stripe gave up retrying — same UX outcome as canceled
    expect(mapStripeStatus("unpaid")).toBe("canceled");
  });

  it("maps mid-3DS to 'pending' (no access during SCA flow)", () => {
    // If we returned 'active' here a card declined mid-3DS would briefly
    // grant access. Conservative mapping → no premium until confirmation.
    expect(mapStripeStatus("incomplete")).toBe("pending");
  });

  it("maps timed-out / paused to 'expired'", () => {
    expect(mapStripeStatus("incomplete_expired")).toBe("expired");
    expect(mapStripeStatus("paused")).toBe("expired");
  });

  it("maps unknown statuses defensively to 'expired'", () => {
    // Defense-in-depth: a future Stripe status we haven't seen should NOT
    // accidentally grant access. Fail-closed.
    expect(mapStripeStatus("any_new_stripe_status")).toBe("expired");
    expect(mapStripeStatus("")).toBe("expired");
  });

  it("never returns a status outside our canonical set", () => {
    const canonicalStatuses = new Set([
      "active",
      "trialing",
      "past_due",
      "canceled",
      "expired",
      "pending",
    ]);
    const stripeStatuses = [
      "active",
      "trialing",
      "past_due",
      "canceled",
      "unpaid",
      "incomplete",
      "incomplete_expired",
      "paused",
      "weird_future_status",
    ];
    for (const s of stripeStatuses) {
      expect(canonicalStatuses.has(mapStripeStatus(s))).toBe(true);
    }
  });
});

describe("ACCESS_GRANTING_STATUSES", () => {
  it("includes exactly the 3 buckets that grant premium access", () => {
    expect(ACCESS_GRANTING_STATUSES).toEqual(["active", "trialing", "past_due"]);
  });

  it("aligns with mapStripeStatus return values for access paths", () => {
    // The view v_group_active_subscription filters by these. If they
    // diverge from mapStripeStatus outputs, the access logic breaks
    // silently. This test pins the contract.
    expect(ACCESS_GRANTING_STATUSES).toContain(mapStripeStatus("active"));
    expect(ACCESS_GRANTING_STATUSES).toContain(mapStripeStatus("trialing"));
    expect(ACCESS_GRANTING_STATUSES).toContain(mapStripeStatus("past_due"));
    // And explicitly DOESN'T include canceled/expired/pending
    expect(ACCESS_GRANTING_STATUSES).not.toContain(mapStripeStatus("canceled"));
    expect(ACCESS_GRANTING_STATUSES).not.toContain(mapStripeStatus("incomplete"));
    expect(ACCESS_GRANTING_STATUSES).not.toContain(mapStripeStatus("paused"));
  });
});
