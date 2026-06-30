-- ============================================================
-- MIGRATION 129: Kindar Brain — undo cancela a coordenação pendente
--
-- Bug pego no E2E real em prod: o undo removia as atividades e marcava o
-- intake 'undone', MAS não tocava no brain_outbox. A linha de coordenação
-- seguia 'pending' e o worker (cron) entregava um push de "provas
-- adicionadas" ~segundos depois do undo — avisando o coparente de provas
-- que não existem mais. "Undo seguro" (critério do A0) exige anular isso.
--
-- Correção (defesa em profundidade; a guarda no worker vem no código):
--   1. status 'cancelled' no brain_outbox (coordenação anulada por undo).
--   2. brain_intake_apply_undo cancela as linhas ainda-não-entregues do
--      intake (pending/failed/delivering → cancelled) na MESMA transação
--      do undo. O claim do worker já só pega pending/failed/delivering,
--      então linhas 'cancelled' nunca mais são reivindicadas.
-- ============================================================

-- ─── 1. status 'cancelled' no outbox ─────────────────────────
ALTER TABLE public.brain_outbox DROP CONSTRAINT IF EXISTS brain_outbox_status_check;
ALTER TABLE public.brain_outbox
  ADD CONSTRAINT brain_outbox_status_check
  CHECK (status IN ('pending','delivering','delivered','failed','dead','cancelled'));

-- ─── 2. undo agora também cancela o outbox pendente do intake ─
CREATE OR REPLACE FUNCTION public.brain_intake_apply_undo(
  p_intake_id UUID,
  p_delete_entity_ids UUID[],
  p_detach_artifact_ids UUID[]
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $f$
DECLARE
  g UUID;
  v_removed INT := 0;
  v_detached INT := 0;
  v_cancelled INT := 0;
BEGIN
  SELECT group_id INTO g FROM public.brain_intakes WHERE id = p_intake_id;
  IF g IS NULL OR NOT public.is_group_member(g) THEN
    RETURN jsonb_build_object('outcome', 'forbidden');
  END IF;

  -- Detach: preserva o que foi editado depois (artefato fica, só marca).
  UPDATE public.brain_intake_artifacts
     SET detached_at = now()
   WHERE intake_id = p_intake_id
     AND id = ANY(coalesce(p_detach_artifact_ids, '{}'::uuid[]))
     AND detached_at IS NULL;
  GET DIAGNOSTICS v_detached = ROW_COUNT;

  -- Remove: só child_activities que são artefato DESTE intake (blast-radius).
  -- O CASCADE de child_activities apaga checklist + calendar_occurrences.
  WITH del AS (
    DELETE FROM public.child_activities ca
     USING public.brain_intake_artifacts a
     WHERE a.intake_id = p_intake_id
       AND a.entity_type = 'child_activity'
       AND a.entity_id = ca.id
       AND ca.id = ANY(coalesce(p_delete_entity_ids, '{}'::uuid[]))
     RETURNING ca.id
  )
  UPDATE public.brain_intake_artifacts
     SET undone_at = now()
   WHERE intake_id = p_intake_id
     AND entity_id IN (SELECT id FROM del);
  GET DIAGNOSTICS v_removed = ROW_COUNT;

  -- Cancela a coordenação ainda não entregue: o worker não deve avisar
  -- sobre provas desfeitas. Linhas já 'delivered'/'dead' não mudam.
  UPDATE public.brain_outbox
     SET status = 'cancelled', last_error = 'intake_undone'
   WHERE intake_id = p_intake_id
     AND status IN ('pending', 'failed', 'delivering');
  GET DIAGNOSTICS v_cancelled = ROW_COUNT;

  UPDATE public.brain_intakes SET status = 'undone', updated_at = now() WHERE id = p_intake_id;

  INSERT INTO public.brain_intake_audit(intake_id, group_id, actor_id, action, detail)
  VALUES (p_intake_id, g, auth.uid(), 'undone',
          jsonb_build_object('removed', v_removed, 'detached', v_detached, 'cancelled_outbox', v_cancelled));

  RETURN jsonb_build_object('outcome', 'undone', 'removed', v_removed, 'detached', v_detached, 'cancelled_outbox', v_cancelled);
END;
$f$;

REVOKE EXECUTE ON FUNCTION public.brain_intake_apply_undo(UUID, UUID[], UUID[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.brain_intake_apply_undo(UUID, UUID[], UUID[]) TO authenticated;
