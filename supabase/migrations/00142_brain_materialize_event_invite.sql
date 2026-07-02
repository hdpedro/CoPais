-- ============================================================
-- MIGRATION 142: Kindar Brain — materializar CONVITES (event_invite, C2)
--
-- Foto/texto de convite confirmado → INSERT na tabela `events`
-- EXISTENTE, ATOMICAMENTE com proveniência + outbox + audit (molde das
-- 00131/00137/00141). ESPELHO DO FORM Novo Evento: multi-dia chega do
-- app como UMA LINHA POR DIA ("Título (i/N)", end_date preenchido);
-- event_time TEXT ("15:00" ou "15:00 - 18:00"); sem responsável fixo
-- (assigned_to null — convite não diz quem leva); status 'active';
-- created_by = quem narrou/confirmou.
--
-- Undo (brain_intake_apply_undo_invite): lê a própria proveniência e
-- DELETA os eventos deste intake. `events` não tem updated_at → não dá
-- pra detectar edição posterior (detach do escolar não se aplica);
-- janela de undo é curta e o preview foi confirmado — delete direto,
-- documentado. Cancela outbox não entregue.
-- ============================================================

-- ─── 1. execução ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.brain_intake_execute_invite_plan(
  p_intake_id UUID,
  p_plan_hash TEXT,
  p_token UUID,
  p_events JSONB DEFAULT '[]'::jsonb,
  p_outbox JSONB DEFAULT '[]'::jsonb,
  p_actor_user_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $f$
DECLARE
  v public.brain_intakes;
  v_actor UUID;
  v_id UUID;
  v_count INT := 0;
  a JSONB;
  ob JSONB;
BEGIN
  v := public.brain_intake_claim_execution(p_intake_id, p_plan_hash, p_token, p_actor_user_id);
  IF v.id IS NULL THEN
    RETURN jsonb_build_object('outcome', 'not_claimed');
  END IF;
  v_actor := coalesce(auth.uid(), p_actor_user_id);

  FOR a IN SELECT value FROM jsonb_array_elements(coalesce(p_events, '[]'::jsonb)) LOOP
    INSERT INTO public.events(
      group_id, child_id, title, description, event_date, end_date,
      event_time, all_day, location, status, created_by
    ) VALUES (
      v.group_id,
      (nullif(a->>'child_id', ''))::uuid,
      a->>'title',
      nullif(a->>'description', ''),
      (a->>'event_date')::date,
      (nullif(a->>'end_date', ''))::date,
      nullif(a->>'event_time', ''),
      coalesce((a->>'all_day')::boolean, false),
      nullif(a->>'location', ''),
      'active',
      v.created_by
    ) RETURNING id INTO v_id;

    v_count := v_count + 1;
    INSERT INTO public.brain_intake_artifacts(intake_id, group_id, entity_type, entity_id, original_payload_hash)
    VALUES (p_intake_id, v.group_id, 'event', v_id, coalesce(a->>'payload_hash', ''));
  END LOOP;

  -- Outbox na MESMA transação; idempotente por dedupe_key.
  FOR ob IN SELECT value FROM jsonb_array_elements(coalesce(p_outbox, '[]'::jsonb)) LOOP
    INSERT INTO public.brain_outbox(group_id, intake_id, event_type, dedupe_key, payload)
    VALUES (v.group_id, p_intake_id, ob->>'event_type', ob->>'dedupe_key', coalesce(ob->'payload', '{}'::jsonb))
    ON CONFLICT (dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING;
  END LOOP;

  INSERT INTO public.brain_intake_audit(intake_id, group_id, actor_id, action, detail)
  VALUES (p_intake_id, v.group_id, v_actor, 'executed', jsonb_build_object('events', v_count));

  UPDATE public.brain_intakes
     SET status = 'executed', executed_at = now(),
         retention_expiry = now() + interval '90 days', updated_at = now()
   WHERE id = p_intake_id;

  RETURN jsonb_build_object('outcome', 'executed', 'created_count', v_count);
END;
$f$;

-- ─── 2. undo: delete por proveniência ────────────────────────────────
CREATE OR REPLACE FUNCTION public.brain_intake_apply_undo_invite(
  p_intake_id UUID,
  p_actor_user_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $f$
DECLARE
  g UUID;
  v_actor UUID;
  v_removed INT := 0;
  v_cancelled INT := 0;
  n INT;
BEGIN
  SELECT group_id INTO g FROM public.brain_intakes WHERE id = p_intake_id;
  v_actor := coalesce(auth.uid(), p_actor_user_id);
  IF g IS NULL OR NOT public.is_group_member(g, v_actor) THEN
    RETURN jsonb_build_object('outcome', 'forbidden');
  END IF;

  WITH del AS (
    DELETE FROM public.events e USING public.brain_intake_artifacts ar
     WHERE ar.intake_id = p_intake_id AND ar.entity_type = 'event'
       AND ar.undone_at IS NULL AND ar.entity_id = e.id
     RETURNING e.id
  )
  UPDATE public.brain_intake_artifacts SET undone_at = now()
   WHERE intake_id = p_intake_id AND entity_id IN (SELECT id FROM del);
  GET DIAGNOSTICS n = ROW_COUNT; v_removed := v_removed + n;

  -- Artefato cujo evento já foi apagado no app → só marca.
  UPDATE public.brain_intake_artifacts ar SET undone_at = now()
   WHERE ar.intake_id = p_intake_id AND ar.entity_type = 'event'
     AND ar.undone_at IS NULL
     AND NOT EXISTS (SELECT 1 FROM public.events e WHERE e.id = ar.entity_id);

  UPDATE public.brain_outbox
     SET status = 'cancelled', last_error = 'intake_undone'
   WHERE intake_id = p_intake_id AND status IN ('pending', 'failed', 'delivering');
  GET DIAGNOSTICS v_cancelled = ROW_COUNT;

  UPDATE public.brain_intakes SET status = 'undone', updated_at = now() WHERE id = p_intake_id;

  INSERT INTO public.brain_intake_audit(intake_id, group_id, actor_id, action, detail)
  VALUES (p_intake_id, g, v_actor, 'undone',
          jsonb_build_object('removed', v_removed, 'cancelled_outbox', v_cancelled));

  RETURN jsonb_build_object('outcome', 'undone', 'removed', v_removed,
                            'kept_agreements', 0, 'cancelled_outbox', v_cancelled);
END;
$f$;

-- ─── 3. grants: anon REVOGADO ────────────────────────────────────────
REVOKE ALL ON FUNCTION public.brain_intake_execute_invite_plan(UUID, TEXT, UUID, JSONB, JSONB, UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.brain_intake_apply_undo_invite(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.brain_intake_execute_invite_plan(UUID, TEXT, UUID, JSONB, JSONB, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.brain_intake_apply_undo_invite(UUID, UUID) TO authenticated, service_role;
