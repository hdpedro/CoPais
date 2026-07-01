-- ============================================================
-- MIGRATION 132: ator EXPLÍCITO nos RPCs do Brain (paridade WhatsApp)
--
-- Os RPCs de confirmar/desfazer autorizam via is_group_member(group_id) e
-- carimbam confirmed_by/actor_id a partir de auth.uid(). No PWA/Native isso
-- funciona (client do usuário → JWT → auth.uid()). No WhatsApp o processor usa
-- o client service_role (sem sessão) → auth.uid() é NULL → todo confirm/undo
-- retornaria 'forbidden'/'not_claimed'. Para dar paridade, os RPCs passam a
-- aceitar um ATOR EXPLÍCITO, resolvido como:
--
--     v_actor := coalesce(auth.uid(), p_actor_user_id)
--
-- PROPRIEDADE DE SEGURANÇA (à prova de impersonation): quando há sessão
-- autenticada, o auth.uid() do PRÓPRIO chamador SEMPRE vence — o parâmetro é
-- ignorado. Um usuário 'authenticated' NÃO consegue agir como outro passando um
-- id qualquer. O p_actor_user_id só é confiado quando auth.uid() é NULL, o que
-- só é alcançável por código de servidor confiável que detém a service_role key
-- (o processor do WhatsApp, que resolve o ator de um whatsapp_phone_links
-- verificado). O caminho PWA/Native fica BYTE-IDÊNTICO (param default NULL →
-- auth.uid() → mesma checagem is_group_member).
--
-- Adicionar parâmetro muda a assinatura → DROP + CREATE. IDEMPOTENTE em
-- qualquer estado: dropamos TANTO a assinatura antiga (3/5/3 args) QUANTO a nova
-- (4/6/4 args) antes de recriar, então re-rodar num DB já migrado não colide.
-- DROP remove grants → re-estabelecemos EXATAMENTE o estado alvo
-- (authenticated + service_role nos 3 RPCs; só service_role no helper interno;
-- sem anon/public em nenhum). apply_migration é transacional: sem janela.
-- ============================================================

-- Drop idempotente (assinatura ANTIGA + NOVA). Corpos plpgsql não são
-- dependência rígida → ordem de drop é livre. NÃO tocamos is_group_member(uuid)
-- 1-arg (usado nas RLS em todo o schema).
DROP FUNCTION IF EXISTS public.brain_intake_execute_plan(uuid, text, uuid, jsonb, jsonb);
DROP FUNCTION IF EXISTS public.brain_intake_execute_plan(uuid, text, uuid, jsonb, jsonb, uuid);
DROP FUNCTION IF EXISTS public.brain_intake_claim_execution(uuid, text, uuid);
DROP FUNCTION IF EXISTS public.brain_intake_claim_execution(uuid, text, uuid, uuid);
DROP FUNCTION IF EXISTS public.brain_intake_apply_undo(uuid, uuid[], uuid[]);
DROP FUNCTION IF EXISTS public.brain_intake_apply_undo(uuid, uuid[], uuid[], uuid);
DROP FUNCTION IF EXISTS public.is_group_member(uuid, uuid);

-- Overload INTERNO: membership por ator EXPLÍCITO. Só chamado dentro dos RPCs
-- definer (owner=postgres) → não precisa grant a authenticated; conceder a
-- authenticated permitiria probe de membership de terceiros. Só service_role.
CREATE FUNCTION public.is_group_member(p_group_id uuid, p_user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.group_members
     WHERE group_id = p_group_id AND user_id = p_user_id
  );
$function$;

-- claim: ator explícito + membership por ator. r.id NULL (ator nulo/não-membro)
-- → o chamador trata como not_claimed.
CREATE FUNCTION public.brain_intake_claim_execution(
  p_intake_id uuid, p_plan_hash text, p_token uuid, p_actor_user_id uuid DEFAULT NULL)
 RETURNS brain_intakes
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE r public.brain_intakes; v_actor uuid;
BEGIN
  v_actor := coalesce(auth.uid(), p_actor_user_id);
  IF v_actor IS NULL THEN RETURN r; END IF;  -- sem ator → nada reivindicado
  UPDATE public.brain_intakes
     SET status = 'executing', confirmed_by = v_actor, updated_at = now()
   WHERE id = p_intake_id AND status = 'awaiting_confirmation'
     AND plan_hash = p_plan_hash AND confirmation_token = p_token
     AND (confirmation_expires_at IS NULL OR confirmation_expires_at > now())
     AND public.is_group_member(group_id, v_actor)
  RETURNING * INTO r;
  RETURN r;
END;
$function$;

