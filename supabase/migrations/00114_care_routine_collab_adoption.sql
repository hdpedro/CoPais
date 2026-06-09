-- ============================================================================
-- Migration 00114: Foundation Collab adoption — care_routine_override.
--
-- A troca pontual de leva/busca ("hoje eu busco") é um RECORD COLABORATIVO:
-- ciência bilateral (NÃO aprovação). Ao criar, o service dispara
-- notifyCollabCreate (push + inbox) pro outro responsável; a UI mostra
-- "⚠️ Aguardando ciência" até ele abrir (mark_collab_read).
--
-- Adoção mínima da Foundation (00077), seguindo o template de 00086 (child_size):
--   1. WHEN branch em collab_record_group(record_type='care_routine_override')
--      → RLS de collab_reads resolve o group da troca.
--   2. Trigger AFTER INSERT auto-mark-creator-read → o AUTOR já conta como
--      "ciente"; "aguardando ciência" só aparece pro outro responsável.
--
-- NÃO adicionamos coluna `priority` na tabela: o service passa priority
-- ('important') direto pro notifyCollabCreate; não há promoção server-side
-- (≠ illness grave→urgent).
-- ============================================================================

-- ─── 1. collab_record_group — re-cria com TODAS as branches + a nova ────────
--     (CREATE OR REPLACE: precisa re-listar as existentes pra não perdê-las.)
CREATE OR REPLACE FUNCTION public.collab_record_group(p_record_type TEXT, p_record_id UUID)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER STABLE
SET search_path = public AS $f$
DECLARE v_group UUID;
BEGIN
  CASE p_record_type
    WHEN 'school_log' THEN SELECT group_id INTO v_group FROM public.school_logs WHERE id = p_record_id;
    WHEN 'expense' THEN SELECT group_id INTO v_group FROM public.expenses WHERE id = p_record_id;
    WHEN 'medical_appointment' THEN SELECT group_id INTO v_group FROM public.medical_appointments WHERE id = p_record_id;
    WHEN 'illness_episode' THEN SELECT group_id INTO v_group FROM public.illness_episodes WHERE id = p_record_id;
    WHEN 'active_medication' THEN SELECT group_id INTO v_group FROM public.active_medications WHERE id = p_record_id;
    WHEN 'child_allergy' THEN SELECT group_id INTO v_group FROM public.child_allergies WHERE id = p_record_id;
    WHEN 'vaccination_record' THEN SELECT group_id INTO v_group FROM public.vaccination_records WHERE id = p_record_id;
    WHEN 'child_size' THEN SELECT group_id INTO v_group FROM public.child_sizes WHERE id = p_record_id;
    WHEN 'care_routine_override' THEN SELECT group_id INTO v_group FROM public.care_routine_overrides WHERE id = p_record_id;
    ELSE RETURN NULL;
  END CASE;
  RETURN v_group;
END;
$f$;

-- ─── 2. Trigger auto-mark-creator-read ──────────────────────────────────────
CREATE OR REPLACE FUNCTION public.care_routine_overrides_auto_mark_creator_read()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $f$
BEGIN
  IF NEW.created_by IS NOT NULL THEN
    INSERT INTO public.collab_reads (record_type, record_id, user_id, read_at)
    VALUES ('care_routine_override', NEW.id, NEW.created_by, now())
    ON CONFLICT (record_type, record_id, user_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$f$;

DROP TRIGGER IF EXISTS care_routine_overrides_auto_mark_creator_read ON public.care_routine_overrides;
CREATE TRIGGER care_routine_overrides_auto_mark_creator_read
  AFTER INSERT ON public.care_routine_overrides
  FOR EACH ROW EXECUTE FUNCTION public.care_routine_overrides_auto_mark_creator_read();
