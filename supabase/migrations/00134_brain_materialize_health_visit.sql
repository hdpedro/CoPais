-- ============================================================
-- MIGRATION 134: Kindar Brain — materializar CONSULTA MÉDICA (health_visit)
--
-- Ponte consulta → módulo Saúde EXISTENTE (não seção nova). O Brain de Saúde
-- materializa, ATOMICAMENTE, o que o médico já disse:
--   • a CONSULTA (medical_appointments, status 'completed' — fica no histórico
--     de Saúde; a grade do /calendario só mostra scheduled, então não polui);
--   • o RETORNO (medical_appointments, status 'scheduled', type 'retorno' —
--     é o que APARECE no calendário, sem tocar events/custody_events);
--   • o EPISÓDIO/diagnóstico (illness_episodes) — só se houve avaliação;
--   • as MEDICAÇÕES (active_medications) — dose/frequência = citação; o app
--     mandou "Conforme prescrição" quando o médico não deu explícito (o Brain
--     é TRANSPORTADOR, nunca inventa cadência); ligadas ao episódio se houver.
-- + proveniência (brain_intake_artifacts, entity_type medical_appointment/
--   active_medication/illness_episode) + outbox (coordenação pro coparente),
-- TUDO numa transação: falha em qualquer insert reverte TUDO (inclusive o claim
-- → volta a awaiting_confirmation).
--
-- Ator EXPLÍCITO (WhatsApp usa service_role → auth.uid() NULL): reusa o guard
-- brain_intake_claim_execution(..., p_actor_user_id) [00132]. anon REVOGADO.
--
-- Undo dedicado (brain_intake_apply_undo_health): deleta os 3 tipos por
-- proveniência (blast-radius), preserva o editado (detach), cancela a
-- coordenação não entregue. NÃO toca o undo escolar (isolado).
-- ============================================================

