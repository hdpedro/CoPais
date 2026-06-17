-- Bug C (tester Murilo, 2026-06-15): mudar a "Forma da família" (arrangement)
-- mostrava toast de "atualizado" mas nada persistia no Native. Causa:
-- coparenting_groups tem RLS ON mas NENHUMA policy de UPDATE — o update direto
-- via JWT do usuário (Native familia/index.tsx) era filtrado silenciosamente
-- (0 linhas, error=null). O PWA "funcionava" porque setFamilyArrangement usa
-- admin client (service_role, bypassa RLS). 6º caso do padrão PWA<->Native.
--
-- Fix por COLUNA (segurança): o grant table-level de UPDATE expunha
-- paywall_enforced e is_test_fixture — uma policy de UPDATE ampla deixaria um
-- admin furar o paywall. Revoga o UPDATE amplo e concede só as colunas de
-- configuração que o cliente legitimamente edita (todos os sites client-side
-- tocam apenas arrangement/custody_enabled). Policy limita a admins do grupo.

REVOKE UPDATE ON public.coparenting_groups FROM anon, authenticated;

GRANT UPDATE (name, arrangement, custody_enabled)
  ON public.coparenting_groups TO authenticated;

DROP POLICY IF EXISTS "Group admins can update safe settings" ON public.coparenting_groups;
CREATE POLICY "Group admins can update safe settings"
  ON public.coparenting_groups
  FOR UPDATE
  USING (public.is_group_admin(id))
  WITH CHECK (public.is_group_admin(id));
