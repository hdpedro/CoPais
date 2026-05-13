-- ============================================================================
-- MIGRATION 079: Calendário — integridade de custody_events
--
-- Bug existencial detectado 2026-05-13: 7 de 12 grupos (58%) com overlaps
-- de mesmo tipo em custody_events. Causa raiz: filtro do regenerador
-- (`start_date >= today`) não captura ranges que começam antes de hoje
-- mas se estendem dentro da janela nova. UNIQUE index da migration 00076
-- só bloqueia rows idênticas, não ranges sobrepostos.
--
-- Esta migration introduz 4 camadas de defesa em profundidade:
--   1. View `custody_resolved` — fonte canônica "quem é responsável no
--      dia X" com regra swap > exception > regular aplicada SQL-side
--   2. Trigger BEFORE INSERT/UPDATE — rejeita overlap de mesmo tipo
--      pro mesmo (group, child) — bloqueia o bug antes de gravar
--   3. Cleanup das duplicatas existentes (43 dias afetados em 7 grupos)
--   4. EXCLUDE constraint — defesa final via daterange &&
--
-- A ordem importa: trigger primeiro, cleanup, depois EXCLUDE constraint
-- (constraint rejeitaria os dados sujos).
-- ============================================================================

-- ─── 1. Extensão btree_gist (pra EXCLUDE com = + range) ─────────────

CREATE EXTENSION IF NOT EXISTS btree_gist;

-- ─── 2. View canônica custody_resolved ──────────────────────────────

-- Resolve quem é o responsável real no dia X aplicando a regra:
--   swap > exception > regular
-- E quando há empate de tipo, vence o `created_at` mais recente
-- (regeneração mais recente ganha de regeneração antiga).
--
-- Cada surface (calendar, dashboard, IA, WhatsApp, cron) consome
-- ESTA view, não `custody_events` direto. Garante consistência.
--
-- Performance: a view expande ranges via generate_series. Pra 788
-- custody_events e ranges curtos (max ~30 dias), expansão é leve.
-- Se virar gargalo no futuro, materialização incremental fica trivial.
CREATE OR REPLACE VIEW public.custody_resolved AS
WITH expanded AS (
  SELECT
    ce.id AS source_id,
    ce.group_id,
    ce.child_id,
    ce.responsible_user_id,
    ce.custody_type,
    ce.notes,
    ce.created_at,
    generate_series(ce.start_date::date, ce.end_date::date, '1 day'::interval)::date AS dia,
    -- Prioridade pra tie-break: swap > exception > regular
    CASE ce.custody_type::TEXT
      WHEN 'swap' THEN 1
      WHEN 'exception' THEN 2
      ELSE 3  -- regular e qualquer outro
    END AS prio
  FROM public.custody_events ce
),
ranked AS (
  SELECT
    *,
    ROW_NUMBER() OVER (
      PARTITION BY group_id, child_id, dia
      ORDER BY prio ASC, created_at DESC  -- prio crescente, dentro do mesmo prio mais recente vence
    ) AS rn
  FROM expanded
)
SELECT
  source_id,
  group_id,
  child_id,
  dia AS date,
  responsible_user_id,
  custody_type,
  notes,
  created_at
FROM ranked
WHERE rn = 1;

COMMENT ON VIEW public.custody_resolved IS
'Resolução canônica de custody por dia. Aplica swap > exception > regular + created_at DESC como tie-break. Use esta view em vez de custody_events pra "quem é responsável no dia X".';

-- ─── 3. Função utilitária pra detectar overlap ──────────────────────

-- Retorna true se houver custody_event do MESMO tipo sobrepondo o range
-- (group, child, type, [start, end]). Usada pelo trigger e por tests.
CREATE OR REPLACE FUNCTION public.custody_has_same_type_overlap(
  p_id UUID,  -- NULL pra novo insert; UUID pra update (ignora a própria row)
  p_group_id UUID,
  p_child_id UUID,
  p_custody_type public.custody_type,
  p_start_date DATE,
  p_end_date DATE
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM public.custody_events
    WHERE group_id = p_group_id
      -- NULLS NOT DISTINCT: child_id NULL = NULL match (eventos de grupo)
      AND (child_id IS NOT DISTINCT FROM p_child_id)
      AND custody_type = p_custody_type
      AND (p_id IS NULL OR id <> p_id)
      -- Range overlap: A não-disjunto B  ↔  A.start <= B.end AND A.end >= B.start
      AND start_date <= p_end_date
      AND end_date >= p_start_date
  );
END;
$$;

-- ─── 4. Trigger BEFORE INSERT/UPDATE — rejeita overlap ──────────────

