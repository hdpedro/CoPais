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

-- Seed initial plans
INSERT INTO public.plans (id, name, description, price_brl, interval, stripe_price_id, features, sort_order) VALUES
  ('free', 'Gratuito', 'Funcionalidades essenciais para organizar a rotina', 0, 'month', NULL,
   '["calendar_basic","expenses_basic","chat","custody_basic"]'::jsonb, 0),
  ('premium_monthly', 'Premium', 'Tudo incluído — sem limites', 1990, 'month', NULL,
   '["calendar_full","expenses_full","chat","custody_full","ai_assistant","documents_unlimited","health_full","reports","export_pdf"]'::jsonb, 1),
  ('premium_annual', 'Premium Anual', 'Tudo incluído com desconto de 17%', 19900, 'year', NULL,
   '["calendar_full","expenses_full","chat","custody_full","ai_assistant","documents_unlimited","health_full","reports","export_pdf"]'::jsonb, 2)
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

-- Unique: one active subscription per user
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
