-- ============================================================================
-- MIGRATION 080: Saúde — Foundation: Collaborative Records (3a adoção)
--
-- Estende a Foundation (migration 00077) pro módulo de Saúde, seguindo o
-- mesmo pattern de Escola (00077) e Despesas (00078). Vide `.claude/CLAUDE.md`
-- "Foundation: Collaborative Records" pro pattern completo.
--
-- Princípio: o valor não está em "armazenar saúde" — está em garantir que o
-- coparente saiba na hora certa do que precisa pra agir. Tabelas que adotam
-- a Foundation aqui são as que envolvem coordenação aguda entre coparentes
-- ("comprou remédio?", "vacinou?", "consulta marcada?", "Mia tem alergia?").
--
-- Adoções nesta migration (5 tabelas):
--   1. medical_appointments — "Marquei pediatra dia 20" — important
--   2. illness_episodes      — "Febre 38.5" — important (urgent se grave)
--   3. active_medications    — "Iniciou amoxicilina" — important
--   4. child_allergies       — "Alergia a Cefalexina" — important
--   5. vaccination_records   — "Tomou tríplice viral" — info
--
-- Adoções deliberadamente FORA da Foundation (separadas pra evitar spam):
--   - medication_doses  → alto volume (várias/dia); fica scoped ao remédio
--   - symptom_entries   → alto volume; coalesce no episode parent
--   - growth_records    → medição rotineira, sem ação pro outro pai
--   - child_medical_info → update raro (sangue/convênio); push simples basta
--   - medical_professionals → cadastro/diretório, não evento
--
-- Defaults de prioridade firmados nesta migration:
--   - appointments / medications / allergies: 'important' (default por COLUMN)
--   - illness_episodes:                       'important' (default por COLUMN);
--                                             severity='grave' → 'urgent' via TRIGGER
--   - vaccination_records:                    'info' (default por COLUMN)
--
-- Como cada módulo opta-in:
--   1. ALTER TABLE ADD COLUMN priority collab_priority NOT NULL DEFAULT '<x>'
--   2. WHEN '<record_type>' branch em collab_record_group()
--   3. Trigger AFTER INSERT auto-mark-creator-read (mirror do school)
--   4. Backfill collab_reads pra criadores históricos (sem isso tudo vira "Novo")
-- ============================================================================

-- ─── 1. Priority columns ────────────────────────────────────────────

-- medical_appointments: 'important' (default da coluna). UI pode subir pra
-- urgent se for consulta de emergência (Fase 2 — re-notify quando <24h).
ALTER TABLE public.medical_appointments
  ADD COLUMN IF NOT EXISTS priority public.collab_priority NOT NULL DEFAULT 'important';

CREATE INDEX IF NOT EXISTS idx_medical_appointments_priority
  ON public.medical_appointments (group_id, priority);

-- illness_episodes: 'important' por default; trigger abaixo promove pra
-- 'urgent' se severity='grave' (vide bloco 4). Caso UI já queira mandar
-- urgent direto, trigger respeita (só age se priority='info' ou default).
ALTER TABLE public.illness_episodes
  ADD COLUMN IF NOT EXISTS priority public.collab_priority NOT NULL DEFAULT 'important';

CREATE INDEX IF NOT EXISTS idx_illness_episodes_priority
  ON public.illness_episodes (group_id, priority);

-- active_medications: 'important' — outro coparente precisa continuar o
-- tratamento durante a guarda dele. Edit não dispara push (Foundation rule).
ALTER TABLE public.active_medications
  ADD COLUMN IF NOT EXISTS priority public.collab_priority NOT NULL DEFAULT 'important';

CREATE INDEX IF NOT EXISTS idx_active_medications_priority
  ON public.active_medications (group_id, priority);

-- child_allergies: 'important' — segurança / emergência. NÃO é 'urgent' por
-- default porque cadastro é informacional ("registramos a alergia"). Crise
-- alérgica entra como illness_episode com severity='grave'.
ALTER TABLE public.child_allergies
  ADD COLUMN IF NOT EXISTS priority public.collab_priority NOT NULL DEFAULT 'important';

CREATE INDEX IF NOT EXISTS idx_child_allergies_priority
  ON public.child_allergies (group_id, priority);

