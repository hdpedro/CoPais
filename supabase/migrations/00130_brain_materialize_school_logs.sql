-- ============================================================
-- MIGRATION 130: Kindar Brain — materializar PROVAS na aba Escola
--
-- Ajuste de ALVO (dono pegou a aba Escola vazia): o Brain criava as provas
-- em `child_activities` (só Calendário), mas a aba Escola (/escola) lê
-- `school_logs`. Agora a foto de calendário vira `school_logs` (subtype
-- 'exam'/'homework') + espelho no Calendário via `events` — onde a família
-- procura. `child_activities` deixa de ser usada pra prova (sem duplicação:
-- calendar_occurrences nasce só de child_activities; a prova entra só via
-- events). A infra de lembrete da véspera vem na 00131 (cron próprio).
--
-- Duas RPCs reescritas (CREATE OR REPLACE — preserva grants/ACL):
--   1. brain_intake_execute_plan — materializa school_logs + events +
--      proveniência (entity_type='school_log') + outbox, TUDO atômico.
--   2. brain_intake_apply_undo — deleta school_logs (CASCADE limpa events).
-- ============================================================

-- ─── 1. execução: school_logs + espelho events ──────────────
CREATE OR REPLACE FUNCTION public.brain_intake_execute_plan(
  p_intake_id UUID,
  p_plan_hash TEXT,
  p_token UUID,
  p_activities JSONB,
  p_outbox JSONB DEFAULT '[]'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $f$
DECLARE
  v public.brain_intakes;
  v_log_id UUID;
  v_ids UUID[] := '{}';
  v_count INT := 0;
  a JSONB;
  ob JSONB;
BEGIN
  -- Claim atômico na MESMA transação (reusa o guard testado). 2ª confirmação
  -- concorrente / hash divergente / token errado / expirado → id NULL.
  v := public.brain_intake_claim_execution(p_intake_id, p_plan_hash, p_token);
  IF v.id IS NULL THEN
    RETURN jsonb_build_object('outcome', 'not_claimed');
  END IF;

  -- Materializa cada prova como school_log (aba Escola) + espelho events
  -- (Calendário) + proveniência (append-only). Falha em qualquer insert
  -- reverte TUDO (inclusive o claim → volta a awaiting_confirmation).
  FOR a IN SELECT value FROM jsonb_array_elements(coalesce(p_activities, '[]'::jsonb)) LOOP
    -- 1.1 school_log — o que a aba Escola lista. child_id é NOT NULL (o app
    -- valida em validate-plan.ts; cast direto, e um inválido aborta a tx com
    -- segurança em vez de inserir lixo).
    INSERT INTO public.school_logs(
      group_id, child_id, log_type, title, description, log_date, logged_by, subject, score, priority
    ) VALUES (
      v.group_id,
      (a->>'child_id')::uuid,
      (a->>'log_type')::school_log_type,
      a->>'title',
      a->>'description',
      (a->>'log_date')::date,
      v.created_by,
      a->>'subject',
      NULL,
      coalesce(a->>'priority', 'info')::collab_priority
    ) RETURNING id INTO v_log_id;

    -- 1.2 espelho no Calendário (events) — exam/homework são EVENT subtypes.
    -- event_time é TEXT ("HH:MM"), sem cast ::time. all_day quando sem hora.
    INSERT INTO public.events(
      group_id, child_id, title, description, event_date, event_time, all_day, created_by, school_log_id
    ) VALUES (
      v.group_id,
      (a->>'child_id')::uuid,
      a->>'calendar_title',
      a->>'description',
      (a->>'log_date')::date,
      nullif(a->>'event_time', ''),
      (nullif(a->>'event_time', '') IS NULL),
      v.created_by,
      v_log_id
    );

    v_count := v_count + 1;
    v_ids := v_ids || v_log_id;

    -- 1.3 proveniência: 1 artefato por prova (entity='school_log'). O espelho
    -- events some via CASCADE (events.school_log_id ON DELETE CASCADE) no undo.
    INSERT INTO public.brain_intake_artifacts(intake_id, group_id, entity_type, entity_id, original_payload_hash)
    VALUES (p_intake_id, v.group_id, 'school_log', v_log_id, coalesce(a->>'payload_hash', ''));
  END LOOP;

  -- Outbox na MESMA transação; idempotente por dedupe_key (retry não duplica).
  FOR ob IN SELECT value FROM jsonb_array_elements(coalesce(p_outbox, '[]'::jsonb)) LOOP
    INSERT INTO public.brain_outbox(group_id, intake_id, event_type, dedupe_key, payload)
    VALUES (v.group_id, p_intake_id, ob->>'event_type', ob->>'dedupe_key', coalesce(ob->'payload', '{}'::jsonb))
    ON CONFLICT (dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING;
  END LOOP;

  INSERT INTO public.brain_intake_audit(intake_id, group_id, actor_id, action, detail)
  VALUES (p_intake_id, v.group_id, auth.uid(), 'executed', jsonb_build_object('created_count', v_count));

  UPDATE public.brain_intakes
     SET status = 'executed', executed_at = now(),
         retention_expiry = now() + interval '90 days', updated_at = now()
   WHERE id = p_intake_id;

  RETURN jsonb_build_object('outcome', 'executed', 'created_count', v_count, 'activity_ids', to_jsonb(v_ids));
END;
$f$;

-- ─── 2. undo: deleta school_logs (CASCADE limpa events) ──────
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

  -- Remove: só school_logs que são artefato DESTE intake (blast-radius).
  -- events.school_log_id ON DELETE CASCADE limpa o espelho do Calendário.
  WITH del AS (
    DELETE FROM public.school_logs sl
     USING public.brain_intake_artifacts a
     WHERE a.intake_id = p_intake_id
       AND a.entity_type = 'school_log'
       AND a.entity_id = sl.id
       AND sl.id = ANY(coalesce(p_delete_entity_ids, '{}'::uuid[]))
     RETURNING sl.id
  )
  UPDATE public.brain_intake_artifacts
     SET undone_at = now()
   WHERE intake_id = p_intake_id
     AND entity_id IN (SELECT id FROM del);
  GET DIAGNOSTICS v_removed = ROW_COUNT;

  -- Cancela a coordenação ainda não entregue (não avisar prova desfeita).
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
