-- ============================================================
-- Migration 063: Cleanup de tokens push mal-classificados
-- ============================================================
--
-- Contexto: o endpoint `/api/push/register-apns` antes ignorava o campo
-- `platform` enviado pelo cliente. Tokens FCM (Android) eram gravados
-- como `apns_token` em notifications.{title='apns_token', message=token}.
-- Resultado: `sendApnsPush` tentava enviar via APNs HTTP/2 com um token
-- FCM, falhando 4xx silencioso e (após patch atual) DELETANDO o token
-- como se fosse inválido.
--
-- Esta migration limpa o estado misclassificado em produção. Token FCM
-- tem padrão diferente do APNs:
--   - APNs token: 64 hex chars (ex: "abcd1234..." 64 caracteres hex)
--   - FCM token: 152-200+ chars com `:` em posição variável
--                (ex: "fXXXXX-XXXXX:APA91bF...")
--
-- Heurística de detecção:
--   - Contém `:` → claramente FCM
--   - Length > 100 → muito provavelmente FCM
--   - Length == 64 e só hex → APNs autêntico
--
-- Aplicar é seguro: se o usuário ainda usa o app, o cliente vai re-
-- registrar o token correto na próxima sessão (push-setup.ts roda em
-- _layout.tsx após login).
-- ============================================================

-- Reclassificar: tokens armazenados como 'apns_token' que parecem FCM
-- viram 'fcm_token'. (Estamos no DB do produto; UPDATE direto.)
UPDATE public.notifications
SET title = 'fcm_token'
WHERE type = 'system'
  AND title = 'apns_token'
  AND (
    message LIKE '%:%'
    OR length(message) > 100
  );

-- Higiene: remover linhas com message vazio ou claramente inválido
DELETE FROM public.notifications
WHERE type = 'system'
  AND title IN ('apns_token', 'fcm_token')
  AND (message IS NULL OR length(message) < 20);

-- Higiene: dedupe por (user_id, title, message) caso o mesmo token
-- tenha sido inserido várias vezes. Mantém a linha mais antiga.
WITH ranked AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY user_id, title, message
      ORDER BY created_at ASC
    ) AS rn
  FROM public.notifications
  WHERE type = 'system'
    AND title IN ('apns_token', 'fcm_token')
)
DELETE FROM public.notifications
WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

-- Stats reporter (no-op idempotente, mas log útil em CI)
DO $$
DECLARE
  apns_count integer;
  fcm_count integer;
BEGIN
  SELECT COUNT(*) INTO apns_count FROM public.notifications
    WHERE type = 'system' AND title = 'apns_token';
  SELECT COUNT(*) INTO fcm_count FROM public.notifications
    WHERE type = 'system' AND title = 'fcm_token';
  RAISE NOTICE 'Push tokens after cleanup: apns=% fcm=%', apns_count, fcm_count;
END $$;
