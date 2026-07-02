-- ============================================================
-- MIGRATION 138: Guarda & Rotina N4 — proposta PERMANENTE com OK-do-outro
--
-- Decisão do dono (02/jul): mudança PONTUAL notifica-e-vale; mudança
-- PERMANENTE (padrão semanal de leva/busca) SEMPRE exige o OK do outro
-- responsável ANTES de valer. Até aqui a proposta era só proveniência +
-- aviso ("aguarda o OK do coparente") — SEM lugar pra aceitar. Esta
-- migration dá corpo a ela:
--   • tabela care_routine_slot_proposals (pending/accepted/declined/
--     cancelled) — o card no /calendario lista as pendentes;
--   • RPC care_routine_respond_slot_proposal — quem responde é OUTRO
--     membro (nunca quem propôs); aceitar MATERIALIZA o slot semanal
--     (UPSERT no UNIQUE group+child+weekday+leg — espelho do fluxo
--     bilateral de troca respondToSwapRequest→materialize);
--   • brain_intake_execute_custody_plan v2 — slot_change agora INSERE a
--     proposta de verdade (artifact aponta pro id real, não sintético);
--   • brain_intake_apply_undo_custody v2 — desfazer cancela proposta
--     ainda PENDENTE; aceita = acordo bilateral feito → fica ('kept'),
--     mesma regra da troca aprovada.
--
-- Parse do Brain GARANTE responsible = membro (externo nunca chega a
-- slot_change), então a materialização respeita o CHECK
-- care_routine_slots_responsible_required sem caso especial.
-- ============================================================

