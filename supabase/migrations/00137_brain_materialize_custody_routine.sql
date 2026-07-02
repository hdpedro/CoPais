-- ============================================================
-- MIGRATION 137: Kindar Brain — materializar GUARDA & ROTINA (custody_routine)
--
-- A narrativa do responsável ("semana que vem o Otto fica comigo, e quinta
-- quem busca é a minha mãe") vira, ATOMICAMENTE, as primitivas que JÁ existem,
-- cada uma com a governança decidida pelo dono (02/jul):
--   • exceção pontual / férias → custody_events (exception/vacation) —
--     NOTIFICA-E-VALE: materializa agora, o outro é avisado e pode desfazer;
--   • leva/busca pontual → care_routine_overrides (UPSERT no UNIQUE
--     group+child+date+leg) — pessoa EXTERNA ("a avó") já chegou como NOTE
--     humano com o responsável = narrador (o app nunca inventa membro);
--   • troca de dia → swap_requests 'pending' — o fluxo BILATERAL existente
--     (respondSwapRequest) aprova e materializa; aqui só se PROPÕE;
--   • mudança PERMANENTE do padrão (slot) → NENHUMA escrita de tabela:
--     proveniência 'custody_slot_proposal' + outbox (OK-do-outro antes de valer).
-- + proveniência (brain_intake_artifacts) + outbox idempotente + audit,
-- TUDO numa transação (falha reverte tudo, intake volta a awaiting_confirmation).
--
-- Ator EXPLÍCITO (WhatsApp usa service_role → auth.uid() NULL): reusa o guard
-- brain_intake_claim_execution(..., p_actor_user_id) [00132]. anon REVOGADO.
--
-- Undo dedicado (brain_intake_apply_undo_custody): lê a PRÓPRIA proveniência
-- (sem arrays do cliente): deleta exceções/férias e overrides deste intake
-- (override desfeito → o dia VOLTA ao padrão semanal), CANCELA troca ainda
-- pendente (aprovada = acordo feito → fica, conta como 'kept'), marca
-- propostas como desfeitas e cancela a coordenação não entregue.
-- ============================================================

-- ─── 0. enum: 'exception' entra no custody_type ──────────────────────
-- O resolvedor (custody-resolve.ts) e o calendário JÁ priorizam 'exception'
-- (prio 2, junto de vacation — migration 00082), mas o ENUM de 00001 nunca
-- ganhou o valor. Aditivo e seguro: ADD VALUE não reescreve nada, e esta
-- migration não USA o valor na mesma transação (só as funções referenciam).
ALTER TYPE custody_type ADD VALUE IF NOT EXISTS 'exception';

-- ─── 1. execução: exceções/férias + overrides + trocas + propostas ───
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

  -- 1.1 Exceções/férias → custody_events (child_id null = família toda).
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

  -- 1.2 Leva/busca pontual → care_routine_overrides. UPSERT no UNIQUE
  -- (group,child,date,leg): a narrativa mais recente vence o override anterior
  -- do MESMO dia (o preview avisa; o undo volta ao padrão semanal).
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

  -- 1.3 Trocas → swap_requests 'pending' (o fluxo bilateral existente decide).
  -- requester = quem narrou/confirmou (created_by do intake).
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

  -- 1.4 Mudança PERMANENTE → SÓ proveniência (id sintético; nenhuma tabela).
  -- O payload inteiro fica no outbox/plan; materializa quando o outro aprovar
  -- (fluxo do Épico C — fatia futura).
  FOR a IN SELECT value FROM jsonb_array_elements(coalesce(p_slot_proposals, '[]'::jsonb)) LOOP
    v_proposals := v_proposals + 1;
    INSERT INTO public.brain_intake_artifacts(intake_id, group_id, entity_type, entity_id, original_payload_hash)
    VALUES (p_intake_id, v.group_id, 'custody_slot_proposal', gen_random_uuid(), coalesce(a->>'payload_hash', ''));
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

-- ─── 2. undo: lê a própria proveniência; acordo aprovado NÃO se desfaz ─
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
  v_kept INT := 0;      -- trocas já aprovadas/recusadas (acordo feito, fica)
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

  -- Trocas: cancela SÓ as ainda pendentes. Aprovada = acordo bilateral feito
  -- (desfazer unilateralmente violaria a governança) → fica, conta em 'kept'.
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

  SELECT count(*) INTO v_kept
    FROM public.brain_intake_artifacts
   WHERE intake_id = p_intake_id AND entity_type = 'swap_request' AND undone_at IS NULL;

  -- Propostas de mudança permanente: nada materializado → só marca desfeita.
  UPDATE public.brain_intake_artifacts SET undone_at = now()
   WHERE intake_id = p_intake_id AND entity_type = 'custody_slot_proposal' AND undone_at IS NULL;
  GET DIAGNOSTICS n = ROW_COUNT; v_removed := v_removed + n;

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

-- ─── 3. grants: anon REVOGADO (Supabase concede anon explícito) ──────
REVOKE ALL ON FUNCTION public.brain_intake_execute_custody_plan(UUID, TEXT, UUID, JSONB, JSONB, JSONB, JSONB, JSONB, UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.brain_intake_apply_undo_custody(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.brain_intake_execute_custody_plan(UUID, TEXT, UUID, JSONB, JSONB, JSONB, JSONB, JSONB, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.brain_intake_apply_undo_custody(UUID, UUID) TO authenticated, service_role;
