-- ============================================================================
-- Migration 00112: Rotina de Leva & Busca (care routine) — tabelas base (Fase 1)
--
-- Camada de logística diária: quem LEVA (dropoff) e quem BUSCA (pickup) cada dia
-- da semana. Complementar à guarda noturna (custody_events) e ORTOGONAL a ela:
--   - NÃO deriva de custody_resolved, NÃO inverte em dia de swap.
--   - NÃO materializa calendar_occurrences — o weekday é computado no read pelo
--     resolver puro src/lib/care-routine-resolve.ts (rotina é minúscula).
--
-- Tabelas (Fase 1): slots (padrão semanal), overrides (troca pontual do dia),
-- reminder_sends (idempotência do cron de lembrete). care_routine_logs ("Buscou?")
-- entra na Fase 2.
--
-- Convenções espelhadas de custody_events (00001) + RLS (00002):
--   - id UUID DEFAULT uuid_generate_v4(); updated_at via trigger update_updated_at().
--   - RLS via is_group_member(group_id) (a função já encapsula auth.uid()); o
--     auth.uid() solto no INSERT vai em (select auth.uid()) — init-plan-safe
--     (padrão das migrations 00098-00100).
--   - DELETE policy em TODAS as tabelas (lição de 00108/00109).
--   - FKs de profiles/children/group em CASCADE/SET NULL (self-contained — NÃO
--     adiciona à dívida de FK NO ACTION que o purge_user/LGPD ainda vai limpar).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) care_routine_slots — o padrão semanal (1 linha por célula preenchida da
--    grade; <=10 por criança/semana: 5-7 dias x 2 pernas)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.care_routine_slots (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  group_id              UUID NOT NULL REFERENCES public.coparenting_groups(id) ON DELETE CASCADE,
  child_id              UUID NOT NULL REFERENCES public.children(id) ON DELETE CASCADE,
  weekday               SMALLINT NOT NULL CHECK (weekday BETWEEN 0 AND 6),  -- 0=Dom (getDay / EXTRACT(DOW) / DAY_NAMES)
  leg                   TEXT NOT NULL CHECK (leg IN ('dropoff', 'pickup')),
  pattern_type          TEXT NOT NULL DEFAULT 'weekly'
                          CHECK (pattern_type IN ('weekly', 'alternating_week', 'custody_based')),  -- Fase 1 implementa só 'weekly'
  responsible_id        UUID REFERENCES public.profiles(id) ON DELETE CASCADE,  -- NULL só p/ custody_based (derivado da guarda no read)
  time_of_day           TIME,                 -- opcional; dispara lembrete (cron)
  label                 TEXT,                 -- opcional: destino p/ copy humana ("escola", "creche")
  reminder_lead_minutes INTEGER,             -- NULL → categoryDefaultLead('dropoff'/'pickup') = 30min
  is_active             BOOLEAN NOT NULL DEFAULT TRUE,
  created_by            UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Integridade: só custody_based pode ter responsável nulo (weekly/alternating exigem responsável).
  CONSTRAINT care_routine_slots_responsible_required
    CHECK (responsible_id IS NOT NULL OR pattern_type = 'custody_based'),
  -- 1 célula por (grupo, criança, dia, perna). child_id NOT NULL → unique simples.
  CONSTRAINT care_routine_slots_unique UNIQUE (group_id, child_id, weekday, leg)
);

-- Read do painel: slots ativos do weekday de hoje, por grupo.
CREATE INDEX IF NOT EXISTS idx_care_routine_slots_group_weekday
  ON public.care_routine_slots(group_id, weekday) WHERE is_active;
-- FK indexes (evita seq scan sob RLS + cascade de delete) — mesma lição do 00098.
CREATE INDEX IF NOT EXISTS idx_care_routine_slots_child_id
  ON public.care_routine_slots(child_id);
CREATE INDEX IF NOT EXISTS idx_care_routine_slots_responsible_id
  ON public.care_routine_slots(responsible_id);

ALTER TABLE public.care_routine_slots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Group members can view care routine slots"
  ON public.care_routine_slots FOR SELECT
  USING (is_group_member(group_id));
CREATE POLICY "Group members can insert care routine slots"
  ON public.care_routine_slots FOR INSERT
  WITH CHECK (is_group_member(group_id) AND (created_by = (select auth.uid())));
