-- ============================================================================
-- Migration 077: Rate limit buckets + nonce JTI tracking
-- ============================================================================
--
-- Contexto: ataque DOS simulado em 2026-05-11 mostrou que tokens autenticados
-- conseguem 36k req/h via /api/documents/[id]/sign + signed URL replay.
-- O rate limiter em memória (src/lib/ai/rate-limit.ts) é insuficiente:
-- fragmenta entre instances Vercel e reseta em deploy.
--
-- Esta migration cria:
--   1. Tabela `rate_limit_buckets` com janela deslizante + backoff exponencial.
--   2. Função `check_and_increment_rate_limit(key, max, window_sec)` PL/pgSQL
--      que faz o check + increment atômico num único round-trip.
--   3. Função `consume_nonce(jti, exp)` para JWT nonce JTI tracking (anti-replay).
--   4. Coluna `metadata jsonb` em usage_events para guardar bytes/file_id/scope.
--   5. Alerta automático em app_errors quando strike_count >= 3.
--
-- Acessada via service role (admin client) — não exige RLS scoped a user.
-- ============================================================================

-- 1. Tabela ---------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.rate_limit_buckets (
  key            text PRIMARY KEY,                -- "user:<uuid>:<scope>" ou "ip:<sha256>:<scope>" ou "jti:<uuid>"
  window_start   timestamptz NOT NULL DEFAULT now(),
  count          int NOT NULL DEFAULT 0,
  blocked_until  timestamptz,                     -- backoff exponencial
  strike_count   int NOT NULL DEFAULT 0,          -- cooldown crescente
  last_strike_at timestamptz,
  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rate_limit_blocked
  ON public.rate_limit_buckets(blocked_until)
  WHERE blocked_until IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_rate_limit_updated
  ON public.rate_limit_buckets(updated_at);

ALTER TABLE public.rate_limit_buckets ENABLE ROW LEVEL SECURITY;
-- Sem policies: acesso apenas via service role (admin client).

-- 2. Função principal de check + increment -------------------------------

CREATE OR REPLACE FUNCTION public.check_and_increment_rate_limit(
  p_key         text,
  p_max         int,
  p_window_sec  int,
  p_user_id     uuid DEFAULT NULL  -- pra logar strike em app_errors
)
RETURNS TABLE (
  allowed        boolean,
  remaining      int,
  retry_after_ms bigint,
  blocked_until  timestamptz,
  strike_count   int
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  v_now             timestamptz := now();
  v_bucket          record;
  v_window_age_ms   bigint;
  v_backoff_sec     int;
  v_blocked_ms      bigint;
BEGIN
  -- Upsert + lock da row (FOR UPDATE garante atomic)
  INSERT INTO public.rate_limit_buckets (key, window_start, count)
  VALUES (p_key, v_now, 0)
  ON CONFLICT (key) DO NOTHING;

  SELECT * INTO v_bucket
  FROM public.rate_limit_buckets
  WHERE key = p_key
  FOR UPDATE;

  -- Ainda em cooldown?
  IF v_bucket.blocked_until IS NOT NULL AND v_bucket.blocked_until > v_now THEN
    v_blocked_ms := EXTRACT(EPOCH FROM (v_bucket.blocked_until - v_now)) * 1000;
    RETURN QUERY SELECT
      false,
      0,
      v_blocked_ms::bigint,
      v_bucket.blocked_until,
      v_bucket.strike_count;
    RETURN;
  END IF;

  -- Janela expirou? Reset contador. Strikes só decaem após 24h sem violação.
  v_window_age_ms := EXTRACT(EPOCH FROM (v_now - v_bucket.window_start)) * 1000;
  IF v_window_age_ms >= (p_window_sec * 1000) THEN
    UPDATE public.rate_limit_buckets
    SET window_start = v_now,
        count        = 1,
        blocked_until = NULL,
        strike_count = CASE
          WHEN v_bucket.last_strike_at IS NULL THEN 0
          WHEN v_now - v_bucket.last_strike_at > INTERVAL '24 hours' THEN 0
          ELSE v_bucket.strike_count
        END,
        updated_at   = v_now
    WHERE key = p_key;

    RETURN QUERY SELECT
      true,
      (p_max - 1),
      0::bigint,
      NULL::timestamptz,
      v_bucket.strike_count;
    RETURN;
  END IF;

  -- Estourou limite na janela? Aplica strike + backoff exponencial.
  IF (v_bucket.count + 1) > p_max THEN
    v_backoff_sec := LEAST(3600, 10 * POWER(2, v_bucket.strike_count + 1)::int);

    UPDATE public.rate_limit_buckets
    SET strike_count   = v_bucket.strike_count + 1,
        last_strike_at = v_now,
        blocked_until  = v_now + (v_backoff_sec || ' seconds')::interval,
        updated_at     = v_now
    WHERE key = p_key;

    -- Log estruturado em app_errors quando strike crítico
    IF (v_bucket.strike_count + 1) >= 3 THEN
      INSERT INTO public.app_errors (
        message,
        folder_category,
        user_id,
        severity,
        metadata
      ) VALUES (
        'rate_limit_exceeded: ' || p_key,
        'lib',
        p_user_id,
        CASE WHEN (v_bucket.strike_count + 1) >= 5 THEN 'critical' ELSE 'warning' END,
        jsonb_build_object(
          'key', p_key,
          'max', p_max,
          'window_sec', p_window_sec,
          'strike_count', v_bucket.strike_count + 1,
          'blocked_for_sec', v_backoff_sec
        )
      );
    END IF;

    RETURN QUERY SELECT
      false,
      0,
      (v_backoff_sec * 1000)::bigint,
      (v_now + (v_backoff_sec || ' seconds')::interval),
      (v_bucket.strike_count + 1);
    RETURN;
  END IF;

  -- Caso normal: incrementa e libera.
  UPDATE public.rate_limit_buckets
  SET count      = v_bucket.count + 1,
      updated_at = v_now
  WHERE key = p_key;

  RETURN QUERY SELECT
    true,
    (p_max - v_bucket.count - 1),
    0::bigint,
    NULL::timestamptz,
    v_bucket.strike_count;
END;
$func$;

GRANT EXECUTE ON FUNCTION public.check_and_increment_rate_limit(text, int, int, uuid)
  TO service_role;

-- 3. Função pra consumir JTI de nonce (anti-replay) ----------------------

CREATE OR REPLACE FUNCTION public.consume_nonce(
  p_jti text,
  p_ttl_sec int DEFAULT 300
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  v_key   text := 'jti:' || p_jti;
  v_now   timestamptz := now();
  v_existing record;
BEGIN
  -- Tenta inserir; conflito = já foi consumido (replay).
  INSERT INTO public.rate_limit_buckets (key, window_start, count, blocked_until)
  VALUES (v_key, v_now, 1, v_now + (p_ttl_sec || ' seconds')::interval)
  ON CONFLICT (key) DO NOTHING;

  SELECT * INTO v_existing
  FROM public.rate_limit_buckets
  WHERE key = v_key;

  -- Se count > 1 ou inserido agora, decide:
  -- - Acabou de inserir agora (count = 1, window_start = v_now): permitido.
  -- - Já existia: replay → nega.
  IF v_existing.window_start = v_now AND v_existing.count = 1 THEN
    RETURN true;
  END IF;

  RETURN false;
END;
$func$;

GRANT EXECUTE ON FUNCTION public.consume_nonce(text, int) TO service_role;

-- 4. usage_events: adicionar metadata jsonb pra logs de download ----------

ALTER TABLE public.usage_events
  ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_usage_events_metadata_gin
  ON public.usage_events USING gin (metadata);

-- 5. Job de limpeza: remove buckets sem atividade há 7 dias --------------
-- (Mantém JTIs em uso e qualquer bucket bloqueado.) Roda pelo cron do app
-- — adicionar entrada em vercel.json depois.

CREATE OR REPLACE FUNCTION public.prune_rate_limit_buckets()
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  v_deleted int;
BEGIN
  DELETE FROM public.rate_limit_buckets
  WHERE updated_at < (now() - INTERVAL '7 days')
    AND (blocked_until IS NULL OR blocked_until < now());

  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$func$;

GRANT EXECUTE ON FUNCTION public.prune_rate_limit_buckets() TO service_role;

-- ============================================================================
-- Notas operacionais:
--   * Funções são SECURITY DEFINER + search_path explícito (auditoria 00076).
--   * Sem RLS em rate_limit_buckets: acesso só via service role.
--   * Backoff: 10s → 20s → 40s → 80s → ... cap em 3600s.
--   * Strikes resetam após 24h sem nova violação.
--   * Strikes >= 3 viram linha em app_errors (Sentry alerta via cron existente).
-- ============================================================================
