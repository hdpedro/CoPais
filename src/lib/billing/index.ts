/**
 * Public entry point for billing logic. Keep imports scoped to this file
 * from app code so future refactors can reshape internals freely.
 *
 * Server-side authoritative principle: every premium check lives here
 * or inside the `/api/billing/status` endpoint. Clients (PWA / iOS /
 * Android) never infer tier from local state.
 */

export { tierFromPlanId, isEarlyBirdPlan } from "./tiers";
export type { PlanTier } from "./tiers";

export {
  getGroupSubscription,
  getPrimaryGroupId,
  trialDaysRemaining,
  FREE_SUBSCRIPTION,
} from "./group-subscription";
export type { GroupSubscription } from "./group-subscription";

export { canStartSubscription } from "./payer";

export {
  getEarlyBirdStatus,
  canClaimEarlyBird,
  clearEarlyBirdCache,
  EARLY_BIRD_MONTHLY_PLAN,
  EARLY_BIRD_ANNUAL_PLAN,
} from "./early-bird";
export type { EarlyBirdStatus } from "./early-bird";

export { canAccessFeature, isPremiumFeature } from "./feature-gate";

export { grantTrialIfEligible, TRIAL_PLAN_ID, TRIAL_DURATION_DAYS } from "./trial";

export {
  getPlanAmountBrl,
  computeCoShareAmount,
  buildSplitRatio,
  createSplitExpenseForPeriod,
} from "./split";

export {
  getPixPrice,
  isPixSubscriptionEnabled,
  PIX_DISCOUNT_BRL,
} from "./pix";
export type { PixPriceView } from "./pix";

export {
  isPromoActiveServer,
  trialDaysInApp,
  trialDaysStripeCheckout,
  PROMO_TRIAL_DAYS,
  TRIAL_DURATION_DAYS_DEFAULT,
  STRIPE_TRIAL_DAYS_DEFAULT,
} from "./promo";
