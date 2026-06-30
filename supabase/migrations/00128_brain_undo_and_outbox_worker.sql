-- ============================================================
-- MIGRATION 128: Kindar Brain — undo seguro + worker do outbox
--
--   1. brain_intake_apply_undo   — undo atômico (delete vs detach), com
--      blast-radius limitado aos artefatos DAQUELE intake.
--   2. brain_outbox_claim_batch  — claim concorrente (FOR UPDATE SKIP
--      LOCKED) pro worker entregar sem dois workers pegarem a mesma linha.
--
-- A DECISÃO de quê deletar (hash bate = intocado) vs detach (hash diverge
-- = editado depois) é feita no app (recompõe o activityPayloadHash da linha
-- viva e compara) — aqui só APLICA, atômico. O delete só atinge
-- child_activities que SÃO artefato deste intake (defesa). child_activities
-- ON DELETE CASCADE limpa checklist + calendar_occurrences.
-- ============================================================

-- ─── 1. undo atômico ─────────────────────────────────────────
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

  UPDATE public.brain_intakes SET status = 'undone', updated_at = now() WHERE id = p_intake_id;

  INSERT INTO public.brain_intake_audit(intake_id, group_id, actor_id, action, detail)
  VALUES (p_intake_id, g, auth.uid(), 'undone', jsonb_build_object('removed', v_removed, 'detached', v_detached));

  RETURN jsonb_build_object('outcome', 'undone', 'removed', v_removed, 'detached', v_detached);
END;
$f$;

-- ─── 2. claim do outbox (worker) ─────────────────────────────
-- Reivindica até p_limit linhas devidas, marcando 'delivering', incrementando
-- attempts (crash no meio ainda conta a tentativa → DLQ, sem loop infinito) e
-- aplicando um LEASE (next_attempt_at = now()+15min). O lease faz duas coisas:
-- (a) uma linha recém-claimed não é re-pega por 15min; (b) se o worker cair
-- ANTES de finalizar, a linha presa em 'delivering' volta a ser devida após o
-- lease e é recuperada. SKIP LOCKED → dois workers não colidem. Delivery >15min
-- é implausível (push é segundos), então o risco de push duplo é desprezível.
CREATE OR REPLACE FUNCTION public.brain_outbox_claim_batch(p_limit INT DEFAULT 20)
RETURNS SETOF public.brain_outbox
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $f$
BEGIN
  RETURN QUERY
  UPDATE public.brain_outbox o
     SET status = 'delivering',
         attempts = o.attempts + 1,
         next_attempt_at = now() + interval '15 minutes'
   WHERE o.id IN (
     SELECT id FROM public.brain_outbox
      WHERE next_attempt_at <= now()
        AND status IN ('pending', 'failed', 'delivering')  -- 'delivering' = lease expirado (recovery)
      ORDER BY next_attempt_at
      FOR UPDATE SKIP LOCKED
      LIMIT GREATEST(p_limit, 1)
   )
  RETURNING o.*;
END;
$f$;

-- Grants: undo é do usuário (authenticated, anon revogado); o claim é
-- interno (só service_role — o worker roda com service_role).
REVOKE EXECUTE ON FUNCTION public.brain_intake_apply_undo(UUID, UUID[], UUID[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.brain_intake_apply_undo(UUID, UUID[], UUID[]) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.brain_outbox_claim_batch(INT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.brain_outbox_claim_batch(INT) TO service_role;