-- ─── 1. tabela ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.care_routine_slot_proposals (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id         UUID NOT NULL REFERENCES public.coparenting_groups(id) ON DELETE CASCADE,
  child_ids        UUID[] NOT NULL,
  weekday          SMALLINT NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  leg              TEXT NOT NULL CHECK (leg IN ('dropoff', 'pickup')),
  responsible_id   UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  responsible_label TEXT,
  time_of_day      TIME,
  status           TEXT NOT NULL DEFAULT 'pending'
                     CHECK (status IN ('pending', 'accepted', 'declined', 'cancelled')),
  proposed_by      UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  responded_by     UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  responded_at     TIMESTAMPTZ,
  intake_id        UUID REFERENCES public.brain_intakes(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_care_slot_proposals_group_pending
  ON public.care_routine_slot_proposals(group_id) WHERE status = 'pending';

-- RLS: membros LEEM; toda escrita passa pelas RPCs SECURITY DEFINER
-- (sem policy de INSERT/UPDATE/DELETE = escrita direta bloqueada).
ALTER TABLE public.care_routine_slot_proposals ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS care_slot_proposals_select ON public.care_routine_slot_proposals;
CREATE POLICY care_slot_proposals_select ON public.care_routine_slot_proposals
  FOR SELECT USING (public.is_group_member(group_id, (SELECT auth.uid())));

-- ─── 2. responder (aceitar materializa o padrão semanal) ─────────────
CREATE OR REPLACE FUNCTION public.care_routine_respond_slot_proposal(
  p_proposal_id UUID,
  p_decision TEXT,
  p_actor_user_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $f$
DECLARE
  v public.care_routine_slot_proposals;
  v_actor UUID;
  v_child UUID;
  v_slots INT := 0;
BEGIN
  v_actor := coalesce(auth.uid(), p_actor_user_id);
  IF p_decision NOT IN ('accepted', 'declined') THEN
    RETURN jsonb_build_object('outcome', 'invalid_decision');
  END IF;

  SELECT * INTO v FROM public.care_routine_slot_proposals
   WHERE id = p_proposal_id FOR UPDATE;
  IF v.id IS NULL THEN
    RETURN jsonb_build_object('outcome', 'not_found');
  END IF;
  IF v_actor IS NULL OR NOT public.is_group_member(v.group_id, v_actor) THEN
    RETURN jsonb_build_object('outcome', 'forbidden');
  END IF;
  -- Governança: o OK é do OUTRO — quem propôs não aceita a própria proposta.
  IF v.proposed_by = v_actor THEN
    RETURN jsonb_build_object('outcome', 'own_proposal');
  END IF;
  IF v.status <> 'pending' THEN
    RETURN jsonb_build_object('outcome', 'already_responded', 'status', v.status);
  END IF;

  UPDATE public.care_routine_slot_proposals
     SET status = p_decision, responded_by = v_actor, responded_at = now(), updated_at = now()
   WHERE id = p_proposal_id;

  IF p_decision = 'accepted' THEN
    -- Materializa o padrão semanal: a célula (grupo,criança,dia,perna)
    -- passa a ser do responsável combinado. UPSERT idempotente.
    FOREACH v_child IN ARRAY v.child_ids LOOP
      INSERT INTO public.care_routine_slots(
        group_id, child_id, weekday, leg, pattern_type, responsible_id, time_of_day, is_active, created_by
      ) VALUES (
        v.group_id, v_child, v.weekday, v.leg, 'weekly', v.responsible_id, v.time_of_day, TRUE, v_actor
      )
      ON CONFLICT (group_id, child_id, weekday, leg)
      DO UPDATE SET responsible_id = EXCLUDED.responsible_id,
                    time_of_day    = coalesce(EXCLUDED.time_of_day, care_routine_slots.time_of_day),
                    pattern_type   = 'weekly',
                    is_active      = TRUE,
                    updated_at     = now();
      v_slots := v_slots + 1;
    END LOOP;
  END IF;

  -- Proveniência/auditoria quando a proposta nasceu do Brain.
  IF v.intake_id IS NOT NULL THEN
    INSERT INTO public.brain_intake_audit(intake_id, group_id, actor_id, action, detail)
    VALUES (v.intake_id, v.group_id, v_actor,
            CASE WHEN p_decision = 'accepted' THEN 'proposal_accepted' ELSE 'proposal_declined' END,
            jsonb_build_object('proposal_id', v.id, 'slots_updated', v_slots));
  END IF;

  RETURN jsonb_build_object('outcome', p_decision, 'slots_updated', v_slots,
                            'proposed_by', v.proposed_by, 'group_id', v.group_id);
END;
$f$;

REVOKE ALL ON FUNCTION public.care_routine_respond_slot_proposal(UUID, TEXT, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.care_routine_respond_slot_proposal(UUID, TEXT, UUID) TO authenticated, service_role;

-- ─── 3. execute v2: slot_change INSERE a proposta (id real no artifact) ─
CREATE OR REPLACE FUNCTION public.brain_intake_execute_custody_plan(
  p_intake_id UUID,
  p_plan_hash TEXT,
  p_token UUID,
  p_custody_events JSONB DEFAULT '[]'::jsonb,
  p_leg_overrides JSONB DEFAULT '[]'::jsonb,
  p_swap_requests JSONB DEFAULT '[]'::jsonb,
  p_slot_proposals JSONB DEFAULT '[]'::jsonb,
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
  v_events INT := 0;
  v_overrides INT := 0;
  v_swaps INT := 0;
  v_proposals INT := 0;
  a JSONB;
  ob JSONB;
BEGIN
  v := public.brain_intake_claim_execution(p_intake_id, p_plan_hash, p_token, p_actor_user_id);
  IF v.id IS NULL THEN
    RETURN jsonb_build_object('outcome', 'not_claimed');
  END IF;
  v_actor := coalesce(auth.uid(), p_actor_user_id);

  -- 3.1 Exceções/férias → custody_events (child_id null = família toda).
  FOR a IN SELECT value FROM jsonb_array_elements(coalesce(p_custody_events, '[]'::jsonb)) LOOP
    INSERT INTO public.custody_events(
      group_id, child_id, responsible_user_id, start_date, end_date, custody_type, notes, created_by
    ) VALUES (
      v.group_id,
      (nullif(a->>'child_id', ''))::uuid,
      (a->>'responsible_user_id')::uuid,
      (a->>'start_date')::date,
      (a->>'end_date')::date,
      (a->>'custody_type')::custody_type,
      a->>'notes',
      v.created_by
    ) RETURNING id INTO v_id;

    v_events := v_events + 1;
    INSERT INTO public.brain_intake_artifacts(intake_id, group_id, entity_type, entity_id, original_payload_hash)
    VALUES (p_intake_id, v.group_id, 'custody_event', v_id, coalesce(a->>'payload_hash', ''));
  END LOOP;

  -- 3.2 Leva/busca pontual → care_routine_overrides (UPSERT no UNIQUE).
  FOR a IN SELECT value FROM jsonb_array_elements(coalesce(p_leg_overrides, '[]'::jsonb)) LOOP
    INSERT INTO public.care_routine_overrides(
      group_id, child_id, occurrence_date, leg, responsible_id, note, created_by
    ) VALUES (
      v.group_id,
      (a->>'child_id')::uuid,
      (a->>'occurrence_date')::date,
      a->>'leg',
      (a->>'responsible_id')::uuid,
      a->>'note',
      v.created_by
    )
    ON CONFLICT (group_id, child_id, occurrence_date, leg)
    DO UPDATE SET responsible_id = EXCLUDED.responsible_id,
                  note = EXCLUDED.note,
                  created_by = EXCLUDED.created_by
    RETURNING id INTO v_id;

    v_overrides := v_overrides + 1;
    INSERT INTO public.brain_intake_artifacts(intake_id, group_id, entity_type, entity_id, original_payload_hash)
    VALUES (p_intake_id, v.group_id, 'care_routine_override', v_id, coalesce(a->>'payload_hash', ''));
  END LOOP;

  -- 3.3 Trocas → swap_requests 'pending' (fluxo bilateral existente decide).
  FOR a IN SELECT value FROM jsonb_array_elements(coalesce(p_swap_requests, '[]'::jsonb)) LOOP
    INSERT INTO public.swap_requests(
      group_id, requester_id, target_user_id, original_date, proposed_date, reason, status
    ) VALUES (
      v.group_id,
      v.created_by,
      (a->>'target_user_id')::uuid,
      (a->>'original_date')::date,
      (nullif(a->>'proposed_date', ''))::date,
      a->>'reason',
      'pending'
    ) RETURNING id INTO v_id;

    v_swaps := v_swaps + 1;
    INSERT INTO public.brain_intake_artifacts(intake_id, group_id, entity_type, entity_id, original_payload_hash)
    VALUES (p_intake_id, v.group_id, 'swap_request', v_id, coalesce(a->>'payload_hash', ''));
  END LOOP;

  -- 3.4 Mudança PERMANENTE → proposta REAL na tabela (N4). O slot em si só
  -- muda quando o outro aceitar (care_routine_respond_slot_proposal).
  FOR a IN SELECT value FROM jsonb_array_elements(coalesce(p_slot_proposals, '[]'::jsonb)) LOOP
    INSERT INTO public.care_routine_slot_proposals(
      group_id, child_ids, weekday, leg, responsible_id, responsible_label, time_of_day, proposed_by, intake_id
    ) VALUES (
      v.group_id,
      (SELECT coalesce(array_agg(x::uuid), '{}') FROM jsonb_array_elements_text(coalesce(a->'child_ids', '[]'::jsonb)) AS x),
      (a->>'weekday')::smallint,
      a->>'leg',
      (a->>'responsible_id')::uuid,
      a->>'responsible_label',
      (nullif(a->>'time', ''))::time,
      v.created_by,
      p_intake_id
    ) RETURNING id INTO v_id;

    v_proposals := v_proposals + 1;
    INSERT INTO public.brain_intake_artifacts(intake_id, group_id, entity_type, entity_id, original_payload_hash)
    VALUES (p_intake_id, v.group_id, 'custody_slot_proposal', v_id, coalesce(a->>'payload_hash', ''));
  END LOOP;

  -- Outbox na MESMA transação; idempotente por dedupe_key.
  FOR ob IN SELECT value FROM jsonb_array_elements(coalesce(p_outbox, '[]'::jsonb)) LOOP
    INSERT INTO public.brain_outbox(group_id, intake_id, event_type, dedupe_key, payload)
    VALUES (v.group_id, p_intake_id, ob->>'event_type', ob->>'dedupe_key', coalesce(ob->'payload', '{}'::jsonb))
    ON CONFLICT (dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING;
  END LOOP;

  INSERT INTO public.brain_intake_audit(intake_id, group_id, actor_id, action, detail)
  VALUES (p_intake_id, v.group_id, v_actor, 'executed',
          jsonb_build_object('custody_events', v_events, 'leg_overrides', v_overrides,
                             'swap_requests', v_swaps, 'slot_proposals', v_proposals));

  UPDATE public.brain_intakes
     SET status = 'executed', executed_at = now(),
         retention_expiry = now() + interval '90 days', updated_at = now()
   WHERE id = p_intake_id;

  RETURN jsonb_build_object('outcome', 'executed',
                            'created_count', v_events + v_overrides + v_swaps,
                            'proposed_count', v_swaps + v_proposals,
                            'custody_events', v_events, 'leg_overrides', v_overrides,
                            'swap_requests', v_swaps, 'slot_proposals', v_proposals);
END;
$f$;

-- ─── 4. undo v2: proposta PENDENTE cancela; aceita fica (acordo feito) ─
CREATE OR REPLACE FUNCTION public.brain_intake_apply_undo_custody(
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
  v_kept INT := 0;      -- trocas aprovadas + propostas aceitas (acordo feito, fica)
  v_cancelled INT := 0; -- outbox
  n INT;
BEGIN
  SELECT group_id INTO g FROM public.brain_intakes WHERE id = p_intake_id;
  v_actor := coalesce(auth.uid(), p_actor_user_id);
  IF g IS NULL OR NOT public.is_group_member(g, v_actor) THEN
    RETURN jsonb_build_object('outcome', 'forbidden');
  END IF;

  -- Exceções/férias deste intake → delete.
  WITH del AS (
    DELETE FROM public.custody_events ce USING public.brain_intake_artifacts ar
     WHERE ar.intake_id = p_intake_id AND ar.entity_type = 'custody_event'
       AND ar.undone_at IS NULL AND ar.entity_id = ce.id
     RETURNING ce.id
  )
  UPDATE public.brain_intake_artifacts SET undone_at = now()
   WHERE intake_id = p_intake_id AND entity_id IN (SELECT id FROM del);
  GET DIAGNOSTICS n = ROW_COUNT; v_removed := v_removed + n;

  -- Overrides deste intake → delete (o dia VOLTA ao padrão semanal).
  WITH del AS (
    DELETE FROM public.care_routine_overrides o USING public.brain_intake_artifacts ar
     WHERE ar.intake_id = p_intake_id AND ar.entity_type = 'care_routine_override'
       AND ar.undone_at IS NULL AND ar.entity_id = o.id
     RETURNING o.id
  )
  UPDATE public.brain_intake_artifacts SET undone_at = now()
   WHERE intake_id = p_intake_id AND entity_id IN (SELECT id FROM del);
  GET DIAGNOSTICS n = ROW_COUNT; v_removed := v_removed + n;

  -- Trocas: cancela SÓ as ainda pendentes (aprovada = acordo feito → fica).
  WITH upd AS (
    UPDATE public.swap_requests s
       SET status = 'cancelled', responded_at = now()
      FROM public.brain_intake_artifacts ar
     WHERE ar.intake_id = p_intake_id AND ar.entity_type = 'swap_request'
       AND ar.undone_at IS NULL AND ar.entity_id = s.id AND s.status = 'pending'
     RETURNING s.id
  )
  UPDATE public.brain_intake_artifacts SET undone_at = now()
   WHERE intake_id = p_intake_id AND entity_id IN (SELECT id FROM upd);
  GET DIAGNOSTICS n = ROW_COUNT; v_removed := v_removed + n;

  -- Propostas de mudança permanente (N4): cancela SÓ as ainda pendentes;
  -- ACEITA = acordo bilateral já materializado no padrão → fica ('kept').
  WITH upd AS (
    UPDATE public.care_routine_slot_proposals sp
       SET status = 'cancelled', responded_at = now(), updated_at = now()
      FROM public.brain_intake_artifacts ar
     WHERE ar.intake_id = p_intake_id AND ar.entity_type = 'custody_slot_proposal'
       AND ar.undone_at IS NULL AND ar.entity_id = sp.id AND sp.status = 'pending'
     RETURNING sp.id
  )
  UPDATE public.brain_intake_artifacts SET undone_at = now()
   WHERE intake_id = p_intake_id AND entity_id IN (SELECT id FROM upd);
  GET DIAGNOSTICS n = ROW_COUNT; v_removed := v_removed + n;

  -- Artefatos de proposta antigos (pré-N4, id sintético sem linha) → marca.
  UPDATE public.brain_intake_artifacts ar SET undone_at = now()
   WHERE ar.intake_id = p_intake_id AND ar.entity_type = 'custody_slot_proposal'
     AND ar.undone_at IS NULL
     AND NOT EXISTS (SELECT 1 FROM public.care_routine_slot_proposals sp WHERE sp.id = ar.entity_id);
  GET DIAGNOSTICS n = ROW_COUNT; v_removed := v_removed + n;

  -- Acordos que ficam de pé: trocas aprovadas + propostas aceitas.
  SELECT count(*) INTO v_kept
    FROM public.brain_intake_artifacts
   WHERE intake_id = p_intake_id AND undone_at IS NULL
     AND entity_type IN ('swap_request', 'custody_slot_proposal');

  -- Cancela a coordenação ainda não entregue.
  UPDATE public.brain_outbox
     SET status = 'cancelled', last_error = 'intake_undone'
   WHERE intake_id = p_intake_id AND status IN ('pending', 'failed', 'delivering');
  GET DIAGNOSTICS v_cancelled = ROW_COUNT;

  UPDATE public.brain_intakes SET status = 'undone', updated_at = now() WHERE id = p_intake_id;

  INSERT INTO public.brain_intake_audit(intake_id, group_id, actor_id, action, detail)
  VALUES (p_intake_id, g, v_actor, 'undone',
          jsonb_build_object('removed', v_removed, 'kept_agreements', v_kept, 'cancelled_outbox', v_cancelled));

  RETURN jsonb_build_object('outcome', 'undone', 'removed', v_removed,
                            'kept_agreements', v_kept, 'cancelled_outbox', v_cancelled);
END;
$f$;

-- ─── 5. grants (re-afirma pós CREATE OR REPLACE) ─────────────────────
REVOKE ALL ON FUNCTION public.brain_intake_execute_custody_plan(UUID, TEXT, UUID, JSONB, JSONB, JSONB, JSONB, JSONB, UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.brain_intake_apply_undo_custody(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.brain_intake_execute_custody_plan(UUID, TEXT, UUID, JSONB, JSONB, JSONB, JSONB, JSONB, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.brain_intake_apply_undo_custody(UUID, UUID) TO authenticated, service_role;
