-- 00084_users_locale_normalize.sql
--
-- Sequel of 00083: when 00083 ran in production, the `locale` column already
-- existed on `profiles` (with default 'pt-BR' and no check constraint — likely
-- from an earlier internal experiment). `ADD COLUMN IF NOT EXISTS` no-ops on
-- existing columns, which means the CHECK clause was silently skipped and
-- existing rows kept their 'pt-BR' value.
--
-- This migration:
--   1. Normalizes any non-conformant value to its BCP 47 primary subtag
--      (pt-BR → pt, en-US → en, es-MX → es, etc.).
--   2. Switches the column DEFAULT from 'pt-BR' to 'pt'.
--   3. Adds the CHECK constraint that 00083 was supposed to add.
--   4. Documents the column.
--
-- Idempotent — re-running is safe (CHECK is dropped then recreated; UPDATE
-- short-circuits when rows already pass).

BEGIN;

-- 1. Normalize to primary subtag.
UPDATE public.profiles
SET locale = CASE
  WHEN locale ILIKE 'pt%' THEN 'pt'
  WHEN locale ILIKE 'en%' THEN 'en'
  WHEN locale ILIKE 'es%' THEN 'es'
  WHEN locale ILIKE 'fr%' THEN 'fr'
  WHEN locale ILIKE 'de%' THEN 'de'
  ELSE 'pt'
END
WHERE locale NOT IN ('pt', 'en', 'es', 'fr', 'de');

-- 2. Default → 'pt' (matches src/i18n DEFAULT_LOCALE).
ALTER TABLE public.profiles ALTER COLUMN locale SET DEFAULT 'pt';

-- 3. CHECK constraint (drop-then-create for idempotency).
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_locale_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_locale_check
  CHECK (locale IN ('pt', 'en', 'es', 'fr', 'de'));

-- 4. Column documentation.
COMMENT ON COLUMN public.profiles.locale IS
  'User preferred locale. BCP 47 primary subtag (lowercase) — pt/en/es/fr/de. '
  'Server-side jobs (push, email, WhatsApp, cron) read this to localize content. '
  'Mirror of the kindar-locale cookie / AsyncStorage on the client.';

COMMIT;
