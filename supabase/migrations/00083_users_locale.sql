-- 00083_users_locale.sql
-- Adds a `locale` preference to profiles so server-side jobs (push notifications,
-- email templates, WhatsApp bot, cron triggers) can localize content per user
-- without relying on the request's Accept-Language header.
--
-- Why on `profiles` and not on auth.users:
--   - auth.users is owned by Supabase Auth, must remain unmodified.
--   - profiles is the canonical "app user" row, already exists (00081), has RLS,
--     and is fetched alongside every authenticated request via cached-queries.
--
-- BCP 47 lower-case primary subtag only (pt, en, es, fr, de). Country-specific
-- tags (pt-BR vs pt-PT) deliberately NOT stored — fallback to default region
-- per-locale at format time via Intl. Adding pt-PT would require expanding
-- SUPPORTED_LOCALES on both clients and locale files first.
--
-- Default 'pt' aligns with DEFAULT_LOCALE in src/i18n/index.ts.

BEGIN;

-- Enum guards the value at the row level. Adding a new locale requires:
--   1. Adding to src/i18n + kindar-native/app/_src/i18n SUPPORTED_LOCALES
--   2. Adding the corresponding .json file
--   3. Running this ALTER TYPE in a follow-up migration
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS locale TEXT
  NOT NULL DEFAULT 'pt'
  CHECK (locale IN ('pt', 'en', 'es', 'fr', 'de'));

-- Audit/discoverability — surfaces this column in supabase dashboard table view.
COMMENT ON COLUMN public.profiles.locale IS
  'User preferred locale. BCP 47 primary subtag (lowercase). '
  'Used by server-side jobs (push, email, WhatsApp) to localize content. '
  'Mirror of the kindar-locale cookie/AsyncStorage on the client. '
  'Update via /api/profile/locale (PATCH) which also sets the cookie.';

-- Index because most queries filter by locale when fanning out push to a cohort.
-- Partial index excludes the default 'pt' (90%+ of users in BR launch) to keep
-- the index lean — pt cohort scans are full-table anyway and faster without index.
CREATE INDEX IF NOT EXISTS idx_profiles_locale_non_default
  ON public.profiles(locale)
  WHERE locale <> 'pt';

-- RLS policies already allow each user to update their own profile (existing
-- policy in 00081). No additional policy needed — locale is a regular user-
-- editable column.

COMMIT;
