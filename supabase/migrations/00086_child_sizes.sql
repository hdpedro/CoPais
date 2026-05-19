-- ============================================================================
-- MIGRATION 086: child_sizes — Tamanhos da criança (sapato/calça/camiseta/casaco)
--
-- Dor real do coparenting: "vou comprar tênis, qual o número?" / "comprou
-- jaqueta, qual o tamanho?". Hoje resolvido em foto de etiqueta no WhatsApp
-- + memória do parent que comprou por último. Foundation Collab encaixa
-- naturalmente — push opcional quando o coparente atualiza, awareness sem
-- ter que perguntar.
--
-- Adoção da Foundation (00077): 7ª módulo, depois de school_log, expense, e
-- 5 tabelas de saúde (00080). Pattern idêntico:
--   1. priority collab_priority (default 'info' — não acorda ninguém)
--   2. WHEN branch em collab_record_group(record_type='child_size')
--   3. Trigger AFTER INSERT auto-mark-creator-read
--   4. Backfill (zero rows — tabela nova)
--
-- Semântica:
--   - Imutável por design: cada mudança = nova row. UPDATE permitido pra
--     correções de digitação/data; DELETE permitido pra remover entradas
--     erradas (hard delete; sem soft).
--   - "Tamanho atual" derivado: latest row per (child_id, kind).
--   - size_value é TEXT pra acomodar formatos mistos: "27", "27.5", "4 anos",
--     "P", "RN", "3-6m". size_value_numeric (nullable) preenchido auto pra
--     sapato (gráficos futuros).
--   - kind=other + custom_label = "Pijama", "Vestido", "Uniforme escolar".
--   - is_confirmation=true quando user re-afirma o mesmo valor via check-in
--     passivo ("ainda usa 27?"). Mantém histórico limpo.
-- ============================================================================

-- ─── 1. Enum ────────────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE public.size_kind AS ENUM ('shoe', 'pants', 'shirt', 'coat', 'other');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ─── 2. Tabela ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.child_sizes (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id            uuid NOT NULL REFERENCES public.coparenting_groups(id) ON DELETE CASCADE,
  child_id            uuid NOT NULL REFERENCES public.children(id) ON DELETE CASCADE,
  kind                public.size_kind NOT NULL,
  custom_label        text,
  size_value          text NOT NULL CHECK (length(size_value) BETWEEN 1 AND 24),
  size_value_numeric  numeric,
  recorded_on         date NOT NULL DEFAULT CURRENT_DATE,
  notes               text CHECK (notes IS NULL OR length(notes) <= 500),
  is_confirmation     boolean NOT NULL DEFAULT false,
  priority            public.collab_priority NOT NULL DEFAULT 'info',
  created_by          uuid NOT NULL REFERENCES auth.users(id),
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT child_sizes_custom_label_check CHECK (
    (kind = 'other' AND custom_label IS NOT NULL AND length(custom_label) BETWEEN 1 AND 40)
    OR (kind <> 'other' AND custom_label IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_child_sizes_child_kind_recorded
  ON public.child_sizes (child_id, kind, recorded_on DESC, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_child_sizes_group_priority
  ON public.child_sizes (group_id, priority);

-- ─── 3. updated_at trigger ──────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.set_updated_at_timestamp()
RETURNS TRIGGER LANGUAGE plpgsql AS $f$
BEGIN NEW.updated_at := now(); RETURN NEW; END;
$f$;

DROP TRIGGER IF EXISTS child_sizes_set_updated_at ON public.child_sizes;
CREATE TRIGGER child_sizes_set_updated_at
  BEFORE UPDATE ON public.child_sizes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_timestamp();

-- ─── 4. RLS ─────────────────────────────────────────────────────────
ALTER TABLE public.child_sizes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "child_sizes select" ON public.child_sizes;
CREATE POLICY "child_sizes select" ON public.child_sizes FOR SELECT
  USING (public.is_group_member(group_id));

DROP POLICY IF EXISTS "child_sizes insert" ON public.child_sizes;
CREATE POLICY "child_sizes insert" ON public.child_sizes FOR INSERT
  WITH CHECK (public.is_group_member(group_id) AND created_by = auth.uid());

-- Edit/Delete: qualquer member do group pode. Decisão de produto — sizes
-- são leves; mais útil permitir correção do que travar.
DROP POLICY IF EXISTS "child_sizes update" ON public.child_sizes;
CREATE POLICY "child_sizes update" ON public.child_sizes FOR UPDATE
  USING (public.is_group_member(group_id))
  WITH CHECK (public.is_group_member(group_id));

DROP POLICY IF EXISTS "child_sizes delete" ON public.child_sizes;
CREATE POLICY "child_sizes delete" ON public.child_sizes FOR DELETE
  USING (public.is_group_member(group_id));

-- ─── 5. Foundation Collab: record_type='child_size' ────────────────
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
    ELSE RETURN NULL;
  END CASE;
  RETURN v_group;
END;
$f$;

-- ─── 6. Trigger auto-mark-creator-read ─────────────────────────────
CREATE OR REPLACE FUNCTION public.child_sizes_auto_mark_creator_read()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $f$
BEGIN
  IF NEW.created_by IS NOT NULL THEN
    INSERT INTO public.collab_reads (record_type, record_id, user_id, read_at)
    VALUES ('child_size', NEW.id, NEW.created_by, now())
    ON CONFLICT (record_type, record_id, user_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$f$;

DROP TRIGGER IF EXISTS child_sizes_auto_mark_creator_read ON public.child_sizes;
CREATE TRIGGER child_sizes_auto_mark_creator_read
  AFTER INSERT ON public.child_sizes
  FOR EACH ROW EXECUTE FUNCTION public.child_sizes_auto_mark_creator_read();

-- ─── 7. Normaliza size_value_numeric pra sapato ────────────────────
-- Pra sapato, tenta extrair número de size_value automaticamente (suporta
-- "27", "27.5", "27 BR"). Não é estritamente necessário (caller pode passar),
-- mas evita inconsistência.
CREATE OR REPLACE FUNCTION public.child_sizes_normalize_numeric()
RETURNS TRIGGER LANGUAGE plpgsql AS $f$
BEGIN
  IF NEW.kind = 'shoe' AND NEW.size_value_numeric IS NULL THEN
    BEGIN
      NEW.size_value_numeric := (regexp_match(NEW.size_value, '\d+(\.\d+)?'))[1]::numeric;
    EXCEPTION WHEN OTHERS THEN NEW.size_value_numeric := NULL;
    END;
  END IF;
  RETURN NEW;
END;
$f$;

DROP TRIGGER IF EXISTS child_sizes_normalize_numeric ON public.child_sizes;
CREATE TRIGGER child_sizes_normalize_numeric
  BEFORE INSERT OR UPDATE OF size_value, kind ON public.child_sizes
  FOR EACH ROW EXECUTE FUNCTION public.child_sizes_normalize_numeric();

COMMENT ON TABLE public.child_sizes IS
  'Tamanhos da criança ao longo do tempo. Foundation Collab adoção 7. Histórico immutable; UPDATE pra correção; DELETE pra erro.';
