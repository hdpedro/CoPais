-- ============================================================
-- 00049: Fix health_views UNIQUE constraint for NULL record_id
-- NULL != NULL in SQL, so add partial unique index for NULL case
-- ============================================================

CREATE UNIQUE INDEX IF NOT EXISTS idx_health_views_null_record
  ON public.health_views(record_type, viewed_by)
  WHERE record_id IS NULL;
