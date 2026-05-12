-- ============================================================================
-- Limpa duplicatas em custody_events + adiciona UNIQUE index pra impedir
-- duplicacao futura.
--
-- Bug reportado por Hailla 2026-05-11: dia 04/05 tinha 6 custody_events
-- IDENTICOS (mesmo start/end/type/owner/child) e dia 05/05 tinha 5. Total
-- 57 grupos com duplicatas, 66 rows extras no banco.
--
-- Causa: fluxo "configurar escala" fazia DELETE + INSERT batch + restore-
-- on-error. Quando INSERT falhava parcialmente (rede, timeout) OU quando
-- user clicava 2x rapido, o restore reinseria existing events sem dedup.
--
-- Fix:
-- 1. Apaga duplicatas mantendo a row mais antiga (created_at ASC).
-- 2. UNIQUE INDEX com NULLS NOT DISTINCT pra impedir INSERT duplicado.
-- 3. Codigo do PWA (actions/calendar.ts, api/calendar/generate-schedule,
--    lib/services/swap.ts) trocou INSERT -> UPSERT(ignoreDuplicates: true).
-- ============================================================================

-- 1. Cleanup das duplicatas existentes
WITH ranked AS (
  SELECT id,
    ROW_NUMBER() OVER (
      PARTITION BY group_id, start_date, end_date, custody_type, responsible_user_id, child_id
      ORDER BY created_at ASC, id ASC
    ) AS rn
  FROM custody_events
)
DELETE FROM custody_events
WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

-- 2. UNIQUE INDEX pra impedir futuras duplicatas. NULLS NOT DISTINCT
-- (Postgres 15+) trata NULLs em child_id (eventos de grupo) como iguais.
DROP INDEX IF EXISTS custody_events_dedup_idx;
CREATE UNIQUE INDEX custody_events_dedup_idx
  ON custody_events (group_id, start_date, end_date, custody_type, responsible_user_id, child_id)
  NULLS NOT DISTINCT;

COMMENT ON INDEX custody_events_dedup_idx IS
'Impede INSERT duplicado de custody_event identico. Fix Hailla 2026-05-11 (57 grupos com duplicatas, 66 rows extras).';
