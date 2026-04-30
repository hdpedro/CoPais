/**
 * "2 meses grátis" promotional flag and constants.
 *
 * When PROMO_2M_FREE=true (server) OR NEXT_PUBLIC_PROMO_2M_FREE=true (client),
 * the app extends both the in-app trial and the Stripe checkout trial to
 * 60 days. Apple introductory offers are configured statically via the
 * `scripts/asc-iap-intro-offer.mjs` helper and propagate independently
 * of this flag (deactivating the flag does NOT remove Apple offers — use
 * the same script with --delete to take them down).
 *
 * Why two env vars: PROMO_2M_FREE is read server-side (checkout, cron,
 * trial grant). NEXT_PUBLIC_PROMO_2M_FREE is read client-side (pricing
 * banner, landing copy). They MUST be kept in sync — flipping only one
 * causes user-visible inconsistency.
 *
 * Default trial durations when flag is off:
 *   - In-app trial (Premium Jurídico)        : 7 days
 *   - Stripe checkout (first sub)            : 14 days
 *   - Apple Introductory Offer               : not set
 */

/** In-app trial when the promo is OFF. */
export const TRIAL_DURATION_DAYS_DEFAULT = 7;

/** Stripe checkout trial when the promo is OFF (first sub only). */
export const STRIPE_TRIAL_DAYS_DEFAULT = 14;

/** Trial duration during the promo, in days, on both flows. */
export const PROMO_TRIAL_DAYS = 60;

/**
 * Server-side check. Used by checkout API, trial grant, cron expiry.
 * Reads PROMO_2M_FREE only — the public flag is for UI rendering.
 */
export function isPromoActiveServer(): boolean {
  return process.env.PROMO_2M_FREE === "true";
}

/** Trial days in-app (Premium Jurídico): 60 if promo, else 7. */
export function trialDaysInApp(): number {
  return isPromoActiveServer() ? PROMO_TRIAL_DAYS : TRIAL_DURATION_DAYS_DEFAULT;
}

/** Stripe checkout trial: 60 if promo, else 14. */
export function trialDaysStripeCheckout(): number {
  return isPromoActiveServer() ? PROMO_TRIAL_DAYS : STRIPE_TRIAL_DAYS_DEFAULT;
}
