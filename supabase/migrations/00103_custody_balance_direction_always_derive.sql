-- ============================================================================
-- 00103_custody_balance_direction_always_derive.sql
-- ============================================================================
-- Refinamento da 00102: o trigger agora SEMPRE sobrescreve NEW.direction,
-- ignorando o que o cliente passou.
--
-- Por quê: o Native em produção (binário 1.0.x atual) manda valores inventados
-- ('to_target' / 'to_proposer'). Se respeitarmos input não-nulo do cliente,
-- esses payloads continuam batendo no CHECK constraint e quebrando — o que
-- significa que o trigger só protege builds NOVOS, não o que está em prod.
--
-- A 00102 tinha um IF que respeitava direction não-nulo do cliente. Não há
-- caller legítimo que precise forçar valor — `direction` é função de
-- `operation_type` + posição do proposer. Trigger vira a única autoridade.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.derive_custody_balance_direction()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- Sempre sobrescreve. `direction` é derivado puro de `operation_type`.
  -- Cliente pode mandar qualquer coisa (NULL, valor canônico, lixo de bug
  -- antigo) — banco corrige antes da CHECK constraint rodar.
  NEW.direction := CASE NEW.operation_type
    WHEN 'debit'             THEN 'proposer_gains'
    WHEN 'credit'            THEN 'target_gains'
    WHEN 'reset_balance'     THEN 'both_zero'
    ELSE 'neutral'  -- waive, gift_day, forgive_balance, manual_adjustment
  END;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.derive_custody_balance_direction() IS
  'SEMPRE computa direction a partir de operation_type, ignorando input do cliente. '
  'Banco é a única source of truth — protege binários velhos com lógica buggy '
  '(ex: Native 1.0.x mandando ''to_target'' em 2026-05-29).';
