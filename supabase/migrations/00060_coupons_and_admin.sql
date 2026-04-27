-- ============================================================
-- COUPONS + ADMIN TRACKING — Fase 5
-- ============================================================
-- Enables admin-created promotional codes (partnerships, comebacks,
-- customer service make-goods) without opening the full Stripe
-- dashboard. Actual discount math is enforced by Stripe via
-- promotion codes; this table is our internal catalog for UI + analytics.
--
-- Flow:
--   1. Admin creates a coupon in /admin/coupons → we POST to Stripe
--      (coupons.create + promotionCodes.create) and store both IDs
--   2. User enters the CODE at checkout → we pass the promotion_code
--      to Stripe → Stripe applies discount
--   3. Webhook (checkout.session.completed) reads session.discounts[0]
--      and writes coupon_code to subscriptions for reporting
-- ============================================================

CREATE TABLE IF NOT EXISTS public.coupons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- User-facing code (UPPERCASE, validated on input)
  code TEXT NOT NULL UNIQUE,
  description TEXT,

  -- Discount (exactly one of amount_off_brl / percent_off is required)
  amount_off_brl INTEGER, -- R$ * 100 (e.g. 500 = R$5,00)
  percent_off NUMERIC(5, 2), -- 0-100
  CHECK ((amount_off_brl IS NOT NULL) <> (percent_off IS NOT NULL)),

  -- Duration (matches Stripe's coupon.duration semantics)
  duration TEXT NOT NULL CHECK (duration IN ('forever', 'once', 'repeating')),
  duration_months INTEGER CHECK (
    (duration = 'repeating' AND duration_months IS NOT NULL AND duration_months > 0)
    OR (duration <> 'repeating' AND duration_months IS NULL)
  ),

  -- Limits
  max_redemptions INTEGER, -- NULL = unlimited
  current_redemptions INTEGER NOT NULL DEFAULT 0,
  expires_at TIMESTAMPTZ,

  -- Which plans it applies to — empty array = all plans
  applicable_plan_ids TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],

  -- Stripe sync
  stripe_coupon_id TEXT UNIQUE,
  stripe_promotion_code_id TEXT UNIQUE,

  -- Admin bookkeeping
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  notes TEXT -- internal notes for the admin team
);

CREATE INDEX IF NOT EXISTS idx_coupons_code_active
  ON public.coupons(code)
  WHERE is_active = true;

-- Track which coupon was used per subscription (populated by webhook)
ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS coupon_code TEXT;

-- RLS: only service role writes (admin actions use admin client).
-- Authenticated users can SELECT active coupons to validate at checkout.
ALTER TABLE public.coupons ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read active coupons" ON public.coupons;
CREATE POLICY "Anyone can read active coupons"
  ON public.coupons FOR SELECT
  USING (
    is_active = true
    AND (expires_at IS NULL OR expires_at > now())
    AND (max_redemptions IS NULL OR current_redemptions < max_redemptions)
  );

-- Helper view: coupons that are claim-ready right now. Used by the
-- /api/coupons/validate endpoint and the admin dashboard.
CREATE OR REPLACE VIEW public.v_active_coupons AS
SELECT
  c.*,
  CASE
    WHEN c.max_redemptions IS NULL THEN NULL
    ELSE c.max_redemptions - c.current_redemptions
  END AS redemptions_remaining,
  CASE
    WHEN c.expires_at IS NULL THEN false
    WHEN c.expires_at <= now() THEN true
    ELSE false
  END AS is_expired
FROM public.coupons c
WHERE c.is_active = true;

GRANT SELECT ON public.v_active_coupons TO authenticated;
