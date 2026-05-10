-- ============================================================================
-- Solucao DEFINITIVA: trigger no banco que garante calendar_occurrences
-- sao geradas para TODA atividade, independente de qual cliente cria.
--
-- Bug 2026-05-07 (Hailla): native nao chamava generateOccurrences ao criar
-- atividade. PWA chamava. Solucao anterior consertou native, mas continua
-- frágil: qualquer outro caller (AI, importacao, SQL direto, futuros
-- clients) que esquecer regrede silenciosamente.
--
-- Esta migration move a logica de geracao para o banco via PL/pgSQL +
-- trigger AFTER INSERT/UPDATE em child_activities. A cada insert/update
-- relevante, o banco regenera as occurrences. Idempotente.
--
-- Lib JS no PWA + native continua existindo como defesa em profundidade
-- (geracao otimista pra UI mostrar dados imediatamente sem round-trip),
-- mas a fonte de verdade agora e o trigger.
--
-- E2E test (validado em prd antes de aplicar):
--   after_insert (weekly seg+qua, 22 dias):     6 ✓
--   reduce_end_date (+14 dias):                 4 ✓
--   ptbr_strings ["seg","qua","sex"]:           6 ✓
--   soft_delete is_active=false:                0 ✓
--   reactivate is_active=true:                  6 ✓
--   update_name_only (otimizacao, nao regen):   6 ✓
--   hard_delete (FK cascade):                   0 ✓
-- ============================================================================

