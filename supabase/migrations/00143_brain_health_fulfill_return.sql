-- ============================================================
-- MIGRATION 143: Memória da Família M2 — a consulta nova FECHA o retorno
--
-- M1 mostra "há um retorno marcado pra {date} — esta consulta pode ser
-- ele" (followup_candidate, com relatedRecordId = a consulta antiga que
-- carrega o return_date). M2 fecha o laço: ao CONFIRMAR a consulta nova,
-- o retorno antigo é marcado como CUMPRIDO — com proveniência (artefato
-- 'return_fulfillment') e revertido pelo undo do próprio intake.
--
-- RPC SEPARADA (não mexe na assinatura da execute_health_plan LIVE —
-- adicionar param com DEFAULT criaria OVERLOAD, não replace). Chamada
-- não-atômica APÓS o execute: se falhar, o retorno só continua em aberto
-- (benigno). Undo de saúde: MESMA assinatura → replace verdadeiro.
-- ============================================================

-- ─── 1. colunas de cumprimento ───────────────────────────────────────
ALTER TABLE public.medical_appointments
  ADD COLUMN IF NOT EXISTS return_fulfilled_by UUID NULL REFERENCES public.medical_appointments(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS return_fulfilled_at TIMESTAMPTZ NULL;

-- ─── 2. cumprir o retorno (chamada pós-execute, idempotente) ─────────
CREATE OR REPLACE FUNCTION public.brain_health_fulfill_return(
  p_intake_id UUID,
  p_return_id UUID,
  p_actor_user_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $f$
DECLARE
  g UUID;
  v_actor UUID;
  v_new UUID;
  n INT := 0;
BEGIN
  SELECT group_id INTO g FROM public.brain_intakes WHERE id = p_intake_id AND status = 'executed';
  v_actor := coalesce(auth.uid(), p_actor_user_id);
  IF g IS NULL OR NOT public.is_group_member(g, v_actor) THEN
    RETURN jsonb_build_object('outcome', 'forbidden');
  END IF;

  -- A consulta NOVA criada por este intake (qualquer uma serve de "by").
  SELECT entity_id INTO v_new FROM public.brain_intake_artifacts
   WHERE intake_id = p_intake_id AND entity_type = 'medical_appointment' AND undone_at IS NULL
   LIMIT 1;

  UPDATE public.medical_appointments
     SET return_fulfilled_by = v_new, return_fulfilled_at = now()
   WHERE id = p_return_id AND group_id = g
     AND return_date IS NOT NULL AND return_fulfilled_at IS NULL;
  GET DIAGNOSTICS n = ROW_COUNT;

  IF n > 0 THEN
    INSERT INTO public.brain_intake_artifacts(intake_id, group_id, entity_type, entity_id, original_payload_hash)
    VALUES (p_intake_id, g, 'return_fulfillment', p_return_id, '');
    INSERT INTO public.brain_intake_audit(intake_id, group_id, actor_id, action, detail)
    VALUES (p_intake_id, g, v_actor, 'return_fulfilled',
            jsonb_build_object('return_id', p_return_id, 'fulfilled_by', v_new));
  END IF;

  RETURN jsonb_build_object('outcome', 'ok', 'fulfilled', n);
END;
$f$;

-- ─── 3. undo de saúde REVERTE o cumprimento (mesma assinatura) ───────
CREATE OR REPLACE FUNCTION public.brain_intake_apply_undo_health(
  p_intake_id UUID,
  p_delete_entity_ids UUID[],
  p_detach_artifact_ids UUID[],
  p_actor_user_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $f$
DECLARE
  g UUID;
  v_actor UUID;
  v_removed INT := 0;
  v_detached INT := 0;
  v_cancelled INT := 0;
  n INT;
BEGIN
  SELECT group_id INTO g FROM public.brain_intakes WHERE id = p_intake_id;
  v_actor := coalesce(auth.uid(), p_actor_user_id);
  IF g IS NULL OR NOT public.is_group_member(g, v_actor) THEN
    RETURN jsonb_build_object('outcome', 'forbidden');
  END IF;

  -- Detach: preserva o que foi editado depois (artefato fica, só marca).
  UPDATE public.brain_intake_artifacts
     SET detached_at = now()
   WHERE intake_id = p_intake_id
     AND id = ANY(coalesce(p_detach_artifact_ids, '{}'::uuid[]))
     AND detached_at IS NULL;
  GET DIAGNOSTICS v_detached = ROW_COUNT;

  -- M2: desfazer a consulta REABRE o retorno que ela tinha cumprido.
  WITH rev AS (
    UPDATE public.medical_appointments m
       SET return_fulfilled_by = NULL, return_fulfilled_at = NULL
      FROM public.brain_intake_artifacts ar
     WHERE ar.intake_id = p_intake_id AND ar.entity_type = 'return_fulfillment'
       AND ar.undone_at IS NULL AND m.id = ar.entity_id
     RETURNING ar.id AS artifact_id
  )
  UPDATE public.brain_intake_artifacts SET undone_at = now()
   WHERE id IN (SELECT artifact_id FROM rev);

  -- Remove, por tipo, SÓ o que é artefato DESTE intake e está em delete_ids.
  WITH del AS (
    DELETE FROM public.active_medications m USING public.brain_intake_artifacts ar
     WHERE ar.intake_id = p_intake_id AND ar.entity_type = 'active_medication'
       AND ar.entity_id = m.id AND m.id = ANY(coalesce(p_delete_entity_ids, '{}'::uuid[]))
     RETURNING m.id
  )
  UPDATE public.brain_intake_artifacts SET undone_at = now()
   WHERE intake_id = p_intake_id AND entity_id IN (SELECT id FROM del);
  GET DIAGNOSTICS n = ROW_COUNT; v_removed := v_removed + n;

  WITH del AS (
    DELETE FROM public.medical_appointments ap USING public.brain_intake_artifacts ar
     WHERE ar.intake_id = p_intake_id AND ar.entity_type = 'medical_appointment'
       AND ar.entity_id = ap.id AND ap.id = ANY(coalesce(p_delete_entity_ids, '{}'::uuid[]))
     RETURNING ap.id
  )
  UPDATE public.brain_intake_artifacts SET undone_at = now()
   WHERE intake_id = p_intake_id AND entity_id IN (SELECT id FROM del);
  GET DIAGNOSTICS n = ROW_COUNT; v_removed := v_removed + n;

  WITH del AS (
    DELETE FROM public.illness_episodes e USING public.brain_intake_artifacts ar
     WHERE ar.intake_id = p_intake_id AND ar.entity_type = 'illness_episode'
       AND ar.entity_id = e.id AND e.id = ANY(coalesce(p_delete_entity_ids, '{}'::uuid[]))
     RETURNING e.id
  )
  UPDATE public.brain_intake_artifacts SET undone_at = now()
   WHERE intake_id = p_intake_id AND entity_id IN (SELECT id FROM del);
  GET DIAGNOSTICS n = ROW_COUNT; v_removed := v_removed + n;

  -- Cancela a coordenação ainda não entregue (não avisar consulta desfeita).
  UPDATE public.brain_outbox
     SET status = 'cancelled', last_error = 'intake_undone'
   WHERE intake_id = p_intake_id AND status IN ('pending', 'failed', 'delivering');
  GET DIAGNOSTICS v_cancelled = ROW_COUNT;

  UPDATE public.brain_intakes SET status = 'undone', updated_at = now() WHERE id = p_intake_id;

  INSERT INTO public.brain_intake_audit(intake_id, group_id, actor_id, action, detail)
  VALUES (p_intake_id, g, v_actor, 'undone',
          jsonb_build_object('removed', v_removed, 'detached', v_detached, 'cancelled_outbox', v_cancelled));

  RETURN jsonb_build_object('outcome', 'undone', 'removed', v_removed, 'detached', v_detached, 'cancelled_outbox', v_cancelled);
END;
$f$;

-- ─── 4. grants: anon REVOGADO ────────────────────────────────────────
REVOKE ALL ON FUNCTION public.brain_health_fulfill_return(UUID, UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.brain_health_fulfill_return(UUID, UUID, UUID) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.brain_intake_apply_undo_health(UUID, UUID[], UUID[], UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.brain_intake_apply_undo_health(UUID, UUID[], UUID[], UUID) TO authenticated, service_role;
