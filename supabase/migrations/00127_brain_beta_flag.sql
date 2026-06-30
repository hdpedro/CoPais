-- ============================================================
-- MIGRATION 127: Kindar Brain — allowlist de beta por grupo
--
-- Coluna `brain_beta_enabled` em coparenting_groups: a 2ª camada do
-- rollout (allowlist NOMEADA, não %). Efetivo = master env
-- FEATURE_BRAIN_FAMILY_INBOX `&&` grupo.brain_beta_enabled.
--
-- PROTEÇÃO (igual is_test_fixture/paywall_enforced): o GRANT de UPDATE em
-- coparenting_groups é POR COLUNA (migration 00120 concede só name/
-- arrangement/custody_enabled a authenticated; NÃO há grant table-level).
-- Uma coluna NOVA não entra nesse grant → `authenticated` NÃO consegue
-- escrevê-la, mesmo passando na RLS. Só o service_role (admin client) liga/
-- desliga. Ligar uma família = 1 UPDATE via service_role (instantâneo, sem
-- deploy). NÃO reusar is_test_fixture (ele EXCLUI das métricas; a coorte
-- beta precisa APARECER nas métricas-mãe).
--
-- Additiva/metadata-only (PG17): ADD COLUMN NOT NULL DEFAULT é gravação só
-- no catálogo, sem reescrever a tabela.
-- ============================================================

ALTER TABLE public.coparenting_groups
  ADD COLUMN IF NOT EXISTS brain_beta_enabled BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.coparenting_groups.brain_beta_enabled IS
  'Allowlist do beta do Kindar Brain (Family Inbox). Efetivo = master env FEATURE_BRAIN_FAMILY_INBOX && esta coluna. Escrita só por service_role (não está no GRANT de UPDATE por coluna p/ authenticated — vide 00120). Aparece nas métricas (≠ is_test_fixture).';
