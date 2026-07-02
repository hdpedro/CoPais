-- ============================================================
-- MIGRATION 141: Kindar Brain — materializar DESPESAS (Fase 2, fatia E2)
--
-- "paguei 250 na consulta do Otto" confirmado → INSERT na tabela
-- `expenses` EXISTENTE (00001), ATOMICAMENTE com proveniência + outbox
-- + audit (mesmo molde da 00131 saúde / 00137 guarda):
--   • paid_by = quem narrou/confirmou (created_by do intake);
--   • status 'pending' — o fluxo de APROVAÇÃO do módulo segue normal
--     (o coparente aprova/contesta na tela Despesas, como sempre);
--   • split_ratio/currency ficam nos DEFAULTS do schema (split padrão
--     do grupo) — a narrativa não muda regra financeira em silêncio.
--
-- Undo (brain_intake_apply_undo_expense): lê a própria proveniência e
-- DELETA só despesas ainda 'pending'; APROVADA/REJEITADA = o coparente
-- já agiu (acordo/decisão bilateral) → FICA e conta como 'kept', mesma
-- regra da troca aprovada (00137). Cancela outbox não entregue.
--
-- Ator EXPLÍCITO (WhatsApp usa service_role → auth.uid() NULL): reusa
-- brain_intake_claim_execution(..., p_actor_user_id). anon REVOGADO.
-- ============================================================

-- ─── 1. execução ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.brain_intake_execute_expense_plan(
  p_intake_id UUID,
  p_plan_hash TEXT,
  p_token UUID,
  p_expenses JSONB DEFAULT '[]'::jsonb,
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
  v_total NUMERIC(12,2) := 0;
  a JSONB;
  ob JSONB;
BEGIN
  v := public.brain_intake_claim_execution(p_intake_id, p_plan_hash, p_token, p_actor_user_id);
  IF v.id IS NULL THEN
    RETURN jsonb_build_object('outcome', 'not_claimed');
  END IF;
  v_actor := coalesce(auth.uid(), p_actor_user_id);

  FOR a IN SELECT value FROM jsonb_array_elements(coalesce(p_expenses, '[]'::jsonb)) LOOP
    INSERT INTO public.expenses(
      group_id, child_id, category, description, amount, paid_by, expense_date
    ) VALUES (
      v.group_id,
      (nullif(a->>'child_id', ''))::uuid,
      (a->>'category')::expense_category,
      a->>'description',
      (a->>'amount')::numeric(10,2),
      v.created_by,
      (a->>'expense_date')::date
    ) RETURNING id INTO v_id;

    v_count := v_count + 1;
    v_total := v_total + (a->>'amount')::numeric(10,2);
    INSERT INTO public.brain_intake_artifacts(intake_id, group_id, entity_type, entity_id, original_payload_hash)
    VALUES (p_intake_id, v.group_id, 'expense', v_id, coalesce(a->>'payload_hash', ''));
  END LOOP;

  -- Outbox na MESMA transação; idempotente por dedupe_key.
  FOR ob IN SELECT value FROM jsonb_array_elements(coalesce(p_outbox, '[]'::jsonb)) LOOP
    INSERT INTO public.brain_outbox(group_id, intake_id, event_type, dedupe_key, payload)
    VALUES (v.group_id, p_intake_id, ob->>'event_type', ob->>'dedupe_key', coalesce(ob->'payload', '{}'::jsonb))
    ON CONFLICT (dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING;
  END LOOP;

  INSERT INTO public.brain_intake_audit(intake_id, group_id, actor_id, action, detail)
  VALUES (p_intake_id, v.group_id, v_actor, 'executed',
          jsonb_build_object('expenses', v_count, 'total_amount', v_total));

  UPDATE public.brain_intakes
     SET status = 'executed', executed_at = now(),
         retention_expiry = now() + interval '90 days', updated_at = now()
   WHERE id = p_intake_id;

  RETURN jsonb_build_object('outcome', 'executed', 'created_count', v_count, 'total_amount', v_total);
END;
$f$;

-- ─── 2. undo: pendente deleta; aprovada/rejeitada FICA (kept) ─────────
CREATE OR REPLACE FUNCTION public.brain_intake_apply_undo_expense(
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
  v_kept INT := 0;
  v_cancelled INT := 0;
  n INT;
BEGIN
  SELECT group_id INTO g FROM public.brain_intakes WHERE id = p_intake_id;
  v_actor := coalesce(auth.uid(), p_actor_user_id);
  IF g IS NULL OR NOT public.is_group_member(g, v_actor) THEN
    RETURN jsonb_build_object('outcome', 'forbidden');
  END IF;

  -- Despesas deste intake ainda 'pending' → delete.
  WITH del AS (
    DELETE FROM public.expenses e USING public.brain_intake_artifacts ar
     WHERE ar.intake_id = p_intake_id AND ar.entity_type = 'expense'
       AND ar.undone_at IS NULL AND ar.entity_id = e.id AND e.status = 'pending'
     RETURNING e.id
  )
  UPDATE public.brain_intake_artifacts SET undone_at = now()
   WHERE intake_id = p_intake_id AND entity_id IN (SELECT id FROM del);
  GET DIAGNOSTICS n = ROW_COUNT; v_removed := v_removed + n;

  -- Aprovada/rejeitada/contestada: o coparente já agiu → fica de pé.
  SELECT count(*) INTO v_kept
    FROM public.brain_intake_artifacts
   WHERE intake_id = p_intake_id AND entity_type = 'expense' AND undone_at IS NULL;

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

-- ─── 3. grants: anon REVOGADO ────────────────────────────────────────
REVOKE ALL ON FUNCTION public.brain_intake_execute_expense_plan(UUID, TEXT, UUID, JSONB, JSONB, UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.brain_intake_apply_undo_expense(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.brain_intake_execute_expense_plan(UUID, TEXT, UUID, JSONB, JSONB, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.brain_intake_apply_undo_expense(UUID, UUID) TO authenticated, service_role;
