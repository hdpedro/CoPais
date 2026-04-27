-- ============================================================
-- PLANS REPRICE + RENAME (Harmonia / Premium Jurídico)
-- ============================================================
-- Aligns plan catalog with the monetization strategy:
--   Free                 → Grátis (unchanged)
--   Premium R$29,90      → Harmonia R$24,90 (reprice)
--   Elite R$49,90        → Premium Jurídico R$39,90 (reprice)
--   NEW: Harmonia Early Bird R$19,90 (first 1,000 forever)
--
-- Backward compat: old plan IDs (premium_monthly, elite_monthly) stay
-- in the table with is_active=false so existing subs don't break; new
-- IDs coexist with new prices. Feature flags updated to the new model.
-- ============================================================

-- 1. Add max_subscribers column to plans (for Early Bird capacity cap)
ALTER TABLE public.plans
  ADD COLUMN IF NOT EXISTS max_subscribers INTEGER NULL;

-- 2. Deactivate legacy plan rows. Keep them present for historical subs
--    that reference them via FK.
UPDATE public.plans
SET is_active = false
WHERE id IN ('premium_monthly', 'premium_annual', 'elite_monthly', 'elite_annual');

-- 3. Seed new plans. ON CONFLICT DO UPDATE keeps this idempotent and
--    lets us re-run the migration to refresh prices during development.
INSERT INTO public.plans (id, name, description, price_brl, interval, features, sort_order, is_active, max_subscribers) VALUES
  ('harmonia_earlybird_monthly', 'Harmonia — Early Bird',
   'R$19,90/mês para as primeiras 1.000 famílias, para sempre',
   1990, 'month',
   '["calendar_full","expenses_full","chat","custody_full","ai_assistant","documents_unlimited","health_full","reports","unlimited_children","unlimited_users","support_priority","payer_role_restricted_to_parent","early_bird_forever"]'::jsonb,
   1, true, 1000),

  ('harmonia_earlybird_annual', 'Harmonia — Early Bird Anual',
   'R$191/ano — Early Bird com 20% off anual, para sempre',
   19100, 'year',
   '["calendar_full","expenses_full","chat","custody_full","ai_assistant","documents_unlimited","health_full","reports","unlimited_children","unlimited_users","support_priority","payer_role_restricted_to_parent","early_bird_forever"]'::jsonb,
   2, true, 1000),

  ('harmonia_monthly', 'Harmonia',
   'Organização completa para toda a família — R$24,90/mês',
   2490, 'month',
   '["calendar_full","expenses_full","chat","custody_full","ai_assistant","documents_unlimited","health_full","reports","unlimited_children","unlimited_users","support_priority","payer_role_restricted_to_parent"]'::jsonb,
   3, true, NULL),

  ('harmonia_annual', 'Harmonia Anual',
   'R$239/ano — 20% off no plano anual',
   23900, 'year',
   '["calendar_full","expenses_full","chat","custody_full","ai_assistant","documents_unlimited","health_full","reports","unlimited_children","unlimited_users","support_priority","payer_role_restricted_to_parent"]'::jsonb,
   4, true, NULL),

  ('premium_juridico_monthly', 'Premium Jurídico',
   'Tudo de Harmonia + export legal, audit trail e suporte prioritário — R$39,90/mês',
   3990, 'month',
   '["calendar_full","expenses_full","chat","custody_full","ai_assistant","documents_unlimited","health_full","reports","unlimited_children","unlimited_users","support_vip","legal_backup","detailed_reports","export_pdf","data_backup","prescription_alerts","payer_role_restricted_to_parent"]'::jsonb,
   5, true, NULL),

  ('premium_juridico_annual', 'Premium Jurídico Anual',
   'R$383/ano — 20% off no plano anual',
   38300, 'year',
   '["calendar_full","expenses_full","chat","custody_full","ai_assistant","documents_unlimited","health_full","reports","unlimited_children","unlimited_users","support_vip","legal_backup","detailed_reports","export_pdf","data_backup","prescription_alerts","payer_role_restricted_to_parent"]'::jsonb,
   6, true, NULL)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  price_brl = EXCLUDED.price_brl,
  features = EXCLUDED.features,
  sort_order = EXCLUDED.sort_order,
  is_active = EXCLUDED.is_active,
  max_subscribers = EXCLUDED.max_subscribers;

-- 4. Ensure Free plan exists with updated description and feature flags
INSERT INTO public.plans (id, name, description, price_brl, interval, features, sort_order, is_active) VALUES
  ('free', 'Grátis',
   'Organização básica para começar — 1 criança, 30 dias de histórico',
   0, 'month',
   '["calendar_basic","expenses_basic","custody_basic","1_child","history_30_days"]'::jsonb,
   0, true)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  features = EXCLUDED.features,
  is_active = EXCLUDED.is_active;
