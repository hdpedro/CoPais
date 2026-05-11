-- ============================================================
-- Migration 076: SECURITY DEFINER views → security_invoker
-- ============================================================
--
-- Contexto: o linter de segurança do Supabase (advisors) marcava 7 views
-- públicas como `SECURITY DEFINER` (level ERROR). Views com essa flag
-- executam a query com as permissões e RLS do CRIADOR (postgres
-- superuser), não do usuário que consulta — em efeito, **bypassam a RLS
-- das tabelas-base**. Isso significa que qualquer authenticated (e em
-- alguns casos anon) que consultasse a view via PostgREST conseguiria
-- ler linhas que a RLS escondia.
--
-- Postgres 15+ resolve isso com a opção de view `security_invoker = true`,
-- que faz a view executar com as permissões/RLS do CALLER. Os admin
-- clients (service role) continuam funcionando porque service role
-- bypassa RLS de qualquer forma.
--
-- Verificações feitas antes desta migration:
--   - Todas as tabelas-base têm RLS habilitada + policies (subscriptions,
--     plans, coupons, profiles, children, expenses, etc).
--   - Callers admin (`createAdminClient`) continuam funcionando porque
--     service role bypassa RLS — sem mudança de comportamento.
--   - Callers via cookie/Bearer (PWA + native) já filtram por group/user
--     na query (`.eq("group_id", ctx.groupId)`, `.eq("user_id", userId)`),
--     então a aplicação adicional de RLS de tabela-base é coerente.
--
-- Caso especial: `v_referral_stats` agrega `referral_clicks`, que não
-- tinha policy de SELECT (só INSERT pra log anônimo). Sem SELECT policy,
-- a view com `security_invoker` retornaria zero clicks pra user logado.
-- Adicionamos uma policy SELECT que permite ao dono do código de
-- referral ler suas próprias clicks (`code` casa com `profiles.referral_code`
-- do auth.uid()).

-- 1. Permite o owner do código de referral ler suas próprias clicks.
-- Necessário pra que v_referral_stats funcione com security_invoker.
DROP POLICY IF EXISTS "Users can read their own referral clicks" ON public.referral_clicks;
CREATE POLICY "Users can read their own referral clicks"
ON public.referral_clicks
FOR SELECT
TO authenticated
USING (
  code IN (
    SELECT referral_code FROM public.profiles WHERE id = auth.uid()
  )
);

-- 2. Flipa as 7 views pra security_invoker.
-- ALTER VIEW ... SET é idempotente, então rodar de novo é seguro.
ALTER VIEW public.v_group_active_subscription   SET (security_invoker = true);
ALTER VIEW public.expense_balance_per_user      SET (security_invoker = true);
ALTER VIEW public.v_active_coupons              SET (security_invoker = true);
ALTER VIEW public.v_referral_stats              SET (security_invoker = true);
ALTER VIEW public.child_current_status          SET (security_invoker = true);
ALTER VIEW public.v_early_bird_slots_remaining  SET (security_invoker = true);
ALTER VIEW public.user_health_score             SET (security_invoker = true);

-- 3. Sanity check (informativo no log da migration).
DO $$
DECLARE
  v RECORD;
  invoker_count INT := 0;
BEGIN
  FOR v IN
    SELECT c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname='public'
      AND c.relkind='v'
      AND c.relname IN (
        'v_group_active_subscription','expense_balance_per_user',
        'v_active_coupons','v_referral_stats','child_current_status',
        'v_early_bird_slots_remaining','user_health_score'
      )
      AND EXISTS (
        SELECT 1 FROM unnest(c.reloptions) AS opt
        WHERE opt = 'security_invoker=true'
      )
  LOOP
    invoker_count := invoker_count + 1;
  END LOOP;
  RAISE NOTICE 'security_invoker enabled on % of 7 views', invoker_count;
END $$;
