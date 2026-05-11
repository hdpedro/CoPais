-- ============================================================================
-- Migration 078: Fix consume_nonce — detectar replay corretamente
-- ============================================================================
--
-- Bug na versao original (00077): consume_nonce comparava
--   v_existing.window_start = v_now
-- pra decidir se acabava de inserir. Mas dentro da MESMA transacao now() eh
-- estavel — duas chamadas seguidas teriam o mesmo timestamp, fazendo a
-- segunda chamada (replay) parecer insercao nova → retornava true e
-- permitia o replay.
--
-- Fix: usar RETURNING do INSERT ... ON CONFLICT DO NOTHING. Quando ha
-- conflito (replay), o RETURNING retorna 0 rows. EXISTS captura isso de
-- forma confiavel independente do timing.
--
-- Detectado em smoke test apos aplicar 00077 (consume_nonce retornou true
-- nas duas chamadas no mesmo SELECT). Aplicado direto via MCP em 2026-05-11.
-- ============================================================================

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
  v_key      text := 'jti:' || p_jti;
  v_now      timestamptz := now();
  v_inserted boolean;
BEGIN
  WITH ins AS (
    INSERT INTO public.rate_limit_buckets (key, window_start, count, blocked_until)
    VALUES (v_key, v_now, 1, v_now + (p_ttl_sec || ' seconds')::interval)
    ON CONFLICT (key) DO NOTHING
    RETURNING key
  )
  SELECT EXISTS (SELECT 1 FROM ins) INTO v_inserted;

  RETURN v_inserted;
END;
$func$;

GRANT EXECUTE ON FUNCTION public.consume_nonce(text, int) TO service_role;
