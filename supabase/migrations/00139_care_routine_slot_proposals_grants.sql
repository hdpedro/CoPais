-- ============================================================
-- MIGRATION 139: grants da care_routine_slot_proposals (correção da 00138)
--
-- A 00138 criou a tabela com RLS + policy de SELECT, mas SEM os GRANTs de
-- tabela — e policy só filtra DEPOIS do privilégio existir. Resultado
-- observado em prod: PostgREST 403 no SELECT do card ("Propostas de
-- rotina" nunca aparecia; o service fail-open devolvia []).
--
-- Governança preservada: authenticated SÓ LÊ (as escritas continuam
-- exclusivas das RPCs SECURITY DEFINER); anon segue sem nada.
-- ============================================================
GRANT SELECT ON public.care_routine_slot_proposals TO authenticated;
GRANT ALL ON public.care_routine_slot_proposals TO service_role;
NOTIFY pgrst, 'reload schema';
