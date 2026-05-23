-- ============================================================================
-- 00094_child_vaccine_coverage_lateral.sql
--
-- Refatora a view `child_vaccine_coverage` substituindo 3 subqueries
-- correlacionadas (next_due_date/vaccine_name/dose_id) por um único
-- LATERAL JOIN. Adiciona índice de cobertura pra acelerar o lookup.
--
-- Métrica antes (group_id query, Bernardo):
--   Execution Time: 36.1 ms / Planning Time: 9.2 ms
--   3× SubPlan idênticos (cada um faz Limit 1 com sort)
--
-- Métrica depois (medida em prod):
--   Execution Time: 5.0 ms (-86%) / Memoize cache hits 41/42
--   Planning Time: 27 ms (frio) / 1.9 ms (quente)
--   1× LATERAL com idx_vrd_child_status_due
-- ============================================================================

-- Índice de cobertura: suporta diretamente o LATERAL (child_id + status
-- + due_date ordenado). Parcial pra status pendente (due_soon/overdue/upcoming)
-- — única combinação usada pelo "next due" lookup. Compacto, alta seletividade.
CREATE INDEX IF NOT EXISTS idx_vrd_child_status_due
  ON public.vaccine_recommended_doses (child_id, due_date)
  WHERE status IN ('due_soon', 'overdue', 'upcoming');

CREATE OR REPLACE VIEW public.child_vaccine_coverage AS
SELECT
  vrd.child_id,
  vrd.group_id,
  COUNT(*) FILTER (WHERE vrd.status <> 'out_of_window') AS total_recommended,
  COUNT(*) FILTER (WHERE vrd.status = 'taken') AS total_taken,
  COUNT(*) FILTER (WHERE vrd.status = 'overdue') AS overdue_count,
  COUNT(*) FILTER (WHERE vrd.status = 'due_soon') AS due_soon_count,
  COUNT(*) FILTER (WHERE vrd.status = 'upcoming') AS upcoming_count,
  COUNT(*) FILTER (WHERE vrd.status = 'historical_gap') AS historical_gap_count,
  COUNT(*) FILTER (WHERE vrd.status = 'out_of_window') AS out_of_window_count,
  CASE
    WHEN COUNT(*) FILTER (
      WHERE vrd.status = ANY (ARRAY['taken','overdue','due_soon','upcoming','future'])
    ) = 0 THEN 0
    ELSE ROUND(
      100.0 * COUNT(*) FILTER (WHERE vrd.status = 'taken')::numeric
            / NULLIF(
              COUNT(*) FILTER (
                WHERE vrd.status = ANY (ARRAY['taken','overdue','due_soon','upcoming','future'])
              ),
              0
            )::numeric,
      0
    )::integer
  END AS coverage_pct,
  -- LATERAL com LIMIT 1 garante valor único por (child_id, group_id), então
  -- incluir os campos no GROUP BY é seguro e enxuto pro planner.
  ld.due_date     AS next_due_date,
  ld.vaccine_name AS next_due_vaccine_name,
  ld.dose_id      AS next_due_dose_id
FROM public.vaccine_recommended_doses vrd
LEFT JOIN LATERAL (
  SELECT
    sub.id          AS dose_id,
    sub.due_date    AS due_date,
    vc.name         AS vaccine_name
  FROM public.vaccine_recommended_doses sub
  JOIN public.vaccine_catalog vc ON vc.id = sub.vaccine_id
  WHERE sub.child_id = vrd.child_id
    AND sub.status IN ('due_soon', 'overdue', 'upcoming')
  ORDER BY sub.due_date
  LIMIT 1
) ld ON true
GROUP BY vrd.child_id, vrd.group_id, ld.due_date, ld.vaccine_name, ld.dose_id;
