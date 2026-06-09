-- ============================================================================
-- Migration 00115: care_routine_logs (Fase 2) — registro "Buscou? Sim/Não".
--
-- Accountability da rotina de leva/busca: o responsável (ou qualquer membro)
-- registra se a perna ACONTECEU. Base da métrica de corresponsabilidade (real)
-- e do follow-up "Buscou o João?" pós-horário.
--
-- NÃO é record colaborativo (não broadcast/awareness como overrides) — é um
-- registro factual. RLS simples por membro do grupo.
--
-- UNIQUE (child_id, occurrence_date, leg): 1 registro por perna/dia. O service
-- faz upsert (corrigir done↔missed sobrescreve). child_id já implica group.
-- Convenções espelhadas de 00112 (uuid_generate_v4, RLS is_group_member +
-- (select auth.uid()), DELETE policy, FK CASCADE/SET NULL).
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.care_routine_logs (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  group_id        UUID NOT NULL REFERENCES public.coparenting_groups(id) ON DELETE CASCADE,
  child_id        UUID NOT NULL REFERENCES public.children(id) ON DELETE CASCADE,
  occurrence_date DATE NOT NULL,
  leg             TEXT NOT NULL CHECK (leg IN ('dropoff', 'pickup')),
  status          TEXT NOT NULL CHECK (status IN ('done', 'missed')),
  reported_by     UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  note            TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT care_routine_logs_unique UNIQUE (child_id, occurrence_date, leg)
);

CREATE INDEX IF NOT EXISTS idx_care_routine_logs_group_date
  ON public.care_routine_logs(group_id, occurrence_date);
CREATE INDEX IF NOT EXISTS idx_care_routine_logs_child_id
  ON public.care_routine_logs(child_id);
CREATE INDEX IF NOT EXISTS idx_care_routine_logs_reported_by
  ON public.care_routine_logs(reported_by);

ALTER TABLE public.care_routine_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Group members can view care routine logs"
  ON public.care_routine_logs FOR SELECT
  USING (is_group_member(group_id));
CREATE POLICY "Group members can insert care routine logs"
  ON public.care_routine_logs FOR INSERT
  WITH CHECK (is_group_member(group_id) AND (reported_by = (select auth.uid())));
CREATE POLICY "Group members can update care routine logs"
  ON public.care_routine_logs FOR UPDATE
  USING (is_group_member(group_id));
CREATE POLICY "Group members can delete care routine logs"
  ON public.care_routine_logs FOR DELETE
  USING (is_group_member(group_id));

COMMENT ON TABLE public.care_routine_logs IS
  'Registro "Buscou? Sim/Não" da rotina de leva/busca (1 por criança/data/perna). Base da métrica de corresponsabilidade real + follow-up. Não é collab record.';

ANALYZE public.care_routine_logs;
