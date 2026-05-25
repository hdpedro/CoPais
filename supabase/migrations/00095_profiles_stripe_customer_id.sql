-- 00095_profiles_stripe_customer_id.sql
-- Cache Stripe Customer ID per profile so /api/stripe/checkout doesn't
-- have to make an outbound `stripe.customers.list({email})` call on every
-- new-checkout attempt by a logged-in user without an active subscription.
--
-- Before: lookup via Stripe API on every checkout init (lat ~200-500ms p50,
-- rate-limited to 100/s on live, plus dollar cost on usage-based plans).
-- After: read once from `profiles`, fall back to Stripe API only if cache
-- is missing (first-time user), then backfill.
--
-- The column is UNIQUE so two profiles can't accidentally share a Stripe
-- customer (would split billing history). On Stripe's side `cus_*` IDs are
-- already unique, so the constraint just enforces consistency.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS stripe_customer_id text;

-- Partial UNIQUE so NULL doesn't count (most profiles never need a Stripe
-- customer — caregivers, lawyers, family-only users on free tier).
CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_stripe_customer_id
  ON public.profiles (stripe_customer_id)
  WHERE stripe_customer_id IS NOT NULL;

-- Backfill from existing subscriptions where we already have the customer
-- id stored. Picks the most-recently-updated row per user to handle the
-- (rare) case of multiple Stripe subs over time.
WITH ranked AS (
  SELECT
    user_id,
    stripe_customer_id,
    row_number() OVER (PARTITION BY user_id ORDER BY updated_at DESC) AS rn
  FROM public.subscriptions
  WHERE stripe_customer_id IS NOT NULL
)
UPDATE public.profiles p
  SET stripe_customer_id = r.stripe_customer_id
FROM ranked r
WHERE r.rn = 1
  AND p.id = r.user_id
  AND p.stripe_customer_id IS NULL;

COMMENT ON COLUMN public.profiles.stripe_customer_id IS
  'Cached Stripe Customer ID (cus_*) — avoids stripe.customers.list lookup on every checkout. Backfilled from subscriptions on 2026-05-25. NULL for users who never started a Stripe sub.';
