-- ============================================================
-- MIGRATION 133: ator EXPLÍCITO no brain_intake_begin_analysis
--
-- Bug achado no 1º E2E real do dono via WhatsApp: a foto (calendário) era
-- classificada certo e o intake criado, mas ficava PRESO em status='uploaded'
-- (has_plan=false) → "Não consegui processar agora". Causa: begin_analysis
-- (uploaded→analyzing) usa is_group_member(group_id) = auth.uid(); sob o client
-- SERVICE_ROLE do processor do WhatsApp, auth.uid() é NULL → 0 linhas → a
-- análise NUNCA começa → analyzeIntakeImage devolve already_processing → erro.
--
-- A 00132 corrigiu confirm/undo (claim/execute_plan/apply_undo) com ator
-- explícito, mas o lado da ANÁLISE (begin_analysis) ficou de fora (o caminho
-- WhatsApp não estava E2E'd na época). Mesmo padrão à prova de impersonation:
--     v_actor := coalesce(auth.uid(), p_actor_user_id)
-- auth.uid() do chamador SEMPRE vence quando existe (PWA/Native byte-idêntico);
-- o param só é confiado sob service_role (server confiável = processor WhatsApp).
--
-- DROP+CREATE (muda assinatura). Idempotente (dropa antiga E nova). Re-grants
-- exatos (authenticated + service_role; sem anon/public).
-- ============================================================

DROP FUNCTION IF EXISTS public.brain_intake_begin_analysis(uuid);
DROP FUNCTION IF EXISTS public.brain_intake_begin_analysis(uuid, uuid);

CREATE FUNCTION public.brain_intake_begin_analysis(p_intake_id uuid, p_actor_user_id uuid DEFAULT NULL)
 RETURNS brain_intakes
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE r public.brain_intakes; v_actor uuid;
BEGIN
  v_actor := coalesce(auth.uid(), p_actor_user_id);
  IF v_actor IS NULL THEN RETURN r; END IF;  -- sem ator → nada iniciado
  UPDATE public.brain_intakes
     SET status = 'analyzing', updated_at = now()
   WHERE id = p_intake_id
     AND status IN ('uploaded', 'analyzed', 'failed')
     AND public.is_group_member(group_id, v_actor)
  RETURNING * INTO r;
  RETURN r;
END;
$function$;

REVOKE ALL ON FUNCTION public.brain_intake_begin_analysis(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.brain_intake_begin_analysis(uuid, uuid) TO authenticated, service_role;
