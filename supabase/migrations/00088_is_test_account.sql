-- Marca contas e grupos como fixtures de teste, pra excluir de métricas e simplificar cleanup futuro.
-- Default = false: nenhum user existente é marcado. Seeders setam true no INSERT.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_test_account boolean NOT NULL DEFAULT false;

ALTER TABLE public.coparenting_groups
  ADD COLUMN IF NOT EXISTS is_test_fixture boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.profiles.is_test_account IS
  'true = seeder/fixture account. Excluir de DAU/MAU/funnel e analytics em geral. Setado pelo seeder no INSERT.';

COMMENT ON COLUMN public.coparenting_groups.is_test_fixture IS
  'true = grupo criado por seeder. Excluir de métricas. Setado pelo seeder no INSERT.';

-- Indexes parciais p/ queries de analytics ficarem rápidas filtrando "só usuários reais".
CREATE INDEX IF NOT EXISTS profiles_real_only_idx
  ON public.profiles (id)
  WHERE NOT is_test_account;

CREATE INDEX IF NOT EXISTS coparenting_groups_real_only_idx
  ON public.coparenting_groups (id)
  WHERE NOT is_test_fixture;
