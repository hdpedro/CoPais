import { getPlanAmountBrl } from "./split";

/**
 * PIX discount configuration. The actual discount is applied via a
 * Stripe coupon (see MANUAL_OPERACIONAL.md §5.2) — this value only
 * drives the UI "save R$X" copy so it stays consistent with what the
 * customer will actually see at checkout.
 *
 * If you change the discount in Stripe, also change this constant
 * OR make this read-from-env. Keeping a single constant avoids drift
 * in copy across the landing / pricing / subscription pages.
 */
export const PIX_DISCOUNT_BRL = 5;

export interface PixPriceView {
  planId: string;
  cardPriceBrl: number;
  pixPriceBrl: number;
  discountBrl: number;
  savings: string; // pre-formatted "R$ 5,00"
}

/**
 * Computes the effective PIX-discounted price for a plan. Returns null
 * when the plan doesn't have a known BRL amount (e.g. legacy IDs that
 * never got priced here). Free plan returns null too.
 *
 * The discount is applied to monthly plans only. Annual plans already
 * price in the 20% savings — adding a further PIX discount would eat
 * margin without matching customer perception of value.
 */
export function getPixPrice(planId: string): PixPriceView | null {
  const cardPrice = getPlanAmountBrl(planId);
  if (cardPrice == null || cardPrice === 0) return null;

  // No PIX discount on annual plans (already discounted 20%).
  if (planId.includes("annual")) {
    return {
      planId,
      cardPriceBrl: cardPrice,
      pixPriceBrl: cardPrice,
      discountBrl: 0,
      savings: "",
    };
  }

  const pixPrice = Math.max(cardPrice - PIX_DISCOUNT_BRL, 0);
  return {
    planId,
    cardPriceBrl: cardPrice,
    pixPriceBrl: pixPrice,
    discountBrl: PIX_DISCOUNT_BRL,
    savings: `R$ ${PIX_DISCOUNT_BRL.toFixed(2).replace(".", ",")}`,
  };
}

/**
 * Is PIX Automático enabled in the Stripe account? This is a simple env
 * flag — set it to `true` once you've been granted PIX Automático access
 * in the Stripe dashboard (see MANUAL_OPERACIONAL.md §5.1).
 *
 * When false, the PIX CTAs on the landing page are hidden / disabled so
 * customers don't hit a Stripe error mid-checkout.
 */
export function isPixSubscriptionEnabled(): boolean {
  return process.env.NEXT_PUBLIC_PIX_ENABLED === "true";
}
