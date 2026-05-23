-- ============================================================================
-- 00093_normalize_vaccination_catalog.sql
--
-- Resolve `vaccination_records.catalog_id` automaticamente na escrita via
-- trigger BEFORE INSERT/UPDATE. Garante que o Motor de Saúde Preventiva
-- (`compute_vaccine_recommendations`) sempre veja `catalog_id` populado
-- quando o nome bate com o catálogo — independente de quem inseriu
-- (PWA, native form, OCR carteirinha, AI tool, SQL manual, restore).
--
-- Estratégia em 2 passos (alta confiança primeiro):
--   1. Alias exato (unaccent + lower + trim em ambos lados)
--   2. Fallback pg_trgm similarity > 0.55 (alinhado com PWA `recordVaccination`)
--
-- Inclui backfill dos 53 órfãos históricos + re-compute pra refletir.
--
-- Princípio: normalização na escrita > interpretação na leitura.
--   - `compute_vaccine_recommendations` permanece simples e rápida.
--   - Callers (bulk endpoint, AI, manual) deixam de precisar fazer match.
-- ============================================================================

-- Extension `unaccent` pra tolerar acento ("pneumocócica" ↔ "pneumococica").
CREATE EXTENSION IF NOT EXISTS unaccent;

-- ----------------------------------------------------------------------------
-- Helper: normalização canônica (unaccent + lower + trim).
-- IMMUTABLE permite uso em índices funcionais e em pg_trgm sem reavaliação.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.vaccine_name_canonical(p_name TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT unaccent(lower(trim(COALESCE(p_name, ''))));
$$;

-- ----------------------------------------------------------------------------
-- Trigger function: resolve catalog_id quando NULL ao escrever.
-- Idempotente: se já tem catalog_id, mantém; se vaccine_name vazio, no-op.
-- Threshold 0.55 alinha com `src/lib/services/vaccines.ts:recordVaccination`.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.normalize_vaccination_catalog()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_canonical TEXT;
  v_match_id  UUID;
BEGIN
  IF NEW.catalog_id IS NOT NULL THEN
    RETURN NEW;
  END IF;
  IF NEW.vaccine_name IS NULL OR length(trim(NEW.vaccine_name)) = 0 THEN
    RETURN NEW;
  END IF;

  v_canonical := public.vaccine_name_canonical(NEW.vaccine_name);

  -- Pass 1: alias exato (unaccent dos dois lados). Alta confiança.
  SELECT vc.id INTO v_match_id
  FROM public.vaccine_catalog vc
  WHERE vc.country_code = 'BR'
    AND COALESCE(vc.manual_only, false) = false
    AND EXISTS (
      SELECT 1 FROM unnest(vc.aliases) a
      WHERE public.vaccine_name_canonical(a) = v_canonical
    )
  LIMIT 1;

  -- Pass 2: similarity > 0.55 (fallback tolerante a typos brandos).
  IF v_match_id IS NULL THEN
    SELECT vc.id INTO v_match_id
    FROM public.vaccine_catalog vc
    WHERE vc.country_code = 'BR'
      AND COALESCE(vc.manual_only, false) = false
      AND similarity(public.vaccine_name_canonical(vc.name), v_canonical) > 0.55
    ORDER BY similarity(public.vaccine_name_canonical(vc.name), v_canonical) DESC
    LIMIT 1;
  END IF;

  NEW.catalog_id := v_match_id;
  RETURN NEW;
END;
$$;

-- ----------------------------------------------------------------------------
-- Trigger BEFORE INSERT OR UPDATE OF vaccine_name, catalog_id.
-- - INSERT: resolve do zero.
-- - UPDATE de vaccine_name: re-resolve (caso usuário corrija o nome).
-- - UPDATE de catalog_id: respeita override explícito (já validado acima).
-- ----------------------------------------------------------------------------
DROP TRIGGER IF EXISTS tr_normalize_vaccination_catalog ON public.vaccination_records;
CREATE TRIGGER tr_normalize_vaccination_catalog
  BEFORE INSERT OR UPDATE OF vaccine_name, catalog_id
  ON public.vaccination_records
  FOR EACH ROW EXECUTE FUNCTION public.normalize_vaccination_catalog();

-- ----------------------------------------------------------------------------
-- Refatoração de compute_vaccine_recommendations:
--   - Mantém branch de similarity como defesa em profundidade (caso raro
--     de bypass do trigger via DISABLE TRIGGER USER em bulk operations).
--   - Sobe threshold de 0.4 → 0.55 (consistente com normalize_vaccination_catalog
--     e com recordVaccination service no PWA).
--   - Aplica vaccine_name_canonical (unaccent) — mesmo poder de match do trigger.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.compute_vaccine_recommendations(p_child_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_child       RECORD;
  v_pref        TEXT;
  v_age_months  INT;
  v_today       DATE := CURRENT_DATE;
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
  v_catalog_name TEXT;
  v_catalog_name_canon TEXT;
BEGIN
  SELECT id, group_id, birth_date, sex, vaccination_calendar_preference
  INTO v_child
  FROM public.children
  WHERE id = p_child_id;

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

  SELECT COUNT(*) INTO v_record_count
  FROM public.vaccination_records
  WHERE child_id = p_child_id;
  v_is_new_in_app := v_record_count < 3 AND v_age_months > 6;

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
      c.name AS catalog_name,
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
      AND (
        (v_pref = 'both'    AND r.network IN ('both','public','private'))
        OR (v_pref = 'public'  AND r.network IN ('both','public'))
        OR (v_pref = 'private' AND r.network IN ('both','private'))
      )
      AND (c.sex_restriction IS NULL OR c.sex_restriction = v_child.sex)
  LOOP
    v_taken_id := NULL;
    v_catalog_name := v_rule.catalog_name;
    v_catalog_name_canon := public.vaccine_name_canonical(v_catalog_name);

    IF v_rule.is_annual THEN
      SELECT vr.id INTO v_taken_id
      FROM public.vaccination_records vr
      WHERE vr.child_id = p_child_id
        AND vr.administered_date >= v_year_start
        AND (
          vr.catalog_id = v_rule.vaccine_id
          OR (
            vr.catalog_id IS NULL
            AND similarity(public.vaccine_name_canonical(vr.vaccine_name), v_catalog_name_canon) > 0.55
          )
        )
      ORDER BY vr.administered_date DESC
      LIMIT 1;

      v_due_date := v_year_start;
      v_valid_until := NULL;

      IF v_taken_id IS NOT NULL THEN
        v_status := 'taken';
        v_overdue_days := NULL;
      ELSIF v_age_months < v_rule.recommended_age_months THEN
        v_status := 'future';
        v_overdue_days := NULL;
      ELSE
        v_overdue_days := (v_today - v_year_start);
        IF v_is_new_in_app AND v_overdue_days > 180 THEN
          v_status := 'historical_gap';
        ELSE
          v_status := 'overdue';
        END IF;
      END IF;
    ELSE
      IF v_rule.equivalence_group IS NOT NULL THEN
        SELECT id INTO v_taken_id FROM (
          SELECT vr.id,
                 ROW_NUMBER() OVER (ORDER BY vr.administered_date ASC, vr.created_at ASC) AS rn
          FROM public.vaccination_records vr
          JOIN public.vaccine_catalog vc ON vc.id = vr.catalog_id
          WHERE vr.child_id = p_child_id
            AND vc.equivalence_group = v_rule.equivalence_group
        ) eq WHERE eq.rn = v_rule.dose_number;
      ELSE
        SELECT id INTO v_taken_id FROM (
          SELECT vr.id,
                 ROW_NUMBER() OVER (ORDER BY vr.administered_date ASC, vr.created_at ASC) AS rn
          FROM public.vaccination_records vr
          WHERE vr.child_id = p_child_id
            AND (
              vr.catalog_id = v_rule.vaccine_id
              OR (
                vr.catalog_id IS NULL
                AND similarity(public.vaccine_name_canonical(vr.vaccine_name), v_catalog_name_canon) > 0.55
              )
            )
        ) m WHERE m.rn = v_rule.dose_number;
      END IF;

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
  END LOOP;

  RETURN v_inserted;
END;
$function$;

-- ----------------------------------------------------------------------------
-- Backfill: dispara o trigger nos 53 órfãos históricos via UPDATE re-escrita
-- de vaccine_name (mesmo valor, mas dispara BEFORE UPDATE OF vaccine_name).
-- Re-computa pendências pra refletir os novos catalog_ids resolvidos.
-- ----------------------------------------------------------------------------
UPDATE public.vaccination_records
SET vaccine_name = vaccine_name
WHERE catalog_id IS NULL;

DO $$
DECLARE c_id UUID;
BEGIN
  FOR c_id IN SELECT DISTINCT child_id FROM public.vaccination_records LOOP
    PERFORM public.compute_vaccine_recommendations(c_id);
  END LOOP;
END $$;
