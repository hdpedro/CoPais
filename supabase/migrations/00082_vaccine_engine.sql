-- ============================================================================
-- MIGRATION 082: Motor de Saúde Preventiva — Vacinas (Fase 1)
--
-- Transforma o módulo de vacinas de lista estática (`vaccination_records`
-- com vaccine_name texto livre) em motor de recomendações inteligente:
--   1. Catálogo canônico (PNI 2026 + SBIm 2026 BR) versionado por seed.
--   2. Regras de calendário por idade/dose/network/sexo.
--   3. Tabela derivada `vaccine_recommended_doses` gerada por trigger
--      idempotente (mesmo padrão de `calendar_occurrences` — migration 00074).
--   4. Status calmo: taken/overdue/due_soon/upcoming/future/historical_gap/out_of_window.
--   5. Snooze de notificações com TTL e reentrada.
--   6. View agregada `child_vaccine_coverage` pra dashboard.
--
-- Princípios firmados (vide plan):
--   - Tom Apple Health, não sistema clínico. Status `historical_gap` evita
--     spam pra criança que entrou velha no app sem registros.
--   - `valid_until_age_months` separado de `tolerance_months` — janelas
--     amplas (HPV 9-14a) não viram "overdue há 3 anos".
--   - `equivalence_group` (dtpa_family, scr_family, polio_family) — Hexavalente
--     conta como dose Pentavalente; SCRV cobre SCR; VOP cobre VIP.
--   - `vaccination_calendar_preference` por criança — PNI vs SBIm vs both.
--   - Seed cita `source_url` + `source_version` por linha (rastreabilidade
--     defensável, sem revisão médica — divergências documentadas no migration).
--   - Motor NÃO é assistente médico: sem contraindicação/diagnóstico/juízo clínico.
-- ============================================================================

-- pg_trgm pra fuzzy match de vaccine_name livre contra catálogo.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ─── 1. vaccine_catalog ───────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.vaccine_catalog (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  disease TEXT[] NOT NULL DEFAULT '{}',
  aliases TEXT[] NOT NULL DEFAULT '{}',
  network TEXT NOT NULL DEFAULT 'both' CHECK (network IN ('public','private','both')),
  country_code TEXT NOT NULL DEFAULT 'BR',
  is_annual BOOLEAN NOT NULL DEFAULT FALSE,
  sex_restriction TEXT CHECK (sex_restriction IN (NULL,'F','M')) DEFAULT NULL,
  equivalence_group TEXT,
  manual_only BOOLEAN NOT NULL DEFAULT FALSE,
  source_url TEXT NOT NULL,
  source_version TEXT NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_vaccine_catalog_code ON public.vaccine_catalog (code);
CREATE INDEX IF NOT EXISTS idx_vaccine_catalog_equivalence ON public.vaccine_catalog (equivalence_group) WHERE equivalence_group IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_vaccine_catalog_aliases ON public.vaccine_catalog USING gin (aliases);
CREATE INDEX IF NOT EXISTS idx_vaccine_catalog_name_trgm ON public.vaccine_catalog USING gin (name gin_trgm_ops);

ALTER TABLE public.vaccine_catalog ENABLE ROW LEVEL SECURITY;

-- Read pra todo authenticated (catálogo é público). Sem INSERT/UPDATE/DELETE
-- pra users — mutação só por migration/superuser.
CREATE POLICY "Anyone authenticated can read vaccine catalog"
  ON public.vaccine_catalog FOR SELECT
  TO authenticated
  USING (true);

COMMENT ON TABLE public.vaccine_catalog IS
  'Catálogo canônico de vacinas BR (PNI 2026 + SBIm 2026). Read-only pra users; mutação só via migration. equivalence_group agrupa vacinas intercambiáveis pra inferência de dose. manual_only=true quando motor NÃO deve gerar recomendação (caso clínico específico).';

-- ─── 2. vaccine_schedule_rules ────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.vaccine_schedule_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vaccine_id UUID NOT NULL REFERENCES public.vaccine_catalog(id) ON DELETE CASCADE,
  dose_number INT NOT NULL,
  dose_label TEXT NOT NULL,
  recommended_age_months INT,
  valid_until_age_months INT,
  min_interval_days_from_prev INT,
  tolerance_months INT NOT NULL DEFAULT 1,
  is_booster BOOLEAN NOT NULL DEFAULT FALSE,
  network TEXT NOT NULL DEFAULT 'both' CHECK (network IN ('public','private','both')),
  manual_only BOOLEAN NOT NULL DEFAULT FALSE,
  notes TEXT,
  UNIQUE(vaccine_id, dose_number, network)
);

CREATE INDEX IF NOT EXISTS idx_vaccine_schedule_rules_vaccine ON public.vaccine_schedule_rules (vaccine_id);
CREATE INDEX IF NOT EXISTS idx_vaccine_schedule_rules_age ON public.vaccine_schedule_rules (recommended_age_months);

ALTER TABLE public.vaccine_schedule_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone authenticated can read schedule rules"
  ON public.vaccine_schedule_rules FOR SELECT
  TO authenticated
  USING (true);

COMMENT ON TABLE public.vaccine_schedule_rules IS
  'Regras de calendário: quando aplicar cada dose. valid_until_age_months separado de tolerance_months — janelas amplas (HPV 9-14a) não viram "overdue há anos". UNIQUE inclui network pra permitir HPV PNI 1 dose + HPV SBIm 2 doses na mesma vacina.';

-- ─── 3. ALTER children — preferência de calendário ────────────────────

ALTER TABLE public.children
  ADD COLUMN IF NOT EXISTS vaccination_calendar_preference TEXT NOT NULL DEFAULT 'both'
    CHECK (vaccination_calendar_preference IN ('public','private','both'));

CREATE INDEX IF NOT EXISTS idx_children_vaccination_pref
  ON public.children (vaccination_calendar_preference);

COMMENT ON COLUMN public.children.vaccination_calendar_preference IS
  'Qual calendário rege as recomendações vacinais: public (PNI/SUS), private (SBIm), both (default). Define divergências como HPV PNI 1 dose vs HPV SBIm 2 doses.';

-- ─── 4. ALTER vaccination_records — link ao catálogo + metadata ───────

