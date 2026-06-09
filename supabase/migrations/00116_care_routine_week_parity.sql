-- ============================================================================
-- Migration 00116: care_routine_slots.week_parity — recorrência avançada (Fase 3)
--
-- Suporta pattern_type='alternating_week' (semana A/B): o slot só vale nas
-- semanas cuja paridade bate com week_parity (0/1). NULL = toda semana
-- (compat com weekly). Âncora de paridade: segunda-feira 2024-01-01 (resolver
-- weekParityOf em src/lib/care-routine-resolve.ts).
--
-- pattern_type='custody_based' NÃO usa week_parity nem responsible_id — o
-- responsável é derivado de custody_resolved no read (CHECK do 00112 já
-- permite responsible_id NULL p/ custody_based).
-- ============================================================================

ALTER TABLE public.care_routine_slots
  ADD COLUMN IF NOT EXISTS week_parity SMALLINT CHECK (week_parity IN (0, 1));

COMMENT ON COLUMN public.care_routine_slots.week_parity IS
  'Paridade A/B (0/1) p/ pattern_type=alternating_week. NULL = toda semana. Âncora: segunda 2024-01-01.';
