-- LGPD self-service deletion — Fase A (request/cancel flow).
-- User pede exclusão -> 30 dias de graça -> cron purga (Fase B, futuro).
-- Cancelável durante a janela. Audit trail completo.

-- 1) Flag de pendência no profile
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS deletion_requested_at timestamptz,
  ADD COLUMN IF NOT EXISTS deletion_scheduled_for timestamptz;

COMMENT ON COLUMN public.profiles.deletion_requested_at IS
  'NULL = ativo. NOT NULL = user solicitou exclusão LGPD. Auth middleware bloqueia ações destrutivas e oferece cancelar.';
COMMENT ON COLUMN public.profiles.deletion_scheduled_for IS
  'Quando o cron de purga deve executar. requested_at + 30 dias. Cron compara com now() e dispara purge_user.';

CREATE INDEX IF NOT EXISTS profiles_deletion_pending_idx
  ON public.profiles (deletion_scheduled_for)
  WHERE deletion_requested_at IS NOT NULL;

-- 2) Audit table — append-only, retenção indefinida pra compliance
CREATE TABLE IF NOT EXISTS public.account_deletion_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  user_email text NOT NULL,
  action text NOT NULL CHECK (action IN ('requested','cancelled','purged','purge_failed')),
  requested_at timestamptz,
  scheduled_for timestamptz,
  executed_at timestamptz,
  reason text,
  ip_address inet,
  user_agent text,
  snapshot jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.account_deletion_audit IS
  'LGPD audit trail. Append-only. Retém user_id mesmo após purga (FK não existe; user_id é só ID histórico).';

CREATE INDEX IF NOT EXISTS account_deletion_audit_user_idx
  ON public.account_deletion_audit (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS account_deletion_audit_action_idx
  ON public.account_deletion_audit (action, created_at DESC);

-- Append-only: bloquear UPDATE e DELETE
ALTER TABLE public.account_deletion_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY account_deletion_audit_select_own
  ON public.account_deletion_audit
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Service role insere via função SECURITY DEFINER abaixo. Nada de INSERT direto pelo client.
-- UPDATE/DELETE: sem policy = bloqueado por default.

-- 3) Função: solicitar exclusão
CREATE OR REPLACE FUNCTION public.request_account_deletion(
  p_reason text DEFAULT NULL,
  p_ip inet DEFAULT NULL,
  p_user_agent text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_email text;
  v_already_pending timestamptz;
  v_scheduled_for timestamptz;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'auth required' USING ERRCODE = '42501';
  END IF;

  SELECT email, deletion_requested_at INTO v_email, v_already_pending
    FROM public.profiles WHERE id = v_user_id;

  IF v_email IS NULL THEN
    RAISE EXCEPTION 'profile not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_already_pending IS NOT NULL THEN
    -- idempotente: já solicitou, retorna estado atual
    SELECT deletion_scheduled_for INTO v_scheduled_for FROM public.profiles WHERE id = v_user_id;
    RETURN jsonb_build_object(
      'status','already_pending',
      'requested_at', v_already_pending,
      'scheduled_for', v_scheduled_for
    );
  END IF;

  v_scheduled_for := now() + interval '30 days';

  UPDATE public.profiles
    SET deletion_requested_at = now(),
        deletion_scheduled_for = v_scheduled_for,
        updated_at = now()
    WHERE id = v_user_id;

  INSERT INTO public.account_deletion_audit
    (user_id, user_email, action, requested_at, scheduled_for, reason, ip_address, user_agent)
  VALUES
    (v_user_id, v_email, 'requested', now(), v_scheduled_for, p_reason, p_ip, p_user_agent);

  RETURN jsonb_build_object(
    'status','requested',
    'requested_at', now(),
    'scheduled_for', v_scheduled_for
  );
END;
$$;

REVOKE ALL ON FUNCTION public.request_account_deletion(text, inet, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.request_account_deletion(text, inet, text) TO authenticated;

-- 4) Função: cancelar exclusão (dentro da janela)
CREATE OR REPLACE FUNCTION public.cancel_account_deletion(
  p_ip inet DEFAULT NULL,
  p_user_agent text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_email text;
  v_pending_at timestamptz;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'auth required' USING ERRCODE = '42501';
  END IF;

  SELECT email, deletion_requested_at INTO v_email, v_pending_at
    FROM public.profiles WHERE id = v_user_id;

  IF v_pending_at IS NULL THEN
    RETURN jsonb_build_object('status','not_pending');
  END IF;

  UPDATE public.profiles
    SET deletion_requested_at = NULL,
        deletion_scheduled_for = NULL,
        updated_at = now()
    WHERE id = v_user_id;

  INSERT INTO public.account_deletion_audit
    (user_id, user_email, action, requested_at, ip_address, user_agent)
  VALUES
    (v_user_id, v_email, 'cancelled', v_pending_at, p_ip, p_user_agent);

  RETURN jsonb_build_object('status','cancelled');
END;
$$;

REVOKE ALL ON FUNCTION public.cancel_account_deletion(inet, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cancel_account_deletion(inet, text) TO authenticated;