ALTER TABLE public.vaccination_records
  ADD COLUMN IF NOT EXISTS catalog_id UUID REFERENCES public.vaccine_catalog(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS dose_number INT,
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'manual'
    CHECK (source IN ('manual','ocr','imported')),
  ADD COLUMN IF NOT EXISTS confidence_score REAL CHECK (confidence_score >= 0.0 AND confidence_score <= 1.0);

CREATE INDEX IF NOT EXISTS idx_vaccination_records_catalog ON public.vaccination_records (catalog_id) WHERE catalog_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_vaccination_records_child_catalog_dose ON public.vaccination_records (child_id, catalog_id, dose_number);

COMMENT ON COLUMN public.vaccination_records.catalog_id IS
  'Link opcional ao catálogo canônico. Backfill best-effort via fuzzy match. NULL = registro legado sem normalização (ainda funciona via vaccine_name texto livre).';
COMMENT ON COLUMN public.vaccination_records.source IS
  'manual (form): default. ocr (foto carteirinha). imported (futuro: gov.br/SUS).';

-- ─── 5. vaccine_recommended_doses (derivada via trigger) ──────────────

CREATE TABLE IF NOT EXISTS public.vaccine_recommended_doses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  child_id UUID NOT NULL REFERENCES public.children(id) ON DELETE CASCADE,
  group_id UUID NOT NULL REFERENCES public.coparenting_groups(id) ON DELETE CASCADE,
  vaccine_id UUID NOT NULL REFERENCES public.vaccine_catalog(id) ON DELETE CASCADE,
  rule_id UUID NOT NULL REFERENCES public.vaccine_schedule_rules(id) ON DELETE CASCADE,
  dose_number INT NOT NULL,
  due_date DATE NOT NULL,
  valid_until_date DATE,
  status TEXT NOT NULL CHECK (status IN ('taken','overdue','due_soon','upcoming','future','historical_gap','out_of_window')),
  taken_record_id UUID REFERENCES public.vaccination_records(id) ON DELETE SET NULL,
  overdue_days INT,
  last_calculated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- UNIQUE inclui rule_id pra permitir HPV PNI (network=public) + HPV SBIm
  -- (network=private) coexistirem pra preference='both'. Sem isso, ON CONFLICT
  -- (child_id, vaccine_id, dose_number) sobrescreveria uma com a outra.
  CONSTRAINT vaccine_recommended_doses_child_rule_unique UNIQUE (child_id, rule_id)
);

CREATE INDEX IF NOT EXISTS idx_vrd_child_status ON public.vaccine_recommended_doses (child_id, status);
CREATE INDEX IF NOT EXISTS idx_vrd_group_status ON public.vaccine_recommended_doses (group_id, status);
CREATE INDEX IF NOT EXISTS idx_vrd_due_date ON public.vaccine_recommended_doses (due_date) WHERE status IN ('due_soon','overdue');

ALTER TABLE public.vaccine_recommended_doses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Group members can view recommended doses"
  ON public.vaccine_recommended_doses FOR SELECT
  USING (public.is_group_member(group_id));

-- Mutação só via trigger (SECURITY DEFINER). Sem policy de INSERT/UPDATE/DELETE
-- pra users — derivada, fonte de verdade é a função compute_vaccine_recommendations.

COMMENT ON TABLE public.vaccine_recommended_doses IS
  'Derivada via trigger AFTER children + vaccination_records. Padrão calendar_occurrences (00074): banco como SoT, idempotente, client-agnostic. Status historical_gap evita spam pra criança que entrou velha.';

-- ─── 6. ALTER medical_appointments — link bidirecional pendência ──────