CREATE OR REPLACE FUNCTION public.custody_events_prevent_overlap()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Sanidade: end_date >= start_date
  IF NEW.end_date < NEW.start_date THEN
    RAISE EXCEPTION 'custody_events: end_date (%) menor que start_date (%)', NEW.end_date, NEW.start_date
      USING ERRCODE = '23514';
  END IF;

  -- Detecta overlap do mesmo tipo no mesmo (group, child).
  -- TG_OP = 'UPDATE' → passa NEW.id pra ignorar a própria row.
  IF public.custody_has_same_type_overlap(
    CASE WHEN TG_OP = 'UPDATE' THEN OLD.id ELSE NULL END,
    NEW.group_id, NEW.child_id, NEW.custody_type, NEW.start_date, NEW.end_date
  ) THEN
    RAISE EXCEPTION 'custody_events: overlap de tipo % pro grupo % criança % entre % e %',
      NEW.custody_type, NEW.group_id, NEW.child_id, NEW.start_date, NEW.end_date
      USING ERRCODE = '23505'; -- unique_violation
  END IF;

  RETURN NEW;
END;
$$;

-- NÃO criar o trigger AINDA. Será criado no fim da migration, DEPOIS do
-- cleanup. Caso contrário o cleanup falharia (ele faz INSERTs novos).

-- ─── 5. Cleanup de overlaps existentes ──────────────────────────────

-- Estratégia: pra cada (group_id, child_id, custody_type, dia), manter
-- só a row mais recente (created_at DESC). Deletar as outras.
--
-- Isso preserva a INTENÇÃO mais recente do user — quando ele regerou a
-- escala em 12/05, o regenerado vence o range antigo de 07/05.
--
-- Cuidado: deletamos a CUSTODY EVENT inteira, não dias individuais. Se
-- um range "08-11 Hailla" sobrepõe com "08-09 Hailla" (mais recente),
-- preferimos o mais recente: deletamos o 08-11. Isso descarta dias 10-11
-- do range antigo, mas os novos regenerated rows (10 Gustavo + 11 Hailla)
-- preenchem. Net: dia 10 e 11 mantém responsável certo.

WITH expanded AS (
  SELECT
    ce.id,
    generate_series(ce.start_date::date, ce.end_date::date, '1 day'::interval)::date AS dia,
    ce.group_id,
    ce.child_id,
    ce.custody_type::TEXT AS ct,
    ce.created_at
  FROM public.custody_events ce
),
day_owners AS (
  -- Pra cada (group, child, dia, tipo), qual row é a mais recente?
  SELECT DISTINCT ON (group_id, child_id, ct, dia)
    id AS keeper_id, group_id, child_id, ct, dia
  FROM expanded
  ORDER BY group_id, child_id, ct, dia, created_at DESC, id DESC
),
ids_to_delete AS (
  -- Rows cujo (id, dia) NÃO é o keeper pra esse dia
  SELECT DISTINCT e.id
  FROM expanded e
  WHERE NOT EXISTS (
    SELECT 1 FROM day_owners d
    WHERE d.keeper_id = e.id
      AND d.group_id = e.group_id
      AND d.child_id IS NOT DISTINCT FROM e.child_id
      AND d.ct = e.ct
      AND d.dia = e.dia
  )
  -- Cuidado adicional: só deletar se TODOS os dias da row têm keeper
  -- diferente (senão deletamos uma row "parcialmente conflitante" e
  -- perdemos cobertura nos outros dias). Se o range cobre dias sem
  -- keeper duplicado, preservamos.
  AND NOT EXISTS (
    SELECT 1 FROM expanded e2
    WHERE e2.id = e.id
      AND EXISTS (
        SELECT 1 FROM day_owners d2
        WHERE d2.keeper_id = e2.id
          AND d2.group_id = e2.group_id
          AND d2.child_id IS NOT DISTINCT FROM e2.child_id
          AND d2.ct = e2.ct
          AND d2.dia = e2.dia
      )
  )
)
DELETE FROM public.custody_events
WHERE id IN (SELECT id FROM ids_to_delete);

-- ─── 6. ATIVAR o trigger DEPOIS do cleanup ──────────────────────────

DROP TRIGGER IF EXISTS custody_events_prevent_overlap ON public.custody_events;
CREATE TRIGGER custody_events_prevent_overlap
  BEFORE INSERT OR UPDATE ON public.custody_events
  FOR EACH ROW
  EXECUTE FUNCTION public.custody_events_prevent_overlap();

-- ─── 7. EXCLUDE constraint (defesa em profundidade no nível tabela) ──

-- Mesmo com trigger, EXCLUDE constraint garante a invariante mesmo em
-- bypass de trigger (raro, mas RAISE EXCEPTION pode ser silenciado).
-- A constraint usa daterange + && (overlap operator) — semântica SQL nativa.
--
-- Idempotente: drop antes de re-criar.
ALTER TABLE public.custody_events
  DROP CONSTRAINT IF EXISTS custody_events_no_overlap_same_type;

ALTER TABLE public.custody_events
  ADD CONSTRAINT custody_events_no_overlap_same_type
  EXCLUDE USING gist (
    group_id WITH =,
    child_id WITH =,
    custody_type WITH =,
    daterange(start_date, end_date, '[]') WITH &&
  );

COMMENT ON CONSTRAINT custody_events_no_overlap_same_type ON public.custody_events IS
'Impede overlap de custody_event do MESMO TIPO pro mesmo (group, child). Permite swap+regular coexistirem (tipo diferente) — esses são side-effects esperados de troca aprovada. Fix endemic 2026-05-13.';
