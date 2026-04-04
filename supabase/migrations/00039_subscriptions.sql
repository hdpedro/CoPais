-- ============================================================
-- PLANS TABLE — catalog of available subscription tiers
-- ============================================================
CREATE TABLE IF NOT EXISTS public.plans (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  price_brl INTEGER NOT NULL DEFAULT 0,
  interval TEXT NOT NULL DEFAULT 'month',
  stripe_price_id TEXT,
  apple_product_id TEXT,
  features JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Seed plans: Free + Premium (R$29.90) + Elite (R$49.90) — Decoy Effect pricing
INSERT INTO public.plans (id, name, description, price_brl, interval, stripe_price_id, features, sort_order) VALUES
  ('free', 'Free', 'Degustacao Solo — crie o habito', 0, 'month', NULL,
   '["calendar_basic","expenses_basic","custody_basic","1_child","1_user"]'::jsonb, 0),

  ('premium_monthly', 'Premium', 'Rede de Apoio e Colaboracao', 2990, 'month', NULL,
   '["calendar_full","expenses_full","chat","custody_full","ai_assistant","documents_unlimited","health_full","reports","unlimited_children","unlimited_users","support_priority"]'::jsonb, 1),

  ('premium_annual', 'Premium Anual', 'Rede de Apoio e Colaboracao — economize R$ 61,00', 29700, 'year', NULL,
   '["calendar_full","expenses_full","chat","custody_full","ai_assistant","documents_unlimited","health_full","reports","unlimited_children","unlimited_users","support_priority"]'::jsonb, 2),

  ('elite_monthly', 'Elite', 'Suporte VIP e Backup Juridico', 4990, 'month', NULL,
   '["calendar_full","expenses_full","chat","custody_full","ai_assistant","documents_unlimited","health_full","reports","unlimited_children","unlimited_users","support_vip","legal_backup","detailed_reports","export_pdf","data_backup"]'::jsonb, 3),

  ('elite_annual', 'Elite Anual', 'Suporte VIP e Backup Juridico — economize R$ 101,00', 49700, 'year', NULL,
   '["calendar_full","expenses_full","chat","custody_full","ai_assistant","documents_unlimited","health_full","reports","unlimited_children","unlimited_users","support_vip","legal_backup","detailed_reports","export_pdf","data_backup"]'::jsonb, 4)
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- SUBSCRIPTIONS TABLE — one active subscription per user
-- ============================================================
CREATE TABLE IF NOT EXISTS public.subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  plan_id TEXT NOT NULL REFERENCES public.plans(id),
  status TEXT NOT NULL DEFAULT 'active',
  payment_provider TEXT NOT NULL,
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  apple_original_transaction_id TEXT,
  current_period_start TIMESTAMPTZ NOT NULL DEFAULT now(),
  current_period_end TIMESTAMPTZ NOT NULL,
  cancel_at_period_end BOOLEAN NOT NULL DEFAULT false,
  trial_end TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_subscriptions_active_user
  ON public.subscriptions(user_id)
  WHERE status IN ('active', 'trialing', 'past_due');

CREATE INDEX IF NOT EXISTS idx_subscriptions_stripe_customer ON public.subscriptions(stripe_customer_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_stripe_sub ON public.subscriptions(stripe_subscription_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON public.subscriptions(user_id, status);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================
ALTER TABLE public.plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read active plans"
  ON public.plans FOR SELECT
  USING (is_active = true);

CREATE POLICY "Users can read own subscriptions"
  ON public.subscriptions FOR SELECT
  USING (user_id = auth.uid());
