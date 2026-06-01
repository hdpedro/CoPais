-- ============================================================
-- HARMONIA COMO PLANO ÚNICO + REPREÇO R$19,90 (jun/2026)
-- ============================================================
-- Nova estratégia: um único plano pago visível (Harmonia). O MENSAL já é
-- R$19,90 em produção (migration 00060 + Stripe/Apple), então aqui só
-- confirmamos. O ANUAL passa de R$199,90 → R$226,80 (5% off vs 12×R$19,90,
-- conforme pedido) — ou seja, MENOS desconto = aumento no anual.
-- Early Bird e Premium Jurídico saem de cena para NOVOS compradores, mas
-- as linhas permanecem (is_active=false) porque assinantes atuais ainda as
-- referenciam por FK e continuam renovando (grandfathered).
--
-- IMPORTANTE (passo manual, fora desta migration):
--   - Stripe: criar novos Prices R$19,90/mês e R$226,80/ano e atualizar
--     plans.stripe_price_id das linhas harmonia_monthly/harmonia_annual.
--   - App Store / Play / RevenueCat: baixar preço + intro offer 30d e
--     deixar só o Harmonia no offering. Ver MANUAL_OPERACIONAL.md.
--
-- Idempotente: UPDATEs podem rerodar sem efeito colateral.
-- ============================================================

-- 1. Harmonia mensal → R$19,90 (já vigente desde 00060; confirma idempotente).
UPDATE public.plans
SET name = 'Harmonia',
    description = 'Organização completa para toda a família — R$19,90/mês',
    price_brl = 1990,
    is_active = true
WHERE id = 'harmonia_monthly';

-- 2. Harmonia anual → R$226,80/ano (5% off vs 12×R$19,90 = R$238,80).
--    Sobe de R$199,90 (00060) pra R$226,80 — menos desconto, a pedido.
--    Equivale a R$18,90/mês. ATENÇÃO: é AUMENTO no anual → ver passo manual
--    Apple/Google (consentimento de aumento pros assinantes anuais atuais).
UPDATE public.plans
SET name = 'Harmonia Anual',
    description = 'R$226,80/ano — 5% off no plano anual (equivale a R$18,90/mês)',
    price_brl = 22680,
    is_active = true
WHERE id = 'harmonia_annual';

-- 3. Esconder Early Bird e Premium Jurídico de NOVOS compradores. As linhas
--    ficam (NÃO apagar) — subs grandfathered apontam pra elas por FK e o
--    checkout/route.ts bloqueia novas compras via is_active=false.
UPDATE public.plans
SET is_active = false
WHERE id IN (
  'harmonia_earlybird_monthly',
  'harmonia_earlybird_annual',
  'premium_juridico_monthly',
  'premium_juridico_annual'
);

-- 4. O plano Grátis continua válido para a coorte antiga (paywall_enforced=
--    false). Não alteramos nada nele aqui.