-- ─── 1. execução: consulta + retorno + episódio + medicações ─────────
CREATE OR REPLACE FUNCTION public.brain_intake_execute_health_plan(
  p_intake_id UUID,
  p_plan_hash TEXT,
  p_token UUID,
  p_appointments JSONB,
  p_medications JSONB DEFAULT '[]'::jsonb,
  p_episodes JSONB DEFAULT '[]'::jsonb,
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
  v_ids UUID[] := '{}';
  v_episode_id UUID := NULL;   -- 0 ou 1 episódio por consulta; medicações ligam nele
  v_appts INT := 0;
  v_meds INT := 0;
  a JSONB;
  ob JSONB;
BEGIN
  -- Claim atômico (reusa o guard testado, com ator explícito). 2ª confirmação
  -- concorrente / hash divergente / token errado / expirado / não-membro → NULL.
  v := public.brain_intake_claim_execution(p_intake_id, p_plan_hash, p_token, p_actor_user_id);
  IF v.id IS NULL THEN
    RETURN jsonb_build_object('outcome', 'not_claimed');
  END IF;
  v_actor := coalesce(auth.uid(), p_actor_user_id);

  -- 1.1 Episódio (0 ou 1) PRIMEIRO — as medicações ligam nele (illness_episode_id).
  FOR a IN SELECT value FROM jsonb_array_elements(coalesce(p_episodes, '[]'::jsonb)) LOOP
    INSERT INTO public.illness_episodes(
      group_id, child_id, title, symptoms, start_date, status, diagnosis, severity, priority, created_by
    ) VALUES (
      v.group_id,
      (a->>'child_id')::uuid,
      a->>'title',
      CASE WHEN a->'symptoms' IS NULL OR jsonb_typeof(a->'symptoms') <> 'array' THEN NULL
           ELSE ARRAY(SELECT jsonb_array_elements_text(a->'symptoms')) END,
      (a->>'start_date')::date,
      coalesce(a->>'status', 'active'),
      a->>'diagnosis',
      nullif(a->>'severity', ''),
      coalesce(a->>'priority', 'important')::collab_priority,
      v.created_by
    ) RETURNING id INTO v_episode_id;

    v_ids := v_ids || v_episode_id;
    INSERT INTO public.brain_intake_artifacts(intake_id, group_id, entity_type, entity_id, original_payload_hash)
    VALUES (p_intake_id, v.group_id, 'illness_episode', v_episode_id, coalesce(a->>'payload_hash', ''));
  END LOOP;

  -- 1.2 Consulta (completed) + Retorno (scheduled). appointment_date é TIMESTAMPTZ:
  -- compõe data + hora (meio-dia BRT quando sem hora) em fuso fixo -03:00.
  FOR a IN SELECT value FROM jsonb_array_elements(coalesce(p_appointments, '[]'::jsonb)) LOOP
    INSERT INTO public.medical_appointments(
      group_id, child_id, title, appointment_type, appointment_date, location,
      status, summary, notes, return_date, return_notes, priority, created_by
    ) VALUES (
      v.group_id,
      (a->>'child_id')::uuid,
      a->>'title',
      coalesce(a->>'appointment_type', 'rotina'),
      ((a->>'appointment_date') || 'T' || coalesce(nullif(a->>'appointment_time', ''), '12:00') || ':00-03:00')::timestamptz,
      a->>'location',
      coalesce(a->>'status', 'scheduled'),
      a->>'summary',
      a->>'notes',
      (nullif(a->>'return_date', ''))::date,
      a->>'return_notes',
      coalesce(a->>'priority', 'important')::collab_priority,
      v.created_by
    ) RETURNING id INTO v_id;

    v_appts := v_appts + 1;
    v_ids := v_ids || v_id;
    INSERT INTO public.brain_intake_artifacts(intake_id, group_id, entity_type, entity_id, original_payload_hash)
    VALUES (p_intake_id, v.group_id, 'medical_appointment', v_id, coalesce(a->>'payload_hash', ''));
  END LOOP;

  -- 1.3 Medicações — ligadas ao episódio (se houver). dosage/frequency já vêm
  -- preenchidas pelo app ("Conforme prescrição" quando não ditas). frequency_hours
  -- int nullable.
  FOR a IN SELECT value FROM jsonb_array_elements(coalesce(p_medications, '[]'::jsonb)) LOOP
    INSERT INTO public.active_medications(
      group_id, child_id, name, dosage, frequency, frequency_hours, care_type,
      reason, prescribed_by, start_date, end_date, status, illness_episode_id, priority, created_by
    ) VALUES (
      v.group_id,
      (a->>'child_id')::uuid,
      a->>'name',
      coalesce(a->>'dosage', 'Conforme prescrição'),
      coalesce(a->>'frequency', 'Conforme prescrição'),
      (nullif(a->>'frequency_hours', ''))::int,
      coalesce(a->>'care_type', 'medication'),
      a->>'reason',
      a->>'prescribed_by',
      (a->>'start_date')::date,
      (nullif(a->>'end_date', ''))::date,
      coalesce(a->>'status', 'active'),
      v_episode_id,
      coalesce(a->>'priority', 'important')::collab_priority,
      v.created_by
    ) RETURNING id INTO v_id;

    v_meds := v_meds + 1;
    v_ids := v_ids || v_id;
    INSERT INTO public.brain_intake_artifacts(intake_id, group_id, entity_type, entity_id, original_payload_hash)
    VALUES (p_intake_id, v.group_id, 'active_medication', v_id, coalesce(a->>'payload_hash', ''));
  END LOOP;

  -- Outbox na MESMA transação; idempotente por dedupe_key (retry não duplica).
  FOR ob IN SELECT value FROM jsonb_array_elements(coalesce(p_outbox, '[]'::jsonb)) LOOP
    INSERT INTO public.brain_outbox(group_id, intake_id, event_type, dedupe_key, payload)
    VALUES (v.group_id, p_intake_id, ob->>'event_type', ob->>'dedupe_key', coalesce(ob->'payload', '{}'::jsonb))
    ON CONFLICT (dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING;
  END LOOP;

  INSERT INTO public.brain_intake_audit(intake_id, group_id, actor_id, action, detail)
  VALUES (p_intake_id, v.group_id, v_actor, 'executed',
          jsonb_build_object('appointments', v_appts, 'medications', v_meds,
                             'episode', (v_episode_id IS NOT NULL)));

  UPDATE public.brain_intakes
     SET status = 'executed', executed_at = now(),
         retention_expiry = now() + interval '90 days', updated_at = now()
   WHERE id = p_intake_id;

  RETURN jsonb_build_object('outcome', 'executed',
                            'created_count', v_appts + v_meds + (CASE WHEN v_episode_id IS NULL THEN 0 ELSE 1 END),
                            'appointments', v_appts, 'medications', v_meds,
                            'entity_ids', to_jsonb(v_ids));
END;
$f$;

-- ─── 2. undo: deleta os 3 tipos por proveniência (blast-radius) ──────
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

  -- Remove, por tipo, SÓ o que é artefato DESTE intake e está em delete_ids.
  -- Medicações ANTES do episódio (FK illness_episode_id) — embora seja SET NULL,
  -- mantém a ordem limpa. medication_doses some via CASCADE (não há no A0).
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

-- ─── 3. grants: anon REVOGADO (Supabase concede anon explícito) ──────
REVOKE ALL ON FUNCTION public.brain_intake_execute_health_plan(UUID, TEXT, UUID, JSONB, JSONB, JSONB, JSONB, UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.brain_intake_apply_undo_health(UUID, UUID[], UUID[], UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.brain_intake_execute_health_plan(UUID, TEXT, UUID, JSONB, JSONB, JSONB, JSONB, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.brain_intake_apply_undo_health(UUID, UUID[], UUID[], UUID) TO authenticated, service_role;
