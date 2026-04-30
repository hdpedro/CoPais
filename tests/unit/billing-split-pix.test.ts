import { describe, it, expect } from "vitest";
import {
  getPlanAmountBrl,
  computeCoShareAmount,
  buildSplitRatio,
} from "@/lib/billing/split";
import { getPixPrice, PIX_DISCOUNT_BRL } from "@/lib/billing/pix";

describe("getPlanAmountBrl", () => {
  it("returns correct amount for each plan", () => {
    // Reconciled with live Stripe + Apple ASC pricing (migration 00060).
    expect(getPlanAmountBrl("harmonia_earlybird_monthly")).toBe(14.9);
    expect(getPlanAmountBrl("harmonia_monthly")).toBe(19.9);
    expect(getPlanAmountBrl("premium_juridico_monthly")).toBe(39.9);
    expect(getPlanAmountBrl("harmonia_annual")).toBe(199.9);
    expect(getPlanAmountBrl("premium_juridico_annual")).toBe(399.9);
  });

  it("returns legacy amounts for grandfathered plans", () => {
    expect(getPlanAmountBrl("premium_monthly")).toBe(29.9);
    expect(getPlanAmountBrl("elite_monthly")).toBe(49.9);
  });

  it("returns null for unknown plans", () => {
    expect(getPlanAmountBrl("free")).toBeNull();
    expect(getPlanAmountBrl("made_up")).toBeNull();
  });
});

describe("computeCoShareAmount", () => {
  it("computes 50/50 split", () => {
    expect(computeCoShareAmount("harmonia_monthly", 50)).toBe(9.95);
    expect(computeCoShareAmount("premium_juridico_monthly", 50)).toBe(19.95);
  });

  it("computes non-50 splits", () => {
    expect(computeCoShareAmount("harmonia_monthly", 30)).toBe(5.97);
    expect(computeCoShareAmount("harmonia_monthly", 70)).toBe(13.93);
  });

  it("returns null for unknown plan", () => {
    expect(computeCoShareAmount("nope", 50)).toBeNull();
  });
});

describe("buildSplitRatio", () => {
  it("builds a valid ratio map that sums to 100", () => {
    const ratio = buildSplitRatio("user-a", "user-b", 50);
    expect(ratio["user-a"]).toBe(50);
    expect(ratio["user-b"]).toBe(50);
    expect(Object.values(ratio).reduce((a, b) => a + b, 0)).toBe(100);
  });

  it("handles asymmetric splits", () => {
    const ratio = buildSplitRatio("payer", "co", 30);
    expect(ratio["payer"]).toBe(70);
    expect(ratio["co"]).toBe(30);
  });
});

describe("getPixPrice", () => {
  it("returns discounted price for monthly plans", () => {
    const price = getPixPrice("harmonia_monthly");
    expect(price).not.toBeNull();
    expect(price!.cardPriceBrl).toBe(19.9);
    expect(price!.pixPriceBrl).toBe(19.9 - PIX_DISCOUNT_BRL);
    expect(price!.discountBrl).toBe(PIX_DISCOUNT_BRL);
  });

  it("returns discounted price for Premium Jurídico monthly", () => {
    const price = getPixPrice("premium_juridico_monthly");
    expect(price!.pixPriceBrl).toBe(39.9 - PIX_DISCOUNT_BRL);
  });

  it("returns no discount for annual plans", () => {
    const price = getPixPrice("harmonia_annual");
    expect(price).not.toBeNull();
    expect(price!.pixPriceBrl).toBe(price!.cardPriceBrl);
    expect(price!.discountBrl).toBe(0);
  });

  it("returns null for free and unknown plans", () => {
    expect(getPixPrice("free")).toBeNull();
    expect(getPixPrice("unknown")).toBeNull();
  });
});
