-- ============================================================
-- SUBSCRIPTION SPLIT — Fase 2
-- ============================================================
-- Lets a paying parent split the subscription cost 50/50 (or any ratio)
-- with the co-responsible via the existing Despesas module. When enabled,
-- Stripe/RevenueCat webhooks auto-create a matching expense on each
-- renewal. Zero new billing infra — reuses expenses + settlements.
-- ============================================================

-- 1. Add 'subscription' to expense_category enum so split expenses are
--    visually distinguishable and excluded from normal category reports.
ALTER TYPE public.expense_category ADD VALUE IF NOT EXISTS 'subscription';

-- 2. Flag on subscriptions: is split enabled, and with what ratio.
--    auto_split_ratio is the co-responsible's share (0-100). Default 50
--    means 50/50 split. The payer's share is implicit (100 - ratio).
ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS auto_split BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS auto_split_co_user_id UUID
  REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS auto_split_co_share SMALLINT
  CHECK (auto_split_co_share IS NULL OR (auto_split_co_share > 0 AND auto_split_co_share < 100));

-- 3. Helper index for the webhook query "find subs with auto_split on"
CREATE INDEX IF NOT EXISTS idx_subscriptions_auto_split
  ON public.subscriptions(coparenting_group_id)
  WHERE auto_split = true AND status IN ('active', 'trialing');

-- 4. Idempotency: prevent duplicate split expenses for the same sub + period.
--    When a Stripe renewal webhook fires, we look up by this pair and skip
--    if already created. Unique index over a JSONB metadata hash would be
--    ideal but Postgres doesn't have that — we use a dedicated column.
ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS source_subscription_id UUID
  REFERENCES public.subscriptions(id) ON DELETE SET NULL;

ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS source_period_start DATE;

CREATE UNIQUE INDEX IF NOT EXISTS idx_expenses_subscription_period
  ON public.expenses(source_subscription_id, source_period_start)
  WHERE source_subscription_id IS NOT NULL;
