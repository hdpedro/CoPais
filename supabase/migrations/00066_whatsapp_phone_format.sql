-- ================================================================
-- Migration 00066: enforce E.164 format on whatsapp_phone_links
-- ================================================================
--
-- Bug 2026-05-05: usuarios estavam vinculando numero brasileiro sem
-- o codigo do pais (digitavam "(21) 99785-9793" no formulario), o
-- normalizePhone original salvava "+21972859793" no DB e o hash nao
-- batia com o "5521..." que a Meta envia, fazendo o bot tratar o
-- numero como nao-vinculado.
--
-- O fix em codigo (signature.ts:normalizePhone) detecta numeros BR
-- locais (10/11 digitos sem 55) e prepende "+55". Esta migracao
-- adiciona um CHECK constraint como defesa em profundidade — qualquer
-- INSERT/UPDATE com phone_number fora do formato E.164 valido sera
-- rejeitado pelo banco.
--
-- Formato E.164: '+' + entre 8 e 15 digitos. Numero brasileiro valido:
-- '+55' + DDD (2 digitos) + telefone (8 ou 9 digitos) = 12 ou 13 chars.
-- ================================================================

ALTER TABLE public.whatsapp_phone_links
  ADD CONSTRAINT whatsapp_phone_links_e164_check
  CHECK (phone_number ~ '^\+[1-9][0-9]{7,14}$');

COMMENT ON CONSTRAINT whatsapp_phone_links_e164_check
  ON public.whatsapp_phone_links IS
  'E.164 strict: + seguido de digito nao-zero e 7-14 digitos adicionais. Bloqueia formatos como "+21972859793" (sem codigo de pais BR).';
