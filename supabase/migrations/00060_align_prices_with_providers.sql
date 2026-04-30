-- ============================================================
-- ALIGN PLANS PRICING WITH STRIPE + APPLE (production reality)
-- ============================================================
-- Migration 00055 set plans.price_brl to values that never matched
-- what was actually configured in Stripe Products and Apple ASC IAPs:
--
--   plan_id                       00055  Stripe/Apple  Δ
--   harmonia_monthly              2490   1990          -500
--   harmonia_annual              23900  19990          -3910
--   harmonia_earlybird_monthly    1990   1490          -500
--   harmonia_earlybird_annual    19100  14990          -4110
--   premium_juridico_monthly      3990   3990            0
--   premium_juridico_annual      38300  39990         +1690
--
-- This drift caused split expenses (src/lib/billing/split.ts) to
-- bill the co-responsible R$24,90/month while the payer was actually
-- charged R$19,90 — a real R$2,50 over-charge per period in the most
-- common monthly case.
--
-- Resolution: align plans.price_brl to the live Stripe + Apple values.
-- If you want to bump prices later, update Stripe + Apple FIRST then
-- run another migration here.
-- ============================================================

UPDATE public.plans SET price_brl = 1490  WHERE id = 'harmonia_earlybird_monthly';
UPDATE public.plans SET price_brl = 14990 WHERE id = 'harmonia_earlybird_annual';
UPDATE public.plans SET price_brl = 1990  WHERE id = 'harmonia_monthly';
UPDATE public.plans SET price_brl = 19990 WHERE id = 'harmonia_annual';
UPDATE public.plans SET price_brl = 3990  WHERE id = 'premium_juridico_monthly';
UPDATE public.plans SET price_brl = 39990 WHERE id = 'premium_juridico_annual';

-- Refresh marketing copy so /assinatura + landing show real prices.
UPDATE public.plans
SET description = 'R$14,90/mês para as primeiras 1.000 famílias, para sempre'
WHERE id = 'harmonia_earlybird_monthly';

UPDATE public.plans
SET description = 'R$149,90/ano — Early Bird com ~16% off anual, para sempre'
WHERE id = 'harmonia_earlybird_annual';

UPDATE public.plans
SET description = 'Organização completa para toda a família — R$19,90/mês'
WHERE id = 'harmonia_monthly';

UPDATE public.plans
SET description = 'R$199,90/ano — ~16% off no plano anual'
WHERE id = 'harmonia_annual';

UPDATE public.plans
SET description = 'Tudo de Harmonia + export legal, audit trail e suporte prioritário — R$39,90/mês'
WHERE id = 'premium_juridico_monthly';

UPDATE public.plans
SET description = 'R$399,90/ano — ~16% off no plano anual'
WHERE id = 'premium_juridico_annual';
