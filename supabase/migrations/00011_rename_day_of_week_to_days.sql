-- =============================================
-- Migration 011: Rename day_of_week -> days_of_week
-- Suporta multiplos dias da semana (ex: Seg, Ter, Sex)
-- Muda de INTEGER (dia unico) para TEXT (JSON array)
-- =============================================

-- Check if old column exists and rename/convert
DO $$
BEGIN
  -- If old column exists, migrate it
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'child_activities' AND column_name = 'day_of_week'
  ) THEN
    -- Add new column if it doesn't exist
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'child_activities' AND column_name = 'days_of_week'
    ) THEN
      ALTER TABLE public.child_activities ADD COLUMN days_of_week TEXT;
    END IF;

    -- Migrate data: convert integer to JSON array
    UPDATE public.child_activities
    SET days_of_week = '[' || day_of_week::text || ']'
    WHERE day_of_week IS NOT NULL AND (days_of_week IS NULL OR days_of_week = '');

    -- Drop old column
    ALTER TABLE public.child_activities DROP COLUMN day_of_week;
  ELSE
    -- If neither exists (fresh install), add the new column
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'child_activities' AND column_name = 'days_of_week'
    ) THEN
      ALTER TABLE public.child_activities ADD COLUMN days_of_week TEXT;
    END IF;
  END IF;
END $$;