CREATE POLICY "Group members can update care routine slots"
  ON public.care_routine_slots FOR UPDATE
  USING (is_group_member(group_id));
CREATE POLICY "Group members can delete care routine slots"
  ON public.care_routine_slots FOR DELETE
  USING (is_group_member(group_id));

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.care_routine_slots
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

COMMENT ON TABLE public.care_routine_slots IS
  'Padrão semanal de leva/busca (1 linha por célula da grade). weekday 0=Dom. pattern_type weekly (Fase 1) / alternating_week / custody_based (Fase 3). Resolvido no read (care-routine-resolve.ts), sem materialização.';

-- ----------------------------------------------------------------------------
-- 2) care_routine_overrides — troca pontual numa data específica ("hoje eu
--    busco"). Override vence o slot pra (criança, data, perna).
--    É um RECORD COLABORATIVO (ciência bilateral via Foundation collab_reads) —
--    a adoção (collab_record_group WHEN branch + auto-mark-creator-read) entra
--    na migration de adoção, junto do service de override.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.care_routine_overrides (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  group_id        UUID NOT NULL REFERENCES public.coparenting_groups(id) ON DELETE CASCADE,
  child_id        UUID NOT NULL REFERENCES public.children(id) ON DELETE CASCADE,
  occurrence_date DATE NOT NULL,
  leg             TEXT NOT NULL CHECK (leg IN ('dropoff', 'pickup')),
  responsible_id  UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  note            TEXT,
  created_by      UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT care_routine_overrides_unique UNIQUE (group_id, child_id, occurrence_date, leg)
);

CREATE INDEX IF NOT EXISTS idx_care_routine_overrides_group_date
  ON public.care_routine_overrides(group_id, occurrence_date);
CREATE INDEX IF NOT EXISTS idx_care_routine_overrides_child_id
  ON public.care_routine_overrides(child_id);
CREATE INDEX IF NOT EXISTS idx_care_routine_overrides_responsible_id
  ON public.care_routine_overrides(responsible_id);

ALTER TABLE public.care_routine_overrides ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Group members can view care routine overrides"
  ON public.care_routine_overrides FOR SELECT
  USING (is_group_member(group_id));
CREATE POLICY "Group members can insert care routine overrides"
  ON public.care_routine_overrides FOR INSERT
  WITH CHECK (is_group_member(group_id) AND (created_by = (select auth.uid())));
CREATE POLICY "Group members can update care routine overrides"
  ON public.care_routine_overrides FOR UPDATE
  USING (is_group_member(group_id));
CREATE POLICY "Group members can delete care routine overrides"
  ON public.care_routine_overrides FOR DELETE
  USING (is_group_member(group_id));

COMMENT ON TABLE public.care_routine_overrides IS
  'Troca pontual de leva/busca numa data ("hoje eu busco"). Vence o slot no read. Record colaborativo: ciência bilateral via Foundation collab_reads.';

-- ----------------------------------------------------------------------------
-- 3) care_routine_reminder_sends — ledger de idempotência do cron de lembrete
--    (espelha activity_reminder_sends). Escrito SÓ pelo cron (service role,
--    que bypassa RLS) → sem policies pra usuários comuns.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.care_routine_reminder_sends (
  child_id        UUID NOT NULL REFERENCES public.children(id) ON DELETE CASCADE,
  occurrence_date DATE NOT NULL,
  leg             TEXT NOT NULL CHECK (leg IN ('dropoff', 'pickup')),
  lead_minutes    INTEGER NOT NULL,
  user_id         UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  channel         TEXT NOT NULL DEFAULT 'push' CHECK (channel IN ('push', 'local', 'followup')),
  sent_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (child_id, occurrence_date, leg, lead_minutes, user_id, channel)
);

-- RLS ligado sem policies: ledger interno, escrito pelo cron (service role
-- bypassa RLS). Usuários comuns não leem/escrevem.
ALTER TABLE public.care_routine_reminder_sends ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.care_routine_reminder_sends IS
  'Idempotência do cron de lembrete de rotina (1 envio por criança/data/perna/lead/user/canal). Escrito só pelo service role.';

-- ----------------------------------------------------------------------------
-- 4) ANALYZE — atualiza stats pro planner enxergar os índices novos.
-- ----------------------------------------------------------------------------
ANALYZE public.care_routine_slots;
ANALYZE public.care_routine_overrides;
