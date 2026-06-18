-- ============================================================
-- Migration 00122: Fecha exposição de views públicas (advisors ERROR)
-- ============================================================
--
-- O linter de segurança do Supabase (advisors) apontou 5 erros, todos
-- level=ERROR / category=SECURITY:
--   1× auth_users_exposed   → v_signup_funnel_health exposta a `anon`
--   4× security_definer_view → v_signup_funnel_health, custody_resolved,
--      child_vaccine_coverage, v_group_active_subscription
--
-- POR QUE ISSO É GRAVE
--   Views SECURITY DEFINER executam a query com as permissões e RLS do
--   CRIADOR (postgres, dono das tabelas) — não do usuário que consulta.
--   Como postgres é dono das tabelas-base, a RLS delas é IGNORADA. Somado
--   ao GRANT default do Supabase (ALL para anon/authenticated em todo objeto
--   do schema public), QUALQUER portador da `anon key` (que viaja embutida
--   no PWA e no app nativo) conseguia ler via PostgREST, cross-tenant:
--     - custody_resolved             → agenda de guarda de TODAS as famílias
--     - child_vaccine_coverage       → cobertura vacinal (dado médico) idem
--     - v_group_active_subscription  → status de assinatura/billing idem
--   Vazamento de dado sensível de todas as famílias. Severidade ALTA.
--
--   v_signup_funnel_health agrega `auth.users` (apenas CONTAGENS — nenhuma
--   coluna de PII é projetada) e é consumida SOMENTE pelo backend
--   (src/app/admin/metrics/page.tsx + src/app/api/cron/signup-rescue),
--   ambos via createAdminClient (service_role). anon/authenticated jamais
--   precisam alcançá-la.
--
-- CAUSA RAIZ DA REGRESSÃO DE v_group_active_subscription
--   A migration 00076 já havia setado security_invoker nessa view. A 00096
--   (is_sandbox) fez DROP VIEW + CREATE VIEW para adicionar o filtro
--   `is_sandbox = false` e NÃO re-aplicou a opção — reverteu a view para
--   DEFINER. Lição: toda migration que recria uma view DEVE re-incluir
--   `security_invoker`. (custody_resolved/child_vaccine_coverage nasceram
--   depois da 00076 e nunca tiveram a opção.)
--
-- EVIDÊNCIA COLETADA ANTES DESTA MIGRATION
--   - RLS habilitada + policy de SELECT por grupo nas tabelas-base:
--       custody_events            → SELECT USING is_group_member(group_id)
--       subscriptions             → SELECT (group member via group_members
--                                    OU user_id = auth.uid())
--       vaccine_recommended_doses → SELECT USING is_group_member(group_id)
--       vaccine_catalog           → SELECT authenticated USING true
--     Logo, com security_invoker o membro do grupo continua lendo o que é
--     dele; anon (sem auth.uid()) não lê nada.
--   - has_table_privilege('service_role','auth.users','SELECT') = FALSE
--     (só `postgres` tem). Por isso v_signup_funnel_health PERMANECE
--     SECURITY DEFINER: flipar para invoker faria a view rodar como o
--     service_role chamador, que não enxerga auth.users → zeraria o painel
--     admin. O risco real é eliminado revogando anon/authenticated; a view
--     fica acessível apenas ao backend (postgres/service_role).
--   - get_dashboard_payload é SECURITY DEFINER (roda como postgres) e filtra
--     por group_id internamente; segue funcionando com as views em invoker.
--
-- Idempotente: ALTER VIEW ... SET, REVOKE e GRANT podem rodar de novo.

-- 1) Views de dado familiar → security_invoker (passam a respeitar a RLS
--    do usuário que consulta). Fecha 3 dos 4 security_definer_view.
ALTER VIEW public.custody_resolved             SET (security_invoker = true);
ALTER VIEW public.child_vaccine_coverage       SET (security_invoker = true);
ALTER VIEW public.v_group_active_subscription  SET (security_invoker = true);

-- 2) Least-privilege nos GRANTs das views de família.
--    Essas views não são atualizáveis (têm GROUP BY/DISTINCT/window/LATERAL),
--    então os grants default de INSERT/UPDATE/DELETE/TRUNCATE/REFERENCES são
--    ruído inócuo — removemos. anon nunca lê dado familiar (clients são
--    sempre autenticados): revogamos seu SELECT também. authenticated mantém
--    SELECT, agora corretamente filtrado pela RLS das tabelas-base.
--    service_role é deixado intacto (backend confia no bypass de RLS).
REVOKE ALL ON public.custody_resolved            FROM anon, authenticated;
REVOKE ALL ON public.child_vaccine_coverage      FROM anon, authenticated;
REVOKE ALL ON public.v_group_active_subscription FROM anon, authenticated;

GRANT SELECT ON public.custody_resolved            TO authenticated;
GRANT SELECT ON public.child_vaccine_coverage      TO authenticated;
GRANT SELECT ON public.v_group_active_subscription TO authenticated;

-- 3) v_signup_funnel_health: view de observabilidade admin-only.
--    Fecha auth_users_exposed revogando anon + authenticated. Permanece
--    SECURITY DEFINER de propósito (precisa rodar como postgres para ler
--    auth.users); agora SÓ o backend (postgres/service_role) a alcança.
--    O service_role já lê dados de usuário pela auth.admin API — não há
--    ampliação de superfície.
REVOKE ALL ON public.v_signup_funnel_health FROM anon, authenticated;

-- 4) Sanity check informativo no log da migration.
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n
  FROM pg_class c
  JOIN pg_namespace ns ON ns.oid = c.relnamespace
  WHERE ns.nspname = 'public'
    AND c.relkind = 'v'
    AND c.relname IN ('custody_resolved','child_vaccine_coverage','v_group_active_subscription')
    AND EXISTS (SELECT 1 FROM unnest(c.reloptions) o WHERE o = 'security_invoker=true');
  RAISE NOTICE 'security_invoker ativo em % de 3 views de família', n;
END $$;
