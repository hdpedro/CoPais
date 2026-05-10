-- ============================================================================
-- Fecha 2 gaps descobertos pela bateria E2E executada contra a migration 00074:
--
-- GAP 1: monthly com day_of_month=31 gerava datas erradas (clamp progressivo
-- do generate_series + '1 month'). JS faz LEAST(day_of_month, max_day) por mes.
-- Caso edge raro (atividade todo dia 31) mas latente em prd.
--
-- GAP 2: yearly + monthly de longo prazo cabiam pouco no horizonte de 365 dias
-- forward (yearly cabia 1 occorrencia so). Sem regeneracao periodica, atividade
-- iria sumindo do calendario com o tempo.
--
-- FIXES:
-- 1. Reescreve generate_activity_occurrences pra usar iteracao manual mes a
--    mes em recurrence_type='monthly'. Cada mes computa LEAST(day_of_month,
--    max_day_of_that_month). Espelha src/lib/recurrence-utils.ts:setDate.
-- 2. Adiciona regenerate_all_active_occurrences() + agenda pg_cron diario as
--    03:00 UTC (00:00 BRT, horario de menor uso). Idempotente.
--
-- E2E validado em prd:
--   monthly_day_31: gera [31/jan, 28/fev, 31/mar, 30/abr, 31/mai, 30/jun,
--                         31/jul, 31/ago, 30/set, 31/out, 30/nov, 31/dez] ✓
--   monthly_day_15: 4 occurrences (jan/fev/mar/abr 15) ✓
--   cron job ativo: schedule '0 3 * * *' ✓
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
  v_dow_map JSONB := '{"dom":0,"seg":1,"ter":2,"qua":3,"qui":4,"sex":5,"sab":6,"domingo":0,"segunda":1,"terca":2,"terça":2,"quarta":3,"quinta":4,"sexta":5,"sabado":6,"sábado":6}'::jsonb;
  -- Pra monthly: iteracao manual mes a mes
  v_cursor_year INTEGER;
  v_cursor_month INTEGER;
  v_cursor_day INTEGER;
  v_target_day INTEGER;
  v_max_day INTEGER;
  v_candidate_date DATE;
BEGIN
  SELECT * INTO v_act FROM child_activities WHERE id = p_activity_id;
  IF NOT FOUND OR v_act.is_active IS DISTINCT FROM TRUE THEN
    DELETE FROM calendar_occurrences WHERE activity_id = p_activity_id;
    RETURN 0;
  END IF;

  DELETE FROM calendar_occurrences WHERE activity_id = p_activity_id;

  v_range_start := v_act.start_date;
  v_horizon_end := CURRENT_DATE + 365;
  v_range_end := COALESCE(LEAST(v_act.end_date, v_horizon_end), v_horizon_end);
  IF v_range_start > v_range_end THEN
    RETURN 0;
  END IF;

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
    INSERT INTO calendar_occurrences (activity_id, occurrence_date, group_id, child_id)
    SELECT v_act.id, gs::date, v_act.group_id, v_act.child_id
    FROM generate_series(v_range_start, v_range_end, '1 day'::interval) gs
    WHERE EXTRACT(DOW FROM gs)::int = ANY(v_dow_normalized)
      AND (FLOOR(((gs::date - v_act.start_date) - (EXTRACT(DOW FROM gs)::int - EXTRACT(DOW FROM v_act.start_date)::int)) / 7.0)::int) % 2 = 0
    ON CONFLICT (activity_id, occurrence_date) DO NOTHING;
    GET DIAGNOSTICS v_inserted = ROW_COUNT;

  ELSIF v_act.recurrence_type = 'monthly' THEN
    -- Iteracao manual: cada mes calcula LEAST(day_of_month, max_day_of_month).
    -- Sem isso, generate_series + '1 month' faz clamp progressivo (jan31->feb28
    -- ->mar28 ao inves de mar31). Match logico com src/lib/recurrence-utils.ts.
    v_target_day := COALESCE(v_act.day_of_month, EXTRACT(DAY FROM v_act.start_date)::int);
    v_cursor_year := EXTRACT(YEAR FROM v_act.start_date)::int;
    v_cursor_month := EXTRACT(MONTH FROM v_act.start_date)::int;
    LOOP
      v_max_day := EXTRACT(DAY FROM (make_date(v_cursor_year, v_cursor_month, 1) + interval '1 month' - interval '1 day'))::int;
      v_cursor_day := LEAST(v_target_day, v_max_day);
      v_candidate_date := make_date(v_cursor_year, v_cursor_month, v_cursor_day);
      EXIT WHEN v_candidate_date > v_range_end;
      IF v_candidate_date >= v_range_start THEN
        INSERT INTO calendar_occurrences (activity_id, occurrence_date, group_id, child_id)
        VALUES (v_act.id, v_candidate_date, v_act.group_id, v_act.child_id)
        ON CONFLICT (activity_id, occurrence_date) DO NOTHING;
      END IF;
      v_cursor_month := v_cursor_month + 1;
      IF v_cursor_month > 12 THEN
        v_cursor_month := 1;
        v_cursor_year := v_cursor_year + 1;
      END IF;
    END LOOP;
    SELECT count(*) INTO v_inserted FROM calendar_occurrences WHERE activity_id = v_act.id;

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

-- ============================================================================
-- ROLLING HORIZON: regenera occurrences pra TODAS as activities ativas.
-- Resolve gap de yearly (1 occ por ano cabe em horizonte 365d) + monthly long-term.
-- Idempotente. Chamavel manualmente OU via cron (pg_cron).
-- ============================================================================
CREATE OR REPLACE FUNCTION public.regenerate_all_active_occurrences()
RETURNS TABLE(activities_processed INTEGER, occurrences_generated INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  v_act_id UUID;
  v_count INTEGER;
  v_total_acts INTEGER := 0;
  v_total_occ INTEGER := 0;
BEGIN
  FOR v_act_id IN SELECT id FROM child_activities WHERE is_active = true LOOP
    SELECT generate_activity_occurrences(v_act_id) INTO v_count;
    v_total_acts := v_total_acts + 1;
    v_total_occ := v_total_occ + v_count;
  END LOOP;
  RETURN QUERY SELECT v_total_acts, v_total_occ;
END;
$func$;

COMMENT ON FUNCTION public.regenerate_all_active_occurrences() IS
'Regenera occurrences pra todas as activities ativas. Chamado pelo cron diario (pg_cron) pra rolar o horizonte de 365 dias forward.';

-- pg_cron schedule diario as 03:00 UTC (00:00 BRT)
CREATE EXTENSION IF NOT EXISTS pg_cron;

DO $$
BEGIN
  PERFORM cron.unschedule('regenerate_calendar_occurrences_daily');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

SELECT cron.schedule(
  'regenerate_calendar_occurrences_daily',
  '0 3 * * *',
  $cron$ SELECT public.regenerate_all_active_occurrences(); $cron$
);

-- Backfill imediato pra aplicar a logica nova de monthly em prd
SELECT public.regenerate_all_active_occurrences();