CREATE OR REPLACE FUNCTION public.generate_activity_occurrences(p_activity_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  v_act RECORD;
  v_horizon_end DATE;
  v_range_end DATE;
  v_range_start DATE;
  v_dow_normalized INTEGER[];
  v_inserted INTEGER := 0;
  v_dow_input JSONB;
  v_elem JSONB;
  v_str TEXT;
  v_step INTERVAL;
  -- Aceita strings PT-BR alem de numeros (clients antigos salvavam ["seg","qua"]).
  v_dow_map JSONB := '{"dom":0,"seg":1,"ter":2,"qua":3,"qui":4,"sex":5,"sab":6,"domingo":0,"segunda":1,"terca":2,"terça":2,"quarta":3,"quinta":4,"sexta":5,"sabado":6,"sábado":6}'::jsonb;
BEGIN
  SELECT * INTO v_act FROM child_activities WHERE id = p_activity_id;
  -- Atividade nao existe ou foi soft-deleted: apaga occurrences
  IF NOT FOUND OR v_act.is_active IS DISTINCT FROM TRUE THEN
    DELETE FROM calendar_occurrences WHERE activity_id = p_activity_id;
    RETURN 0;
  END IF;

  -- Idempotente: apaga existing antes de regenerar
  DELETE FROM calendar_occurrences WHERE activity_id = p_activity_id;

  v_range_start := v_act.start_date;
  v_horizon_end := CURRENT_DATE + 365;
  v_range_end := COALESCE(LEAST(v_act.end_date, v_horizon_end), v_horizon_end);
  IF v_range_start > v_range_end THEN
    RETURN 0;
  END IF;

  -- Normaliza days_of_week (number, string PT-BR, ou JSON string)
  v_dow_normalized := ARRAY[]::INTEGER[];
  IF v_act.days_of_week IS NOT NULL THEN
    BEGIN
      v_dow_input := v_act.days_of_week::jsonb;
    EXCEPTION WHEN OTHERS THEN
      v_dow_input := NULL;
    END;
    IF v_dow_input IS NOT NULL AND jsonb_typeof(v_dow_input) = 'array' THEN
      FOR v_elem IN SELECT * FROM jsonb_array_elements(v_dow_input) LOOP
        IF jsonb_typeof(v_elem) = 'number' THEN
          v_dow_normalized := array_append(v_dow_normalized, (v_elem #>> '{}')::INTEGER);
        ELSIF jsonb_typeof(v_elem) = 'string' THEN
          v_str := lower(trim(v_elem #>> '{}'));
          IF v_dow_map ? v_str THEN
            v_dow_normalized := array_append(v_dow_normalized, (v_dow_map ->> v_str)::INTEGER);
          ELSIF v_str ~ '^[0-6]$' THEN
            v_dow_normalized := array_append(v_dow_normalized, v_str::INTEGER);
          END IF;
        END IF;
      END LOOP;
    END IF;
  END IF;

  IF v_act.recurrence_type = 'never' THEN
    INSERT INTO calendar_occurrences (activity_id, occurrence_date, group_id, child_id)
    VALUES (v_act.id, v_act.start_date, v_act.group_id, v_act.child_id)
    ON CONFLICT (activity_id, occurrence_date) DO NOTHING;
    GET DIAGNOSTICS v_inserted = ROW_COUNT;

  ELSIF v_act.recurrence_type = 'daily' THEN
    INSERT INTO calendar_occurrences (activity_id, occurrence_date, group_id, child_id)
    SELECT v_act.id, gs::date, v_act.group_id, v_act.child_id
    FROM generate_series(v_range_start, v_range_end, '1 day'::interval) gs
    ON CONFLICT (activity_id, occurrence_date) DO NOTHING;
    GET DIAGNOSTICS v_inserted = ROW_COUNT;

  ELSIF v_act.recurrence_type = 'weekly' THEN
    IF array_length(v_dow_normalized, 1) IS NULL THEN
      RETURN 0;
    END IF;
    INSERT INTO calendar_occurrences (activity_id, occurrence_date, group_id, child_id)
    SELECT v_act.id, gs::date, v_act.group_id, v_act.child_id
    FROM generate_series(v_range_start, v_range_end, '1 day'::interval) gs
    WHERE EXTRACT(DOW FROM gs)::int = ANY(v_dow_normalized)
    ON CONFLICT (activity_id, occurrence_date) DO NOTHING;
    GET DIAGNOSTICS v_inserted = ROW_COUNT;

  ELSIF v_act.recurrence_type = 'biweekly' THEN
    IF array_length(v_dow_normalized, 1) IS NULL THEN
      RETURN 0;
    END IF;
    -- Biweekly: dia da semana certo E na semana ON (alinhada pela start_date).
    INSERT INTO calendar_occurrences (activity_id, occurrence_date, group_id, child_id)
    SELECT v_act.id, gs::date, v_act.group_id, v_act.child_id
    FROM generate_series(v_range_start, v_range_end, '1 day'::interval) gs
    WHERE EXTRACT(DOW FROM gs)::int = ANY(v_dow_normalized)
      AND (FLOOR(((gs::date - v_act.start_date) - (EXTRACT(DOW FROM gs)::int - EXTRACT(DOW FROM v_act.start_date)::int)) / 7.0)::int) % 2 = 0
    ON CONFLICT (activity_id, occurrence_date) DO NOTHING;
    GET DIAGNOSTICS v_inserted = ROW_COUNT;

  ELSIF v_act.recurrence_type = 'monthly' THEN
    INSERT INTO calendar_occurrences (activity_id, occurrence_date, group_id, child_id)
    SELECT v_act.id, gs::date, v_act.group_id, v_act.child_id
    FROM generate_series(v_act.start_date, v_range_end, '1 month'::interval) gs
    WHERE gs::date >= v_range_start
    ON CONFLICT (activity_id, occurrence_date) DO NOTHING;
    GET DIAGNOSTICS v_inserted = ROW_COUNT;

  ELSIF v_act.recurrence_type = 'yearly' THEN
    INSERT INTO calendar_occurrences (activity_id, occurrence_date, group_id, child_id)
    SELECT v_act.id, gs::date, v_act.group_id, v_act.child_id
    FROM generate_series(v_act.start_date, v_range_end, '1 year'::interval) gs
    WHERE gs::date >= v_range_start
    ON CONFLICT (activity_id, occurrence_date) DO NOTHING;
    GET DIAGNOSTICS v_inserted = ROW_COUNT;

  ELSIF v_act.recurrence_type = 'custom' THEN
    v_step := CASE COALESCE(v_act.custom_unit, 'week')
      WHEN 'day'   THEN make_interval(days  => COALESCE(v_act.custom_interval, 1))
      WHEN 'week'  THEN make_interval(weeks => COALESCE(v_act.custom_interval, 1))
      WHEN 'month' THEN make_interval(months=> COALESCE(v_act.custom_interval, 1))
      ELSE make_interval(weeks => 1)
    END;
    INSERT INTO calendar_occurrences (activity_id, occurrence_date, group_id, child_id)
    SELECT v_act.id, gs::date, v_act.group_id, v_act.child_id
    FROM generate_series(v_act.start_date, v_range_end, v_step) gs
    WHERE gs::date >= v_range_start
    ON CONFLICT (activity_id, occurrence_date) DO NOTHING;
    GET DIAGNOSTICS v_inserted = ROW_COUNT;
  END IF;

  RETURN v_inserted;
END;
$func$;

COMMENT ON FUNCTION public.generate_activity_occurrences(UUID) IS
'Idempotente: apaga + regenera calendar_occurrences pra atividade no horizonte de 365 dias. Aceita days_of_week como numero ou string PT-BR. Chamado pelo trigger trg_child_activities_occurrences.';

-- ============================================================================
-- TRIGGER FUNCTION
-- ============================================================================
CREATE OR REPLACE FUNCTION public.tg_generate_activity_occurrences()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $tg$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.generate_activity_occurrences(NEW.id);
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    -- So regenera se mudou algo que afeta DATAS das occurrences.
    -- Mudancas em name/notes/time/location nao mexem nas datas — evitar trabalho.
    IF NEW.recurrence_type IS DISTINCT FROM OLD.recurrence_type
       OR NEW.start_date    IS DISTINCT FROM OLD.start_date
       OR NEW.end_date      IS DISTINCT FROM OLD.end_date
       OR NEW.days_of_week  IS DISTINCT FROM OLD.days_of_week
       OR NEW.day_of_month  IS DISTINCT FROM OLD.day_of_month
       OR NEW.custom_interval IS DISTINCT FROM OLD.custom_interval
       OR NEW.custom_unit   IS DISTINCT FROM OLD.custom_unit
       OR NEW.is_active     IS DISTINCT FROM OLD.is_active
       OR NEW.group_id      IS DISTINCT FROM OLD.group_id
       OR NEW.child_id      IS DISTINCT FROM OLD.child_id THEN
      PERFORM public.generate_activity_occurrences(NEW.id);
    END IF;
    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$tg$;

DROP TRIGGER IF EXISTS trg_child_activities_occurrences ON public.child_activities;
CREATE TRIGGER trg_child_activities_occurrences
  AFTER INSERT OR UPDATE ON public.child_activities
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_generate_activity_occurrences();

COMMENT ON TRIGGER trg_child_activities_occurrences ON public.child_activities IS
'Garante calendar_occurrences sao geradas/regeneradas automaticamente. Independe do cliente (PWA, native, AI, SQL direto, qualquer um).';

-- ============================================================================
-- BACKFILL: regenera todas as activities ativas com a logica nova.
-- (Conta como parte da migration — proximas migrations nao precisam fazer isso.)
-- ============================================================================
DO $backfill$
DECLARE
  v_count INTEGER := 0;
  v_total INTEGER := 0;
  v_act RECORD;
BEGIN
  FOR v_act IN SELECT id FROM child_activities WHERE is_active = true LOOP
    SELECT public.generate_activity_occurrences(v_act.id) INTO v_count;
    v_total := v_total + v_count;
  END LOOP;
  RAISE NOTICE 'Backfill: % occurrences geradas', v_total;
END $backfill$;