CREATE FUNCTION public.brain_intake_execute_plan(
  p_intake_id uuid, p_plan_hash text, p_token uuid,
  p_activities jsonb, p_outbox jsonb DEFAULT '[]'::jsonb,
  p_actor_user_id uuid DEFAULT NULL)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v public.brain_intakes;
  v_actor uuid;
  v_log_id UUID;
  v_ids UUID[] := '{}';
  v_count INT := 0;
  a JSONB;
  ob JSONB;
BEGIN
  v_actor := coalesce(auth.uid(), p_actor_user_id);
  v := public.brain_intake_claim_execution(p_intake_id, p_plan_hash, p_token, v_actor);
  IF v.id IS NULL THEN
    RETURN jsonb_build_object('outcome', 'not_claimed');
  END IF;

  FOR a IN SELECT value FROM jsonb_array_elements(coalesce(p_activities, '[]'::jsonb)) LOOP
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

    INSERT INTO public.brain_intake_artifacts(intake_id, group_id, entity_type, entity_id, original_payload_hash)
    VALUES (p_intake_id, v.group_id, 'school_log', v_log_id, coalesce(a->>'payload_hash', ''));
  END LOOP;

  FOR ob IN SELECT value FROM jsonb_array_elements(coalesce(p_outbox, '[]'::jsonb)) LOOP
    INSERT INTO public.brain_outbox(group_id, intake_id, event_type, dedupe_key, payload)
    VALUES (v.group_id, p_intake_id, ob->>'event_type', ob->>'dedupe_key', coalesce(ob->'payload', '{}'::jsonb))
    ON CONFLICT (dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING;
  END LOOP;

  INSERT INTO public.brain_intake_audit(intake_id, group_id, actor_id, action, detail)
  VALUES (p_intake_id, v.group_id, v_actor, 'executed', jsonb_build_object('created_count', v_count));

  UPDATE public.brain_intakes
     SET status = 'executed', executed_at = now(),
         retention_expiry = now() + interval '90 days', updated_at = now()
   WHERE id = p_intake_id;

  RETURN jsonb_build_object('outcome', 'executed', 'created_count', v_count, 'activity_ids', to_jsonb(v_ids));
END;
$function$;

CREATE FUNCTION public.brain_intake_apply_undo(
  p_intake_id uuid, p_delete_entity_ids uuid[], p_detach_artifact_ids uuid[],
  p_actor_user_id uuid DEFAULT NULL)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  g UUID;
  v_actor uuid;
  v_removed INT := 0;
  v_detached INT := 0;
  v_cancelled INT := 0;
BEGIN
  v_actor := coalesce(auth.uid(), p_actor_user_id);
  SELECT group_id INTO g FROM public.brain_intakes WHERE id = p_intake_id;
  IF g IS NULL OR v_actor IS NULL OR NOT public.is_group_member(g, v_actor) THEN
    RETURN jsonb_build_object('outcome', 'forbidden');
  END IF;

  UPDATE public.brain_intake_artifacts
     SET detached_at = now()
   WHERE intake_id = p_intake_id
     AND id = ANY(coalesce(p_detach_artifact_ids, '{}'::uuid[]))
     AND detached_at IS NULL;
  GET DIAGNOSTICS v_detached = ROW_COUNT;

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

  UPDATE public.brain_outbox
     SET status = 'cancelled', last_error = 'intake_undone'
   WHERE intake_id = p_intake_id
     AND status IN ('pending', 'failed', 'delivering');
  GET DIAGNOSTICS v_cancelled = ROW_COUNT;

  UPDATE public.brain_intakes SET status = 'undone', updated_at = now() WHERE id = p_intake_id;

  INSERT INTO public.brain_intake_audit(intake_id, group_id, actor_id, action, detail)
  VALUES (p_intake_id, g, v_actor, 'undone',
          jsonb_build_object('removed', v_removed, 'detached', v_detached, 'cancelled_outbox', v_cancelled));

  RETURN jsonb_build_object('outcome', 'undone', 'removed', v_removed, 'detached', v_detached, 'cancelled_outbox', v_cancelled);
END;
$function$;

-- Grants EXATOS do estado alvo. REVOKE inclui authenticated no helper interno
-- (idempotente: força só service_role mesmo que um estado anterior o tenha
-- concedido). Os 3 RPCs: authenticated (PWA/Native) + service_role (WhatsApp).
REVOKE ALL ON FUNCTION public.is_group_member(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_group_member(uuid, uuid) TO service_role;

REVOKE ALL ON FUNCTION public.brain_intake_claim_execution(uuid, text, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.brain_intake_claim_execution(uuid, text, uuid, uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.brain_intake_execute_plan(uuid, text, uuid, jsonb, jsonb, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.brain_intake_execute_plan(uuid, text, uuid, jsonb, jsonb, uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.brain_intake_apply_undo(uuid, uuid[], uuid[], uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.brain_intake_apply_undo(uuid, uuid[], uuid[], uuid) TO authenticated, service_role;
