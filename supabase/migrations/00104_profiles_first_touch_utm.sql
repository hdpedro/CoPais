-- First-touch marketing attribution.
--
-- Persiste o UTM/referrer capturado na PRIMEIRA visita do usuário (cookie
-- `kindar-attribution` escrito client-side por PostHogAnonymousInit) no perfil,
-- no momento do cadastro. Lido de volta no webhook do Stripe pra carimbar
-- `subscription_started` / `checkout_completed` com a campanha de origem.
--
-- Por que precisa do banco: a assinatura acontece dias/semanas depois do
-- cadastro, num webhook server-side sem cookie. Sem persistir o first-touch,
-- não há como ligar "pagou" → "veio do Instagram". Fecha o loop de atribuição
-- que o stitching de navegador não consegue (eventos server-side são keados
-- por email/user.id, não pelo device_id anônimo da visita).
--
-- Coluna nullable, aditiva, sem default — zero risco pra rows existentes.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS first_touch_utm jsonb;

COMMENT ON COLUMN public.profiles.first_touch_utm IS
  'First-touch marketing attribution capturada no cadastro: { source, medium, campaign, content, term, referrer, landing, ts }. NULL para users criados antes desta coluna ou sem cookie de atribuição.';