-- vaccination_records: 'info' — registro pro cartão; sem urgência operacional.
-- Outro coparente quer SABER mas não precisa agir.
ALTER TABLE public.vaccination_records
  ADD COLUMN IF NOT EXISTS priority public.collab_priority NOT NULL DEFAULT 'info';

CREATE INDEX IF NOT EXISTS idx_vaccination_records_priority
  ON public.vaccination_records (group_id, priority);

-- ─── 2. Estender collab_record_group (RLS lookup) ──────────────────

-- Adiciona 5 WHEN branches pra resolver record_type → group_id. Esta função
-- é SECURITY DEFINER pra que a policy de collab_reads possa fazer o lookup
-- sem o caller precisar SELECT direto em cada tabela do módulo.
CREATE OR REPLACE FUNCTION public.collab_record_group(p_record_type TEXT, p_record_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $f$
DECLARE
  v_group UUID;
BEGIN
  CASE p_record_type
    WHEN 'school_log' THEN
      SELECT group_id INTO v_group FROM public.school_logs WHERE id = p_record_id;
    WHEN 'expense' THEN
      SELECT group_id INTO v_group FROM public.expenses WHERE id = p_record_id;
    WHEN 'medical_appointment' THEN
      SELECT group_id INTO v_group FROM public.medical_appointments WHERE id = p_record_id;
    WHEN 'illness_episode' THEN
      SELECT group_id INTO v_group FROM public.illness_episodes WHERE id = p_record_id;
    WHEN 'active_medication' THEN
      SELECT group_id INTO v_group FROM public.active_medications WHERE id = p_record_id;
    WHEN 'child_allergy' THEN
      SELECT group_id INTO v_group FROM public.child_allergies WHERE id = p_record_id;
    WHEN 'vaccination_record' THEN
      SELECT group_id INTO v_group FROM public.vaccination_records WHERE id = p_record_id;
    ELSE
      RETURN NULL;
  END CASE;
  RETURN v_group;
END;
$f$;

-- ─── 3. Triggers auto-mark-creator-read ────────────────────────────

-- Pra cada uma das 5 tabelas: trigger AFTER INSERT que marca o criador como
-- "leu" (collab_reads row). Sem isso o próprio user veria o registro como
-- "Novo" no dashboard.
-- Função genérica: recebe record_type via TG_ARGV[0] e usa NEW.id + NEW.created_by.

CREATE OR REPLACE FUNCTION public.saude_auto_mark_creator_read()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $f$
DECLARE
  v_record_type TEXT := TG_ARGV[0];
BEGIN
  IF NEW.created_by IS NOT NULL THEN
    INSERT INTO public.collab_reads (record_type, record_id, user_id, read_at)
    VALUES (v_record_type, NEW.id, NEW.created_by, now())
    ON CONFLICT (record_type, record_id, user_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$f$;

-- 5 triggers, um por tabela. Idempotente via DROP IF EXISTS antes.
DROP TRIGGER IF EXISTS medical_appointments_auto_mark_creator_read ON public.medical_appointments;
CREATE TRIGGER medical_appointments_auto_mark_creator_read
  AFTER INSERT ON public.medical_appointments
  FOR EACH ROW
  EXECUTE FUNCTION public.saude_auto_mark_creator_read('medical_appointment');

DROP TRIGGER IF EXISTS illness_episodes_auto_mark_creator_read ON public.illness_episodes;
CREATE TRIGGER illness_episodes_auto_mark_creator_read
  AFTER INSERT ON public.illness_episodes
  FOR EACH ROW
  EXECUTE FUNCTION public.saude_auto_mark_creator_read('illness_episode');

DROP TRIGGER IF EXISTS active_medications_auto_mark_creator_read ON public.active_medications;
CREATE TRIGGER active_medications_auto_mark_creator_read
  AFTER INSERT ON public.active_medications
  FOR EACH ROW
  EXECUTE FUNCTION public.saude_auto_mark_creator_read('active_medication');

DROP TRIGGER IF EXISTS child_allergies_auto_mark_creator_read ON public.child_allergies;
CREATE TRIGGER child_allergies_auto_mark_creator_read
  AFTER INSERT ON public.child_allergies
  FOR EACH ROW
  EXECUTE FUNCTION public.saude_auto_mark_creator_read('child_allergy');

DROP TRIGGER IF EXISTS vaccination_records_auto_mark_creator_read ON public.vaccination_records;
CREATE TRIGGER vaccination_records_auto_mark_creator_read
  AFTER INSERT ON public.vaccination_records
  FOR EACH ROW
  EXECUTE FUNCTION public.saude_auto_mark_creator_read('vaccination_record');

-- ─── 4. illness severity='grave' → priority='urgent' (server enforce) ──

-- Decisão de produto: doenças graves disparam push 'urgent' AUTOMATICAMENTE
-- no server, sem depender do client se lembrar de marcar. Isso evita o caso
-- "Diogo cadastrou febre alta como 'important' por engano e o outro pai só
-- viu de manhã". UI ainda pode mandar 'urgent' explícito pra outras severidades
-- (caso queira), trigger só sobrescreve quando priority chega como 'important'
-- (o default da coluna) — preserva intenção explícita do client.
--
-- ATENÇÃO: schema de severity em illness_episodes é 'leve'/'moderado'/'grave'
-- (migration 00013). NÃO 'severe' (inglês), NÃO 'forte' (esse é de sintomas).
-- Bug Diogo 2026-05-13 corrigido nesta mesma semana — ver health.ts service.
CREATE OR REPLACE FUNCTION public.illness_episodes_grave_to_urgent()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $f$
BEGIN
  -- Só promove pra urgent se o caller deixou priority no default ('important').
  -- Se vier 'urgent' explícito, mantém. Se vier 'info', mantém (cliente sabe
  -- o que está fazendo). Isso é importante pra não anular a intenção do user.
  IF NEW.severity = 'grave' AND NEW.priority = 'important' THEN
    NEW.priority := 'urgent';
  END IF;
  RETURN NEW;
END;
$f$;

DROP TRIGGER IF EXISTS illness_episodes_grave_to_urgent ON public.illness_episodes;
CREATE TRIGGER illness_episodes_grave_to_urgent
  BEFORE INSERT OR UPDATE OF severity ON public.illness_episodes
  FOR EACH ROW
  EXECUTE FUNCTION public.illness_episodes_grave_to_urgent();

-- ─── 5. Backfill — collab_reads pros criadores existentes ───────────

-- Sem isso, todo registro de Saúde criado antes desta migration apareceria
-- como "Novo" pro próprio criador no dashboard. Idempotente via PK.
-- Note: usamos `created_at` original como read_at pra refletir o tempo real.

INSERT INTO public.collab_reads (record_type, record_id, user_id, read_at)
SELECT 'medical_appointment', id, created_by, COALESCE(created_at, now())
FROM public.medical_appointments
WHERE created_by IS NOT NULL
ON CONFLICT (record_type, record_id, user_id) DO NOTHING;

INSERT INTO public.collab_reads (record_type, record_id, user_id, read_at)
SELECT 'illness_episode', id, created_by, COALESCE(created_at, now())
FROM public.illness_episodes
WHERE created_by IS NOT NULL
ON CONFLICT (record_type, record_id, user_id) DO NOTHING;

INSERT INTO public.collab_reads (record_type, record_id, user_id, read_at)
SELECT 'active_medication', id, created_by, COALESCE(created_at, now())
FROM public.active_medications
WHERE created_by IS NOT NULL
ON CONFLICT (record_type, record_id, user_id) DO NOTHING;

INSERT INTO public.collab_reads (record_type, record_id, user_id, read_at)
SELECT 'child_allergy', id, created_by, COALESCE(created_at, now())
FROM public.child_allergies
WHERE created_by IS NOT NULL
ON CONFLICT (record_type, record_id, user_id) DO NOTHING;

INSERT INTO public.collab_reads (record_type, record_id, user_id, read_at)
SELECT 'vaccination_record', id, created_by, COALESCE(created_at, now())
FROM public.vaccination_records
WHERE created_by IS NOT NULL
ON CONFLICT (record_type, record_id, user_id) DO NOTHING;

-- ─── 6. Sanity comment pro próximo módulo que adotar ────────────────

COMMENT ON FUNCTION public.collab_record_group(TEXT, UUID) IS
'Foundation: resolve record_type → group_id. Atualizada por cada adoção. Próximos módulos (decisões, calendário, ocorrências) adicionam novos WHEN branches AQUI.';