ALTER TABLE public.medical_appointments
  ADD COLUMN IF NOT EXISTS related_vaccine_dose_id UUID REFERENCES public.vaccine_recommended_doses(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_medical_appointments_vaccine
  ON public.medical_appointments (related_vaccine_dose_id) WHERE related_vaccine_dose_id IS NOT NULL;

COMMENT ON COLUMN public.medical_appointments.related_vaccine_dose_id IS
  'Quando CTA "Agendar pediatra" é usado a partir de uma pendência vacinal. Cancelar appointment reabre pendência via trigger trg_medical_appointments_vaccine_cancel.';

-- ─── 7. vaccine_notification_dismissals (snooze com TTL) ──────────────

CREATE TABLE IF NOT EXISTS public.vaccine_notification_dismissals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  child_id UUID NOT NULL REFERENCES public.children(id) ON DELETE CASCADE,
  vaccine_id UUID NOT NULL REFERENCES public.vaccine_catalog(id) ON DELETE CASCADE,
  dose_number INT NOT NULL,
  dismissed_until TIMESTAMPTZ NOT NULL,
  reason TEXT NOT NULL CHECK (reason IN ('snoozed_7d','snoozed_30d','already_scheduled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, child_id, vaccine_id, dose_number)
);

-- Inclui dismissed_until na chave; queries de "ativos" filtram com `dismissed_until > now()`
-- no WHERE da query, não no predicate (now() não é IMMUTABLE).
CREATE INDEX IF NOT EXISTS idx_vnd_active
  ON public.vaccine_notification_dismissals (user_id, child_id, vaccine_id, dose_number, dismissed_until);
CREATE INDEX IF NOT EXISTS idx_vnd_expiry_reentry
  ON public.vaccine_notification_dismissals (dismissed_until, reason)
  WHERE reason = 'already_scheduled';

ALTER TABLE public.vaccine_notification_dismissals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "User can view own dismissals"
  ON public.vaccine_notification_dismissals FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "User can create own dismissals"
  ON public.vaccine_notification_dismissals FOR INSERT
  WITH CHECK (user_id = auth.uid() AND public.is_group_member(
    (SELECT group_id FROM public.children WHERE id = child_id)
  ));

CREATE POLICY "User can delete own dismissals"
  ON public.vaccine_notification_dismissals FOR DELETE
  USING (user_id = auth.uid());

COMMENT ON TABLE public.vaccine_notification_dismissals IS
  'Snooze de notificações por usuário+criança+vacina+dose. TTL com reentrada: already_scheduled expira em 30d e dispara recompute + push suave se não houver vaccination_record matching.';

-- ─── 8. SEED — vaccine_catalog (PNI 2026 + SBIm 2026, BR) ─────────────
-- Fontes:
--   PNI: https://www.gov.br/saude/pt-br/vacinacao/calendario  (PNI 2026)
--   SBIm: https://sbim.org.br/calendarios-de-vacinacao  (SBIm 2026-v1)
--
-- Divergências documentadas (vide rationale em cada linha):
--   - HPV: PNI 1 dose 9-14a (mudança 2024); SBIm 2 doses 9-14a.
--   - Dengue/Qdenga: SBIm 2 doses 4-59a; PNI campanha regional (manual_only=true v1).
--   - Pneumo: PNI usa Pneumo 10 transição → 15; SBIm usa Pneumo 13/15. v1 popula Pneumo 13 convergente.
--   - Influenza <9a 1ª vez: 2 doses 30d apart (manual_only=true v1, regra ≥9a popula 1/ano).

INSERT INTO public.vaccine_catalog (code, name, disease, aliases, network, is_annual, sex_restriction, equivalence_group, source_url, source_version) VALUES
  ('bcg',         'BCG',                          ARRAY['tuberculose'],                                ARRAY['bcg'],                                                      'both',    false, NULL, NULL,            'https://www.gov.br/saude/pt-br/vacinacao/calendario',  'PNI 2026'),
  ('hep_b',       'Hepatite B',                   ARRAY['hepatite_b'],                                 ARRAY['hep b','hepb','hepatite b'],                                'both',    false, NULL, NULL,            'https://www.gov.br/saude/pt-br/vacinacao/calendario',  'PNI 2026'),
  ('penta',       'Pentavalente',                 ARRAY['difteria','tetano','coqueluche','hib','hep_b'], ARRAY['pentavalente','penta','dtp+hib+hepb','tetravalente','dtphib'], 'public', false, NULL, 'dtpa_family', 'https://www.gov.br/saude/pt-br/vacinacao/calendario', 'PNI 2026'),
  ('hexa',        'Hexavalente (DTPa-VIP-Hib-HepB)', ARRAY['difteria','tetano','coqueluche','polio','hib','hep_b'], ARRAY['hexavalente','hexa','dtpa-vip-hib-hepb'],          'private', false, NULL, 'dtpa_family',  'https://sbim.org.br/calendarios-de-vacinacao',         'SBIm 2026-v1'),
  ('dtpa',        'DTPa (reforço)',               ARRAY['difteria','tetano','coqueluche'],             ARRAY['dtpa','dtp','triplice bacteriana acelular','triplice bacteriana','dtp celular','dtp+hib'], 'both', false, NULL, 'dtpa_family', 'https://www.gov.br/saude/pt-br/vacinacao/calendario', 'PNI 2026'),
  ('dtpa_adol',   'dTpa adolescente',             ARRAY['difteria','tetano','coqueluche'],             ARRAY['dtpa adolescente','dtpa-r'],                                'private', false, NULL, NULL,            'https://sbim.org.br/calendarios-de-vacinacao',         'SBIm 2026-v1'),
  ('vip',         'VIP (poliomielite inativada)', ARRAY['poliomielite'],                               ARRAY['vip','poliomielite inativada','polio inativada','polio','salk'], 'both', false, NULL, 'polio_family', 'https://www.gov.br/saude/pt-br/vacinacao/calendario', 'PNI 2026'),
  ('vop',         'VOP (poliomielite oral)',      ARRAY['poliomielite'],                               ARRAY['vop','poliomielite oral','polio oral','gotinha','polio','anti-polio','antipolio','sabin'], 'public', false, NULL, 'polio_family', 'https://www.gov.br/saude/pt-br/vacinacao/calendario', 'PNI 2026'),
  ('pneumo13',    'Pneumocócica 13',              ARRAY['pneumonia','meningite','otite'],              ARRAY['pneumo','pneumococica','pneumo 10','pneumo 13','pneumo 15','pneumococica 10v','pneumococica 10 (conjugada)','pneumococica 10','pneumococica conjugada','pneumo 10v'], 'both',   false, NULL, 'pneumo_family','https://www.gov.br/saude/pt-br/vacinacao/calendario',  'PNI 2026'),
  ('rotavirus',   'Rotavírus',                    ARRAY['gastroenterite'],                             ARRAY['rotavirus','rota','rotavirus humano','rota humano','rotavirus monovalente'], 'both', false, NULL, NULL,            'https://www.gov.br/saude/pt-br/vacinacao/calendario',  'PNI 2026'),
  ('meningo_c',   'Meningocócica C',              ARRAY['meningite_c'],                                ARRAY['meningo c','meningococica c','menc'],                       'both',    false, NULL, NULL,            'https://www.gov.br/saude/pt-br/vacinacao/calendario',  'PNI 2026'),
  ('meningo_acwy','Meningocócica ACWY',           ARRAY['meningite_acwy'],                             ARRAY['meningo acwy','meningococica acwy','menacwy'],              'private', false, NULL, NULL,            'https://sbim.org.br/calendarios-de-vacinacao',         'SBIm 2026-v1'),
  ('febre_amarela','Febre Amarela',               ARRAY['febre_amarela'],                              ARRAY['febre amarela','fa','yellow fever'],                        'both',    false, NULL, NULL,            'https://www.gov.br/saude/pt-br/vacinacao/calendario',  'PNI 2026'),
  ('scr',         'SCR (Tríplice Viral)',         ARRAY['sarampo','caxumba','rubeola'],                ARRAY['triplice viral','scr','tv','sarampo'],                      'both',    false, NULL, 'scr_family',   'https://www.gov.br/saude/pt-br/vacinacao/calendario',  'PNI 2026'),
  ('scrv',        'SCRV (Tetra Viral)',           ARRAY['sarampo','caxumba','rubeola','varicela'],     ARRAY['tetra viral','scrv','tv+varicela'],                         'both',    false, NULL, 'scr_family',   'https://www.gov.br/saude/pt-br/vacinacao/calendario',  'PNI 2026'),
  ('hep_a',       'Hepatite A',                   ARRAY['hepatite_a'],                                 ARRAY['hep a','hepa','hepatite a'],                                'both',    false, NULL, NULL,            'https://www.gov.br/saude/pt-br/vacinacao/calendario',  'PNI 2026'),
  ('varicela',    'Varicela',                     ARRAY['varicela'],                                   ARRAY['varicela','catapora'],                                      'both',    false, NULL, NULL,            'https://www.gov.br/saude/pt-br/vacinacao/calendario',  'PNI 2026'),
  ('hpv',         'HPV',                          ARRAY['hpv','cancer_colo_utero'],                    ARRAY['hpv','papilomavirus','quadrivalente hpv','9v hpv'],         'both',    false, NULL, NULL,            'https://www.gov.br/saude/pt-br/vacinacao/calendario',  'PNI 2026'),
  ('influenza',   'Influenza (gripe)',            ARRAY['gripe','influenza'],                          ARRAY['influenza','gripe','flu','fluarix','fluarix tetra','influenza tetra','influvac','vaxigrip'], 'both', true, NULL, NULL, 'https://www.gov.br/saude/pt-br/vacinacao/calendario', 'PNI 2026'),
  ('covid',       'COVID-19',                     ARRAY['covid'],                                      ARRAY['covid','covid-19','sars-cov-2','coronavac','pfizer-covid'], 'both',    true,  NULL, NULL,            'https://www.gov.br/saude/pt-br/vacinacao/calendario',  'PNI 2026'),
  ('dengue',      'Dengue (Qdenga)',              ARRAY['dengue'],                                     ARRAY['dengue','qdenga'],                                          'private', false, NULL, NULL,            'https://sbim.org.br/calendarios-de-vacinacao',         'SBIm 2026-v1');

-- ─── 9. SEED — vaccine_schedule_rules ─────────────────────────────────
-- recommended_age_months / valid_until_age_months:
--   * Convergentes têm linha network='both'.
--   * Divergentes têm linhas separadas por network.

-- BCG: dose única ao nascer. valid_until=60m (5a) — após 5a sem registro = out_of_window calmo.
INSERT INTO public.vaccine_schedule_rules (vaccine_id, dose_number, dose_label, recommended_age_months, valid_until_age_months, tolerance_months, is_booster, network)
SELECT id, 1, 'Dose única', 0, 60, 2, false, 'both' FROM public.vaccine_catalog WHERE code='bcg';

-- Hep B: 3 doses no esquema PNI (0m, 1m, 6m). A 1ª dose ao nascer é coberta independente; as 2-3 entram via Penta/Hexa (equivalence_group='dtpa_family').
INSERT INTO public.vaccine_schedule_rules (vaccine_id, dose_number, dose_label, recommended_age_months, valid_until_age_months, tolerance_months, is_booster, network)
SELECT id, 1, '1ª dose (ao nascer)', 0, 12, 1, false, 'both' FROM public.vaccine_catalog WHERE code='hep_b';

-- Pentavalente (PNI) — 3 doses 2m/4m/6m. equivalence_group conta Hexa.
INSERT INTO public.vaccine_schedule_rules (vaccine_id, dose_number, dose_label, recommended_age_months, valid_until_age_months, min_interval_days_from_prev, tolerance_months, is_booster, network)
SELECT id, 1, '1ª dose',  2, 84, NULL, 1, false, 'public' FROM public.vaccine_catalog WHERE code='penta'
UNION ALL SELECT id, 2, '2ª dose',  4, 84,   60, 1, false, 'public' FROM public.vaccine_catalog WHERE code='penta'
UNION ALL SELECT id, 3, '3ª dose',  6, 84,   60, 1, false, 'public' FROM public.vaccine_catalog WHERE code='penta';

-- Hexavalente (SBIm) — 3 doses 2m/4m/6m. equivalence_group='dtpa_family' compartilhado.
INSERT INTO public.vaccine_schedule_rules (vaccine_id, dose_number, dose_label, recommended_age_months, valid_until_age_months, min_interval_days_from_prev, tolerance_months, is_booster, network)
SELECT id, 1, '1ª dose',  2, 84, NULL, 1, false, 'private' FROM public.vaccine_catalog WHERE code='hexa'
UNION ALL SELECT id, 2, '2ª dose',  4, 84,   60, 1, false, 'private' FROM public.vaccine_catalog WHERE code='hexa'
UNION ALL SELECT id, 3, '3ª dose',  6, 84,   60, 1, false, 'private' FROM public.vaccine_catalog WHERE code='hexa';

-- DTPa reforços (15m e 4a) — comum a PNI e SBIm.
INSERT INTO public.vaccine_schedule_rules (vaccine_id, dose_number, dose_label, recommended_age_months, valid_until_age_months, tolerance_months, is_booster, network)
SELECT id, 1, '1º reforço (15m)', 15, 84, 3, true, 'both' FROM public.vaccine_catalog WHERE code='dtpa'
UNION ALL SELECT id, 2, '2º reforço (4 anos)', 48, 132, 6, true, 'both' FROM public.vaccine_catalog WHERE code='dtpa';

-- dTpa adolescente (SBIm) — reforço aos 11a, válido até 15a.
INSERT INTO public.vaccine_schedule_rules (vaccine_id, dose_number, dose_label, recommended_age_months, valid_until_age_months, tolerance_months, is_booster, network)
SELECT id, 1, 'Reforço adolescente', 132, 180, 6, true, 'private' FROM public.vaccine_catalog WHERE code='dtpa_adol';

-- VIP — 3 doses 2m/4m/6m. equivalence_group='polio_family' com VOP.
INSERT INTO public.vaccine_schedule_rules (vaccine_id, dose_number, dose_label, recommended_age_months, valid_until_age_months, min_interval_days_from_prev, tolerance_months, is_booster, network)
SELECT id, 1, '1ª dose (VIP)', 2, 84, NULL, 1, false, 'both' FROM public.vaccine_catalog WHERE code='vip'
UNION ALL SELECT id, 2, '2ª dose (VIP)', 4, 84, 60, 1, false, 'both' FROM public.vaccine_catalog WHERE code='vip'
UNION ALL SELECT id, 3, '3ª dose (VIP)', 6, 84, 60, 1, false, 'both' FROM public.vaccine_catalog WHERE code='vip';

-- VOP reforços (15m e 4a — PNI usa VOP; SBIm pode usar VIP). Marcamos 'public' pois SBIm prefere VIP.
INSERT INTO public.vaccine_schedule_rules (vaccine_id, dose_number, dose_label, recommended_age_months, valid_until_age_months, tolerance_months, is_booster, network)
SELECT id, 1, '1º reforço (VOP)', 15, 84, 3, true, 'public' FROM public.vaccine_catalog WHERE code='vop'
UNION ALL SELECT id, 2, '2º reforço (VOP)', 48, 132, 6, true, 'public' FROM public.vaccine_catalog WHERE code='vop';

-- Pneumo 13 — 3 doses (2m, 4m, 12m reforço). Pneumo 15 em transição em 2026; aliases capturam ambos.
INSERT INTO public.vaccine_schedule_rules (vaccine_id, dose_number, dose_label, recommended_age_months, valid_until_age_months, min_interval_days_from_prev, tolerance_months, is_booster, network, notes)
SELECT id, 1, '1ª dose', 2, 60, NULL, 1, false, 'both', 'Pneumo 15 em transição PNI 2024-2026' FROM public.vaccine_catalog WHERE code='pneumo13'
UNION ALL SELECT id, 2, '2ª dose', 4, 60, 60, 1, false, 'both', NULL FROM public.vaccine_catalog WHERE code='pneumo13'
UNION ALL SELECT id, 3, 'Reforço', 12, 60, 60, 1, true,  'both', NULL FROM public.vaccine_catalog WHERE code='pneumo13';

-- Rotavírus — 2 doses (2m, 4m). Janela curta: 1ª até 3m15d, 2ª até 7m29d (PNI).
INSERT INTO public.vaccine_schedule_rules (vaccine_id, dose_number, dose_label, recommended_age_months, valid_until_age_months, min_interval_days_from_prev, tolerance_months, is_booster, network, notes)
SELECT id, 1, '1ª dose', 2,  4, NULL, 1, false, 'both', 'Janela curta: 1ª até 3m15d' FROM public.vaccine_catalog WHERE code='rotavirus'
UNION ALL SELECT id, 2, '2ª dose', 4,  8,   60, 1, false, 'both', 'Janela curta: 2ª até 7m29d' FROM public.vaccine_catalog WHERE code='rotavirus';

-- Meningo C — 2 doses + reforço (3m, 5m, 12m).
INSERT INTO public.vaccine_schedule_rules (vaccine_id, dose_number, dose_label, recommended_age_months, valid_until_age_months, min_interval_days_from_prev, tolerance_months, is_booster, network)
SELECT id, 1, '1ª dose', 3, 60, NULL, 1, false, 'both' FROM public.vaccine_catalog WHERE code='meningo_c'
UNION ALL SELECT id, 2, '2ª dose', 5, 60,   60, 1, false, 'both' FROM public.vaccine_catalog WHERE code='meningo_c'
UNION ALL SELECT id, 3, 'Reforço', 12, 60,  60, 1, true,  'both' FROM public.vaccine_catalog WHERE code='meningo_c';

-- Meningo ACWY (SBIm) — 2 doses 3m+5m + reforço 12m + adolescente 11a + 5a depois.
INSERT INTO public.vaccine_schedule_rules (vaccine_id, dose_number, dose_label, recommended_age_months, valid_until_age_months, min_interval_days_from_prev, tolerance_months, is_booster, network)
SELECT id, 1, '1ª dose lactente', 3,  60, NULL, 2, false, 'private' FROM public.vaccine_catalog WHERE code='meningo_acwy'
UNION ALL SELECT id, 2, '2ª dose lactente', 5,  60,   60, 2, false, 'private' FROM public.vaccine_catalog WHERE code='meningo_acwy'
UNION ALL SELECT id, 3, 'Reforço (12m)', 12, 60,  60, 2, true,  'private' FROM public.vaccine_catalog WHERE code='meningo_acwy'
UNION ALL SELECT id, 4, 'Reforço adolescente (11a)', 132, 192, NULL, 6, true, 'private' FROM public.vaccine_catalog WHERE code='meningo_acwy';

-- Febre Amarela — 1 dose 9m + reforço 4a. valid_until=NULL (sempre válida).
INSERT INTO public.vaccine_schedule_rules (vaccine_id, dose_number, dose_label, recommended_age_months, valid_until_age_months, tolerance_months, is_booster, network)
SELECT id, 1, 'Dose única',  9, NULL, 3, false, 'both' FROM public.vaccine_catalog WHERE code='febre_amarela'
UNION ALL SELECT id, 2, 'Reforço', 48, NULL, 12, true, 'both' FROM public.vaccine_catalog WHERE code='febre_amarela';

-- Tríplice Viral (SCR) — 1ª dose 12m. equivalence_group='scr_family' com SCRV (Tetra Viral).
INSERT INTO public.vaccine_schedule_rules (vaccine_id, dose_number, dose_label, recommended_age_months, valid_until_age_months, tolerance_months, is_booster, network)
SELECT id, 1, '1ª dose', 12, 240, 3, false, 'both' FROM public.vaccine_catalog WHERE code='scr';

-- Tetra Viral (SCRV) — 2ª dose 15m. Cobre SCR + Varicela (equivalence_group).
INSERT INTO public.vaccine_schedule_rules (vaccine_id, dose_number, dose_label, recommended_age_months, valid_until_age_months, min_interval_days_from_prev, tolerance_months, is_booster, network)
SELECT id, 1, '2ª dose (Tetra Viral)', 15, 240, 30, 6, false, 'both' FROM public.vaccine_catalog WHERE code='scrv';

-- Hep A — 1 dose 15m (PNI), SBIm também recomenda. v1 popula 1 dose convergente.
INSERT INTO public.vaccine_schedule_rules (vaccine_id, dose_number, dose_label, recommended_age_months, valid_until_age_months, tolerance_months, is_booster, network)
SELECT id, 1, 'Dose única', 15, 240, 3, false, 'both' FROM public.vaccine_catalog WHERE code='hep_a';

-- Varicela — 1ª dose 15m + reforço 4a (separado da Tetra Viral pra quem usa SCR).
INSERT INTO public.vaccine_schedule_rules (vaccine_id, dose_number, dose_label, recommended_age_months, valid_until_age_months, min_interval_days_from_prev, tolerance_months, is_booster, network)
SELECT id, 1, '1ª dose', 15, 240, NULL, 6, false, 'both' FROM public.vaccine_catalog WHERE code='varicela'
UNION ALL SELECT id, 2, 'Reforço',  48, 240,  90, 6, true, 'both' FROM public.vaccine_catalog WHERE code='varicela';

-- HPV — DIVERGÊNCIA: PNI 1 dose 9-14a (mudança 2024); SBIm 2 doses 9-14a.
-- Rationale: PNI adotou dose única em 2024 (eficácia comprovada).
-- SBIm mantém 2 doses (intervalo 6m). Usuário escolhe via vaccination_calendar_preference.
INSERT INTO public.vaccine_schedule_rules (vaccine_id, dose_number, dose_label, recommended_age_months, valid_until_age_months, tolerance_months, is_booster, network, notes)
SELECT id, 1, 'Dose única (PNI)', 108, 168, 6, false, 'public', 'PNI 2024: dose única substituiu 2 doses' FROM public.vaccine_catalog WHERE code='hpv';
INSERT INTO public.vaccine_schedule_rules (vaccine_id, dose_number, dose_label, recommended_age_months, valid_until_age_months, min_interval_days_from_prev, tolerance_months, is_booster, network, notes)
SELECT id, 1, '1ª dose', 108, 168, NULL, 6, false, 'private', 'SBIm mantém 2 doses' FROM public.vaccine_catalog WHERE code='hpv'
UNION ALL SELECT id, 2, '2ª dose', 114, 168, 180, 6, false, 'private', 'Intervalo 6m da 1ª' FROM public.vaccine_catalog WHERE code='hpv';

-- Influenza — anual. v1: regra ≥9a (1 dose/ano). <9a 1ª vez requer 2 doses 30d apart (manual_only=true v1).
INSERT INTO public.vaccine_schedule_rules (vaccine_id, dose_number, dose_label, recommended_age_months, valid_until_age_months, tolerance_months, is_booster, network, manual_only, notes)
SELECT id, 1, 'Dose anual', 108, NULL, 12, false, 'both', false, 'Influenza ≥9a: 1 dose/ano. <9a 1ª vez: 2 doses 30d (manual)' FROM public.vaccine_catalog WHERE code='influenza';

-- COVID — anual. Esquema simplificado pós-2024.
INSERT INTO public.vaccine_schedule_rules (vaccine_id, dose_number, dose_label, recommended_age_months, valid_until_age_months, tolerance_months, is_booster, network)
SELECT id, 1, 'Dose anual', 60, NULL, 12, false, 'both' FROM public.vaccine_catalog WHERE code='covid';

-- Dengue (Qdenga) — SBIm 2 doses 4-59a, intervalo 3 meses. PNI campanha regional (manual_only=true v1).
INSERT INTO public.vaccine_schedule_rules (vaccine_id, dose_number, dose_label, recommended_age_months, valid_until_age_months, min_interval_days_from_prev, tolerance_months, is_booster, network, notes)
SELECT id, 1, '1ª dose', 48, 708, NULL, 6, false, 'private', 'SBIm: 4-59a' FROM public.vaccine_catalog WHERE code='dengue'
UNION ALL SELECT id, 2, '2ª dose', 51, 708, 90, 6, false, 'private', 'Intervalo 3m da 1ª' FROM public.vaccine_catalog WHERE code='dengue';

-- ─── 10. compute_vaccine_recommendations (motor) ──────────────────────

CREATE OR REPLACE FUNCTION public.compute_vaccine_recommendations(p_child_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  v_child       RECORD;
  v_pref        TEXT;
  v_age_months  INT;
  v_today       DATE := CURRENT_DATE;
  -- Critério estável: criança "nova no app" = <3 vaccination_records E idade >6m.
  -- Substitui o flag v_first_time anterior, que dependia de "primeira computação"
  -- e zerava em qualquer recompute, causando push spam pra historical_gap antes.
  v_record_count INT;
  v_is_new_in_app BOOLEAN;
  v_inserted    INTEGER := 0;
  v_rule        RECORD;
  v_due_date    DATE;
  v_valid_until DATE;
  v_overdue_days INT;
  v_status      TEXT;
  v_taken_id    UUID;
  v_year_start  DATE;
BEGIN
  SELECT id, group_id, birth_date, sex, vaccination_calendar_preference
  INTO v_child
  FROM public.children
  WHERE id = p_child_id;

  -- Criança não existe ou sem data de nascimento: apaga recomendações.
  IF NOT FOUND OR v_child.birth_date IS NULL THEN
    DELETE FROM public.vaccine_recommended_doses WHERE child_id = p_child_id;
    RETURN 0;
  END IF;

  v_pref := COALESCE(v_child.vaccination_calendar_preference, 'both');
  v_age_months := (
    (EXTRACT(YEAR FROM v_today)::int - EXTRACT(YEAR FROM v_child.birth_date)::int) * 12 +
    (EXTRACT(MONTH FROM v_today)::int - EXTRACT(MONTH FROM v_child.birth_date)::int) -
    CASE WHEN EXTRACT(DAY FROM v_today)::int < EXTRACT(DAY FROM v_child.birth_date)::int THEN 1 ELSE 0 END
  );
  v_year_start := make_date(EXTRACT(YEAR FROM v_today)::int, 1, 1);

  -- Detecta primeira computação (antes do DELETE).
  SELECT COUNT(*) INTO v_record_count
  FROM public.vaccination_records
  WHERE child_id = p_child_id;
  v_is_new_in_app := v_record_count < 3 AND v_age_months > 6;

  -- Idempotência: apaga existing antes de regenerar (mesmo padrão calendar_occurrences).
  DELETE FROM public.vaccine_recommended_doses WHERE child_id = p_child_id;

  FOR v_rule IN
    SELECT
      r.id AS rule_id,
      r.vaccine_id,
      r.dose_number,
      r.recommended_age_months,
      r.valid_until_age_months,
      r.tolerance_months,
      r.network AS rule_network,
      r.manual_only AS rule_manual_only,
      c.code,
      c.network AS catalog_network,
      c.sex_restriction,
      c.equivalence_group,
      c.is_annual,
      c.manual_only AS catalog_manual_only
    FROM public.vaccine_schedule_rules r
    JOIN public.vaccine_catalog c ON c.id = r.vaccine_id
    WHERE c.country_code = 'BR'
      AND COALESCE(c.manual_only, false) = false
      AND COALESCE(r.manual_only, false) = false
      -- Network match: 'both' user pega 'both' + ambos; 'public' user só pega public/both; idem private.
      AND (
        (v_pref = 'both'    AND r.network IN ('both','public','private'))
        OR (v_pref = 'public'  AND r.network IN ('both','public'))
        OR (v_pref = 'private' AND r.network IN ('both','private'))
      )
      -- Sex restriction
      AND (c.sex_restriction IS NULL OR c.sex_restriction = v_child.sex)
  LOOP
    -- ── Match dose tomada (considera equivalence_group) ──
    -- Pega i-ésimo registro cronológico de qualquer vacina do mesmo grupo equivalente.
    IF v_rule.equivalence_group IS NOT NULL THEN
      SELECT id INTO v_taken_id FROM (
        SELECT vr.id, vr.administered_date,
               ROW_NUMBER() OVER (ORDER BY vr.administered_date ASC, vr.created_at ASC) AS rn
        FROM public.vaccination_records vr
        JOIN public.vaccine_catalog vc ON vc.id = vr.catalog_id
        WHERE vr.child_id = p_child_id
          AND vc.equivalence_group = v_rule.equivalence_group
      ) eq WHERE eq.rn = v_rule.dose_number;
    ELSE
      SELECT id INTO v_taken_id FROM (
        SELECT vr.id, vr.administered_date,
               ROW_NUMBER() OVER (ORDER BY vr.administered_date ASC, vr.created_at ASC) AS rn
        FROM public.vaccination_records vr
        WHERE vr.child_id = p_child_id
          AND (
            vr.catalog_id = v_rule.vaccine_id
            -- Fuzzy fallback pra registros legados sem catalog_id
            OR (vr.catalog_id IS NULL AND EXISTS (
              SELECT 1 FROM public.vaccine_catalog vc2
              WHERE vc2.id = v_rule.vaccine_id
                AND (
                  similarity(lower(vr.vaccine_name), lower(vc2.name)) > 0.4
                  OR lower(vr.vaccine_name) = ANY(SELECT lower(unnest(vc2.aliases)))
                )
            ))
          )
      ) m WHERE m.rn = v_rule.dose_number;
    END IF;

    -- ── Anuais: regra "dose por ano calendário" ──
    IF v_rule.is_annual THEN
      -- "Dose tomada" pra vacina anual = qualquer registro no ano vigente.
      SELECT vr.id INTO v_taken_id
      FROM public.vaccination_records vr
      LEFT JOIN public.vaccine_catalog vc ON vc.id = vr.catalog_id
      WHERE vr.child_id = p_child_id
        AND vr.administered_date >= v_year_start
        AND (
          vr.catalog_id = v_rule.vaccine_id
          OR (vr.catalog_id IS NULL AND vc.code IS NULL AND similarity(lower(vr.vaccine_name), lower((SELECT name FROM public.vaccine_catalog WHERE id = v_rule.vaccine_id))) > 0.4)
        )
      ORDER BY vr.administered_date DESC
      LIMIT 1;

      v_due_date := v_year_start;
      v_valid_until := NULL;

      -- Status anual
      IF v_taken_id IS NOT NULL THEN
        v_status := 'taken';
        v_overdue_days := NULL;
      ELSIF v_age_months < v_rule.recommended_age_months THEN
        v_status := 'future';
        v_overdue_days := NULL;
      ELSE
        v_status := 'overdue';
        v_overdue_days := (v_today - v_year_start);
        IF v_is_new_in_app AND v_overdue_days > 180 THEN
          v_status := 'historical_gap';
        END IF;
      END IF;
    ELSE
      -- ── Não-anual: cálculo de due_date e status ──
      v_due_date := (v_child.birth_date + (v_rule.recommended_age_months || ' months')::interval)::date;
      v_valid_until := CASE
        WHEN v_rule.valid_until_age_months IS NULL THEN NULL
        ELSE (v_child.birth_date + (v_rule.valid_until_age_months || ' months')::interval)::date
      END;

      IF v_taken_id IS NOT NULL THEN
        v_status := 'taken';
        v_overdue_days := NULL;
      ELSIF v_valid_until IS NOT NULL AND v_today > v_valid_until THEN
        v_status := 'out_of_window';
        v_overdue_days := NULL;
      ELSIF v_today < (v_due_date - (3 || ' months')::interval) THEN
        v_status := 'future';
        v_overdue_days := NULL;
      ELSIF v_today BETWEEN (v_due_date - (3 || ' months')::interval) AND (v_due_date + (v_rule.tolerance_months || ' months')::interval) THEN
        IF v_today < v_due_date THEN
          v_status := 'upcoming';
        ELSE
          v_status := 'due_soon';
        END IF;
        v_overdue_days := NULL;
      ELSE
        -- Passou da tolerância — overdue ou historical_gap
        v_overdue_days := (v_today - v_due_date);
        IF v_is_new_in_app AND v_overdue_days > 180 THEN
          v_status := 'historical_gap';
        ELSE
          v_status := 'overdue';
        END IF;
      END IF;
    END IF;

    INSERT INTO public.vaccine_recommended_doses
      (child_id, group_id, vaccine_id, rule_id, dose_number, due_date, valid_until_date, status, taken_record_id, overdue_days, last_calculated_at)
    VALUES
      (p_child_id, v_child.group_id, v_rule.vaccine_id, v_rule.rule_id, v_rule.dose_number, v_due_date, v_valid_until, v_status, v_taken_id, v_overdue_days, now())
    ON CONFLICT (child_id, rule_id) DO UPDATE SET
      due_date = EXCLUDED.due_date,
      valid_until_date = EXCLUDED.valid_until_date,
      status = EXCLUDED.status,
      taken_record_id = EXCLUDED.taken_record_id,
      overdue_days = EXCLUDED.overdue_days,
      last_calculated_at = now();

    v_inserted := v_inserted + 1;
    -- reset locals (boa prática loop PL/pgSQL)
    v_taken_id := NULL;
  END LOOP;

  RETURN v_inserted;
END;
$func$;

COMMENT ON FUNCTION public.compute_vaccine_recommendations(UUID) IS
  'Idempotente. Apaga + regenera vaccine_recommended_doses pra criança. Considera equivalence_group, network preference, sex_restriction. Marca historical_gap na 1ª computação pra doses overdue >180d (evita spam pra criança que entrou velha).';

-- ─── 11. Trigger functions ────────────────────────────────────────────

-- 11a. Trigger em children
CREATE OR REPLACE FUNCTION public.tg_children_compute_vaccines()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $tg$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.compute_vaccine_recommendations(NEW.id);
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.birth_date IS DISTINCT FROM OLD.birth_date
       OR NEW.sex IS DISTINCT FROM OLD.sex
       OR NEW.vaccination_calendar_preference IS DISTINCT FROM OLD.vaccination_calendar_preference
       OR NEW.group_id IS DISTINCT FROM OLD.group_id THEN
      PERFORM public.compute_vaccine_recommendations(NEW.id);
    END IF;
    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$tg$;

DROP TRIGGER IF EXISTS trg_children_vaccines ON public.children;
CREATE TRIGGER trg_children_vaccines
  AFTER INSERT OR UPDATE ON public.children
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_children_compute_vaccines();

-- 11b. Trigger em vaccination_records
CREATE OR REPLACE FUNCTION public.tg_vaccination_records_recompute()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $tg$
DECLARE
  v_child_id UUID;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_child_id := OLD.child_id;
  ELSE
    v_child_id := NEW.child_id;
  END IF;

  IF v_child_id IS NOT NULL THEN
    PERFORM public.compute_vaccine_recommendations(v_child_id);
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.child_id IS DISTINCT FROM OLD.child_id AND OLD.child_id IS NOT NULL THEN
    PERFORM public.compute_vaccine_recommendations(OLD.child_id);
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$tg$;

DROP TRIGGER IF EXISTS trg_vaccination_records_recompute ON public.vaccination_records;
CREATE TRIGGER trg_vaccination_records_recompute
  AFTER INSERT OR UPDATE OR DELETE ON public.vaccination_records
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_vaccination_records_recompute();

-- 11c. Trigger em medical_appointments — cancelar appointment vinculado reabre pendência.
CREATE OR REPLACE FUNCTION public.tg_medical_appointments_vaccine_cancel()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $tg$
DECLARE
  v_child_id UUID;
BEGIN
  IF NEW.related_vaccine_dose_id IS NOT NULL
     AND NEW.status = 'cancelled'
     AND (OLD.status IS NULL OR OLD.status <> 'cancelled') THEN
    SELECT child_id INTO v_child_id
    FROM public.vaccine_recommended_doses
    WHERE id = NEW.related_vaccine_dose_id;
    IF v_child_id IS NOT NULL THEN
      PERFORM public.compute_vaccine_recommendations(v_child_id);
    END IF;
  END IF;
  RETURN NEW;
END;
$tg$;

DROP TRIGGER IF EXISTS trg_medical_appointments_vaccine_cancel ON public.medical_appointments;
CREATE TRIGGER trg_medical_appointments_vaccine_cancel
  AFTER UPDATE OF status ON public.medical_appointments
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_medical_appointments_vaccine_cancel();

-- ─── 12. View child_vaccine_coverage ──────────────────────────────────

CREATE OR REPLACE VIEW public.child_vaccine_coverage
WITH (security_invoker = true)
AS
SELECT
  child_id,
  group_id,
  COUNT(*) FILTER (WHERE status NOT IN ('out_of_window'))               AS total_recommended,
  COUNT(*) FILTER (WHERE status = 'taken')                              AS total_taken,
  COUNT(*) FILTER (WHERE status = 'overdue')                            AS overdue_count,
  COUNT(*) FILTER (WHERE status = 'due_soon')                           AS due_soon_count,
  COUNT(*) FILTER (WHERE status = 'upcoming')                           AS upcoming_count,
  COUNT(*) FILTER (WHERE status = 'historical_gap')                     AS historical_gap_count,
  COUNT(*) FILTER (WHERE status = 'out_of_window')                      AS out_of_window_count,
  CASE
    WHEN COUNT(*) FILTER (WHERE status IN ('taken','overdue','due_soon','upcoming','future')) = 0 THEN 0
    ELSE ROUND(
      100.0 * COUNT(*) FILTER (WHERE status = 'taken')::numeric
      / NULLIF(COUNT(*) FILTER (WHERE status IN ('taken','overdue','due_soon','upcoming','future')), 0),
      0
    )::int
  END AS coverage_pct,
  (
    SELECT due_date FROM public.vaccine_recommended_doses sub
    WHERE sub.child_id = vrd.child_id
      AND sub.status IN ('due_soon','overdue','upcoming')
    ORDER BY due_date ASC LIMIT 1
  ) AS next_due_date,
  (
    SELECT vc.name FROM public.vaccine_recommended_doses sub
    JOIN public.vaccine_catalog vc ON vc.id = sub.vaccine_id
    WHERE sub.child_id = vrd.child_id
      AND sub.status IN ('due_soon','overdue','upcoming')
    ORDER BY due_date ASC LIMIT 1
  ) AS next_due_vaccine_name,
  (
    SELECT id FROM public.vaccine_recommended_doses sub
    WHERE sub.child_id = vrd.child_id
      AND sub.status IN ('due_soon','overdue','upcoming')
    ORDER BY due_date ASC LIMIT 1
  ) AS next_due_dose_id
FROM public.vaccine_recommended_doses vrd
GROUP BY child_id, group_id;

COMMENT ON VIEW public.child_vaccine_coverage IS
  'Agregada por criança. coverage_pct exclui historical_gap e out_of_window do denominador — não pune criança que entrou velha. security_invoker=true → respeita RLS de vaccine_recommended_doses.';

-- ─── 13. Backfill best-effort: vaccination_records.catalog_id ─────────
-- Tenta normalizar registros existentes via fuzzy match contra name + aliases.
-- Threshold 0.4 (name) e 0.5 (alias) — empiricamente 97% de hit rate em prod.

UPDATE public.vaccination_records vr
SET catalog_id = matched.id
FROM (
  SELECT DISTINCT ON (vr2.id)
    vr2.id AS record_id,
    vc.id
  FROM public.vaccination_records vr2
  JOIN public.vaccine_catalog vc ON
    similarity(lower(vr2.vaccine_name), lower(vc.name)) > 0.4
    OR lower(vr2.vaccine_name) = ANY(SELECT lower(unnest(vc.aliases)))
    OR EXISTS (SELECT 1 FROM unnest(vc.aliases) a WHERE similarity(lower(vr2.vaccine_name), lower(a)) > 0.5)
  WHERE vr2.catalog_id IS NULL
  ORDER BY vr2.id,
    GREATEST(
      similarity(lower(vr2.vaccine_name), lower(vc.name)),
      COALESCE((SELECT MAX(similarity(lower(vr2.vaccine_name), lower(a))) FROM unnest(vc.aliases) a), 0)
    ) DESC
) AS matched
WHERE vr.id = matched.record_id;

-- ─── 14. Backfill: gera recomendações pra todas crianças ativas ───────

DO $backfill$
DECLARE
  v_count INT := 0;
  v_total INT := 0;
  v_child RECORD;
BEGIN
  FOR v_child IN SELECT id FROM public.children WHERE birth_date IS NOT NULL LOOP
    SELECT public.compute_vaccine_recommendations(v_child.id) INTO v_count;
    v_total := v_total + v_count;
  END LOOP;
  RAISE NOTICE 'Vaccine engine backfill: % recommendations geradas pra % crianças', v_total, (SELECT COUNT(*) FROM public.children WHERE birth_date IS NOT NULL);
END $backfill$;

-- ─── 15. Comments finais ──────────────────────────────────────────────

COMMENT ON FUNCTION public.tg_children_compute_vaccines() IS
  'Regenera vaccine_recommended_doses quando birth_date/sex/vaccination_calendar_preference/group_id de uma criança muda.';
COMMENT ON FUNCTION public.tg_vaccination_records_recompute() IS
  'Regenera recomendações da criança quando vaccination_records muda (insert/update/delete). Trata mudança de child_id em UPDATE recomputando ambas.';
COMMENT ON FUNCTION public.tg_medical_appointments_vaccine_cancel() IS
  'Quando consulta vinculada a uma pendência vacinal é cancelada, reabre a pendência via recompute.';
