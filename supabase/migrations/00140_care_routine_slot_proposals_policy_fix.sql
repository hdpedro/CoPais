-- ============================================================
-- MIGRATION 140: policy da care_routine_slot_proposals no padrão canônico
--
-- A 00138 escreveu a policy com is_group_member(group_id, auth.uid()) —
-- o overload de 2 args existe SÓ pro uso interno das RPCs SECURITY
-- DEFINER e NUNCA teve GRANT pra authenticated. Resultado: 42501
-- (permission denied for function) → PostgREST 403 → card invisível.
-- TODAS as demais policies do projeto usam o overload de 1 arg
-- is_group_member(group_id), definer e granted — esta passa a usar o
-- mesmo (menor superfície: o de 2 args segue interno).
-- ============================================================
DROP POLICY IF EXISTS care_slot_proposals_select ON public.care_routine_slot_proposals;
CREATE POLICY care_slot_proposals_select ON public.care_routine_slot_proposals
  FOR SELECT USING (public.is_group_member(group_id));
NOTIFY pgrst, 'reload schema';
