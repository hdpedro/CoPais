-- ================================================================
-- Migration 00135: whatsapp_phone_links — UNIQUE parcial WHERE is_active
-- ================================================================
--
-- Bug 2026-07-01 (Família Coelho, tester — "Erro na vinculação do
-- WhatsApp"): a migration 00043 criou UNIQUE(phone_number) GLOBAL. O
-- `unlink` faz soft-delete (is_active=false) mas MANTÉM a linha com o
-- phone_number. Ao tentar RE-vincular o mesmo número (ou vinculá-lo em
-- outra conta), o INSERT colidia no UNIQUE(phone_number) — e o erro
-- nunca era checado, então o app dizia "Código enviado!" sem gravar a
-- pendência, e o verify respondia "Nenhuma vinculação pendente
-- encontrada". A conta ficava travada pra sempre.
--
-- O fix principal é no código (services/whatsapp-link.ts reusa a linha
-- dona do número em vez de inserir cega + checa todo write). Esta
-- migração é defesa em profundidade: troca o UNIQUE global por um índice
-- único PARCIAL sobre (phone_number) WHERE is_active, de modo que linhas
-- soft-deleted (is_active=false) NÃO bloqueiem mais uma nova vinculação
-- ativa do mesmo número. Continua garantindo no máximo UMA vinculação
-- ATIVA por número.
--
-- Seguro: o UNIQUE global antigo garantia <= 1 linha por phone_number no
-- total, logo <= 1 linha ativa por número — a criação do índice parcial
-- não pode falhar por duplicidade nos dados existentes.
-- ================================================================

-- 1. Derruba o UNIQUE(phone_number) global, seja qual for o nome gerado.
--    (Nome verificado em prod em 2026-07-01: whatsapp_phone_links_phone_number_key.)
--    Postcondição com RAISE EXCEPTION: se por qualquer motivo um UNIQUE global
--    sobre (phone_number) sobreviver, a migração ABORTA em vez de meio-aplicar
--    (o CREATE INDEX do passo 2 junto com o UNIQUE global velho seria
--    inconsistente silencioso). Idempotente: re-run sem constraint = ok.
DO $$
DECLARE
  cname text;
  remaining int;
BEGIN
  FOR cname IN
    SELECT con.conname
    FROM pg_constraint con
    WHERE con.conrelid = 'public.whatsapp_phone_links'::regclass
      AND con.contype = 'u'
      AND pg_get_constraintdef(con.oid) = 'UNIQUE (phone_number)'
  LOOP
    EXECUTE format('ALTER TABLE public.whatsapp_phone_links DROP CONSTRAINT %I', cname);
  END LOOP;

  SELECT count(*) INTO remaining
  FROM pg_constraint con
  WHERE con.conrelid = 'public.whatsapp_phone_links'::regclass
    AND con.contype = 'u'
    AND pg_get_constraintdef(con.oid) = 'UNIQUE (phone_number)';

  IF remaining > 0 THEN
    RAISE EXCEPTION 'migration 00135: UNIQUE global em whatsapp_phone_links(phone_number) ainda existe apos o drop — abortando para nao meio-aplicar';
  END IF;
END $$;

-- 2. UNIQUE parcial: no máximo uma vinculação ATIVA por número.
CREATE UNIQUE INDEX IF NOT EXISTS whatsapp_phone_links_active_phone_uk
  ON public.whatsapp_phone_links (phone_number)
  WHERE is_active;

COMMENT ON INDEX public.whatsapp_phone_links_active_phone_uk IS
  'UNIQUE parcial: no máximo uma vinculação ativa (is_active=true) por phone_number. Linhas soft-deleted (is_active=false) não bloqueiam re-vinculação. Substitui o UNIQUE(phone_number) global da 00043 (bug de vinculação travada 2026-07-01).';
