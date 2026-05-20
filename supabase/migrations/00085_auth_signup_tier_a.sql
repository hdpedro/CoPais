-- ============================================================
-- AUTH SIGNUP TIER A — terms_acceptances + auth_login_devices
-- ============================================================
-- Two infrastructure pieces required to safely accept paying users:
--
--   1. `terms_acceptances` — versioned, immutable proof that the user
--      accepted current ToS + Privacy at signup time (and re-accepted
--      after a version bump). LGPD requires us to produce this on demand
--      with timestamp, IP and UA. Append-only: RLS denies UPDATE/DELETE
--      AND triggers raise on attempts (defesa-em-profundidade).
--
--   2. `auth_login_devices` — fingerprint per (user_id, device_hash).
--      First insert per (user_id, device_hash) → triggers "novo
--      dispositivo" alert email. Repeat logins from a known device
--      update `last_seen` + `last_ip` + `last_user_agent` only and do
--      not re-alert.
-- ============================================================

-- ============================================================
-- TERMS ACCEPTANCES — LGPD audit trail
-- ============================================================
CREATE TABLE IF NOT EXISTS public.terms_acceptances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  terms_version TEXT NOT NULL,
  privacy_version TEXT NOT NULL,
  ip_address INET,
  user_agent TEXT,
  accepted_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_terms_acceptances_user
  ON public.terms_acceptances(user_id, accepted_at DESC);

ALTER TABLE public.terms_acceptances ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own acceptances" ON public.terms_acceptances;
CREATE POLICY "Users read own acceptances"
  ON public.terms_acceptances FOR SELECT
  USING (user_id = auth.uid());
-- INSERT/UPDATE/DELETE intencionalmente sem policy → bloqueados a anon/authenticated.
-- Server actions usam createAdminClient (service role) quando inserem.

-- Defense-in-depth: bloqueia UPDATE/DELETE com triggers (mesmo via service role)
CREATE OR REPLACE FUNCTION public.terms_acceptances_immutable() RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'terms_acceptances is append-only (LGPD audit trail)';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_terms_acceptances_immutable_u ON public.terms_acceptances;
CREATE TRIGGER trg_terms_acceptances_immutable_u
  BEFORE UPDATE ON public.terms_acceptances
  FOR EACH ROW EXECUTE FUNCTION public.terms_acceptances_immutable();

DROP TRIGGER IF EXISTS trg_terms_acceptances_immutable_d ON public.terms_acceptances;
CREATE TRIGGER trg_terms_acceptances_immutable_d
  BEFORE DELETE ON public.terms_acceptances
  FOR EACH ROW EXECUTE FUNCTION public.terms_acceptances_immutable();

-- ============================================================
-- AUTH LOGIN DEVICES — "novo dispositivo" alert source-of-truth
-- ============================================================
CREATE TABLE IF NOT EXISTS public.auth_login_devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  device_hash TEXT NOT NULL,
  user_agent TEXT,
  ip_address INET,
  country TEXT,
  city TEXT,
  first_seen TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen TIMESTAMPTZ NOT NULL DEFAULT now(),
  alert_sent_at TIMESTAMPTZ,
  UNIQUE (user_id, device_hash)
);

CREATE INDEX IF NOT EXISTS idx_auth_login_devices_user
  ON public.auth_login_devices(user_id, last_seen DESC);

ALTER TABLE public.auth_login_devices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own devices" ON public.auth_login_devices;
CREATE POLICY "Users read own devices"
  ON public.auth_login_devices FOR SELECT
  USING (user_id = auth.uid());
-- INSERT/UPDATE só via service role (server actions).

-- ============================================================
-- VIEW v_signup_funnel_health — Admin observability
-- ============================================================
-- Counts pra tile do /admin/metrics: signups iniciados 24h/7d,
-- confirmed, stuck (>1h sem confirmar). Mais barato que computar
-- no client a cada render.
DROP VIEW IF EXISTS public.v_signup_funnel_health;
CREATE OR REPLACE VIEW public.v_signup_funnel_health AS
SELECT
  count(*) FILTER (WHERE created_at > now() - interval '24 hours') AS started_24h,
  count(*) FILTER (WHERE created_at > now() - interval '7 days') AS started_7d,
  count(*) FILTER (WHERE email_confirmed_at IS NOT NULL AND created_at > now() - interval '24 hours') AS confirmed_24h,
  count(*) FILTER (WHERE email_confirmed_at IS NOT NULL AND created_at > now() - interval '7 days') AS confirmed_7d,
  count(*) FILTER (
    WHERE email_confirmed_at IS NULL
      AND created_at < now() - interval '1 hour'
      AND created_at > now() - interval '7 days'
      AND is_sso_user = false
      AND deleted_at IS NULL
  ) AS stuck_current,
  count(*) FILTER (
    WHERE email_confirmed_at IS NULL
      AND created_at < now() - interval '1 hour'
      AND created_at > now() - interval '24 hours'
      AND is_sso_user = false
      AND deleted_at IS NULL
  ) AS stuck_24h
FROM auth.users
WHERE created_at > now() - interval '30 days';

GRANT SELECT ON public.v_signup_funnel_health TO authenticated;

-- ============================================================
-- COMMENT TAGS — pra documentação futura
-- ============================================================
COMMENT ON TABLE public.terms_acceptances IS
  'LGPD audit trail. Append-only. Cada signup + cada bump de ToS/Privacy gera uma row.';
COMMENT ON TABLE public.auth_login_devices IS
  'Device fingerprint per (user, device). Primeira ocorrência → alerta de novo dispositivo via email.';
COMMENT ON VIEW public.v_signup_funnel_health IS
  'Observabilidade do funil de signup. Consumida por /admin/metrics.';
