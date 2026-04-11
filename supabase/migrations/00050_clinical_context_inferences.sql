-- ============================================================
-- 00050: Clinical Context Inferences + illness_episodes enrichment
-- Prescription OCR → clinical inference → history cross-reference
-- ============================================================

-- 1. Main inference table
CREATE TABLE IF NOT EXISTS public.clinical_context_inferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES public.coparenting_groups(id) ON DELETE CASCADE,
  child_id UUID NOT NULL REFERENCES public.children(id) ON DELETE CASCADE,
  source_type TEXT NOT NULL DEFAULT 'photo' CHECK (source_type IN ('photo', 'whatsapp', 'manual')),
  source_image_url TEXT,

  -- OCR output
  prescription_data JSONB NOT NULL DEFAULT '{}',
  -- Array of parsed medications
  medications_parsed JSONB NOT NULL DEFAULT '[]',
  -- Array of clinical inferences (per medication)
  clinical_inferences JSONB NOT NULL DEFAULT '[]',
  -- Cross-referenced history context
  history_context JSONB NOT NULL DEFAULT '{}',
  -- Human-readable summary (PT-BR)
  ai_summary TEXT,
  -- Generated alerts array
  alerts JSONB NOT NULL DEFAULT '[]',

  inference_confidence REAL,
  model_version TEXT,
  processing_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (processing_status IN ('pending', 'processing', 'completed', 'failed', 'partial')),

  created_by UUID NOT NULL REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_clinical_inferences_child ON public.clinical_context_inferences(child_id, created_at DESC);
CREATE INDEX idx_clinical_inferences_group ON public.clinical_context_inferences(group_id);
CREATE INDEX idx_clinical_inferences_status ON public.clinical_context_inferences(processing_status);
-- GIN index for medication name cache lookups
CREATE INDEX idx_clinical_inferences_meds ON public.clinical_context_inferences
  USING GIN (medications_parsed jsonb_path_ops);

ALTER TABLE public.clinical_context_inferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "clinical_inferences_select" ON public.clinical_context_inferences
  FOR SELECT USING (public.is_group_member(group_id));

CREATE POLICY "clinical_inferences_insert" ON public.clinical_context_inferences
  FOR INSERT WITH CHECK (public.is_group_member(group_id) AND created_by = auth.uid());

CREATE POLICY "clinical_inferences_update" ON public.clinical_context_inferences
  FOR UPDATE USING (created_by = auth.uid());

-- 2. Enrichment columns on illness_episodes
ALTER TABLE public.illness_episodes
  ADD COLUMN IF NOT EXISTS possible_causes_json JSONB,
  ADD COLUMN IF NOT EXISTS ai_summary TEXT,
  ADD COLUMN IF NOT EXISTS recurrence_flags_json JSONB,
  ADD COLUMN IF NOT EXISTS severity_level TEXT,
  ADD COLUMN IF NOT EXISTS inference_confidence REAL,
  ADD COLUMN IF NOT EXISTS last_ai_enriched_at TIMESTAMPTZ;
