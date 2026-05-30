-- ============================================================================
-- 00102_custody_balance_direction_derived.sql
-- ============================================================================
-- Banco como source of truth pro custody_balance_operations.direction.
--
-- Histórico: a coluna direction tem CHECK constraint
--   ('proposer_gains' | 'target_gains' | 'neutral' | 'both_zero')
-- mas cada caller (PWA action, Native service) precisava computar o valor
-- corretamente antes do INSERT. O Native escapou da paridade — função
-- directionForType retornava 'to_proposer' / 'to_target' (valores inventados,
-- nunca aceitos pelo CHECK). User Angelino disparou o bug em 2026-05-29.
--
-- Solução estrutural (padrão das migrations 00074 calendar_occurrences e
-- 00093+00094 vaccine catalog_id): TRIGGER BEFORE INSERT computa direction
-- a partir de operation_type. Cliente para de enviar direction; banco preenche.
-- Tornar a coluna nullable (DROP NOT NULL) viabiliza o INSERT sem o campo.
-- O CHECK continua valendo como linha de defesa: se algum caller forçar um
-- valor não-canônico, ainda quebra (defesa em profundidade).
--
-- Não há backfill: as 3 rows históricas já têm direction válido.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.derive_custody_balance_direction()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- Cliente pode forçar valor explícito (ex: testes, ajustes administrativos).
  -- Se passou direction != NULL, respeitamos — o CHECK constraint valida.
  IF NEW.direction IS NOT NULL THEN
    RETURN NEW;
  END IF;

  NEW.direction := CASE NEW.operation_type
    WHEN 'debit'             THEN 'proposer_gains'  -- proposer pega o dia agora, deve depois
    WHEN 'credit'            THEN 'target_gains'    -- proposer dá o dia agora, recebe depois
    WHEN 'reset_balance'     THEN 'both_zero'       -- zera saldos de ambos
    ELSE 'neutral'                                   -- waive, gift_day, forgive_balance, manual_adjustment
  END;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.derive_custody_balance_direction() IS
  'Computa direction a partir de operation_type antes do INSERT. '
  'Mantém banco como source of truth — clientes (PWA action, Native, AI) '
  'não precisam saber o mapeamento. CHECK constraint continua como rede '
  'de segurança contra valores explícitos inválidos.';

DROP TRIGGER IF EXISTS trg_custody_balance_direction ON public.custody_balance_operations;

CREATE TRIGGER trg_custody_balance_direction
  BEFORE INSERT ON public.custody_balance_operations
  FOR EACH ROW
  EXECUTE FUNCTION public.derive_custody_balance_direction();

-- Coluna pode ficar NULL no payload do cliente — trigger preenche antes do CHECK rodar.
ALTER TABLE public.custody_balance_operations
  ALTER COLUMN direction DROP NOT NULL;
