-- ============================================================
-- PAYWALL COHORT FLAG (hard paywall — só para novos cadastros)
-- ============================================================
-- Nova precificação (jun/2026): trial de 30 dias e, ao expirar, BLOQUEIO
-- TOTAL do app até assinar o Harmonia. Decisão do produto: o bloqueio vale
-- SOMENTE para novos cadastros — quem já usa o app mantém o comportamento
-- atual (freemium + gating por-feature).
--
-- Implementação: uma flag por grupo familiar (billing é per-group).
--   - DEFAULT true  → todo grupo NOVO entra na coorte com bloqueio.
--   - Backfill false → todos os grupos EXISTENTES ficam grandfathered.
--
-- O gate de acesso (src/lib/billing/access.ts) lê essa flag + a assinatura
-- ativa do grupo pra decidir `locked`. Sem assinatura é resolvido lá, não
-- aqui — esta migration só marca a coorte.
--
-- Coluna aditiva, NOT NULL com default + backfill no mesmo statement de
-- ALTER (Postgres preenche existentes com o default e o UPDATE seguinte
-- reverte os antigos pra false). Zero downtime.
-- ============================================================

ALTER TABLE public.coparenting_groups
  ADD COLUMN IF NOT EXISTS paywall_enforced BOOLEAN NOT NULL DEFAULT true;

-- Grandfather: todos os grupos que já existem no momento desta migration
-- NÃO são bloqueados. Só grupos criados depois (default true) entram na
-- coorte com paywall. Roda 1× — grupos novos nascem já com true.
UPDATE public.coparenting_groups
SET paywall_enforced = false
WHERE created_at < now();

COMMENT ON COLUMN public.coparenting_groups.paywall_enforced IS
  'true = grupo sujeito ao bloqueio total pós-trial de 30 dias (coorte nova, jun/2026). false = grandfathered (freemium antigo). Lido por src/lib/billing/access.ts:getGroupAccessState.';
