-- 00119_active_medications_care_type.sql
-- Discriminador de tipo de cuidado em active_medications.
--
-- Contexto: o registro de Saúde passou a oferecer 3 tipos no formulário —
-- Medicamento, Tratamento e Procedimento — mas os três eram gravados em
-- `active_medications` SEM distinção. No read-back (timeline, carteirinha de
-- emergência, push) todos voltavam como "💊 medicamento". Os ícones 🩹/🩺 só
-- existiam no input. Esta coluna fecha o gap: normalização na ESCRITA (padrão
-- do projeto) em vez de heurística na leitura.
--
-- Aditiva e backward-compatible: binários antigos que inserem SEM care_type
-- pegam o DEFAULT 'medication' (comportamento atual preservado). Registros
-- históricos (criados antes desta migration) ficam como 'medication' — não há
-- como inferir retroativamente se eram tratamento/procedimento.

ALTER TABLE public.active_medications
  ADD COLUMN IF NOT EXISTS care_type TEXT NOT NULL DEFAULT 'medication';

ALTER TABLE public.active_medications
  DROP CONSTRAINT IF EXISTS active_medications_care_type_check;

ALTER TABLE public.active_medications
  ADD CONSTRAINT active_medications_care_type_check
  CHECK (care_type IN ('medication', 'treatment', 'procedure'));
