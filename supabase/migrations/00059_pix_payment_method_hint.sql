-- ============================================================
-- PIX PAYMENT METHOD TRACKING — Fase 3
-- ============================================================
-- Records which payment method the user chose at checkout so we can:
--   1. Apply the PIX discount consistently on renewals
--   2. Show "economiza R$5/mês" badge on the subscription page
--   3. Track PIX adoption over time in PostHog / analytics
--
-- The actual PIX discount is a Stripe coupon (applied at checkout).
-- This column just mirrors what Stripe already knows for our own UI
-- and reporting.
-- ============================================================

ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS payment_method_hint TEXT
  CHECK (payment_method_hint IS NULL OR payment_method_hint IN ('card', 'pix', 'apple_iap', 'google_iap', 'trial'));

-- Backfill from existing rows: if provider is stripe, default to 'card';
-- apple → 'apple_iap', google → 'google_iap', trial → 'trial'.
UPDATE public.subscriptions
SET payment_method_hint = CASE payment_provider
  WHEN 'stripe' THEN 'card'
  WHEN 'apple' THEN 'apple_iap'
  WHEN 'google' THEN 'google_iap'
  WHEN 'trial' THEN 'trial'
  ELSE payment_method_hint
END
WHERE payment_method_hint IS NULL;
