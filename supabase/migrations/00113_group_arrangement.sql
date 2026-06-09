-- ============================================================================
-- Migration 00113: coparenting_groups.arrangement — forma da família.
--
-- É o que torna o painel adaptável a TODA forma de parentalidade:
--   - 'rotating' → pais separados que revezam a guarda noturna → Herói de Guarda
--     ("As crianças estão com X · PRÓXIMA TROCA") como hoje.
--   - 'together' → casal intacto que mora junto → a rotina de leva/busca vira o
--     herói; sem "próxima troca"/"consecutivos".
--   - 'single'   → mãe/pai solo (+ cuidadores) → idem together (rotina é o herói).
--   - 'custom'   → arranjo livre.
--
-- DEFAULT 'rotating' = REGRESSÃO-ZERO: todo grupo existente continua vendo
-- exatamente o painel de hoje. Vira 'together'/'single' só por ESCOLHA EXPLÍCITA
-- no setup da rotina ("Vocês moram juntos? Revezam a guarda?").
--
-- Drives: seleção de herói no dashboard + gating de copy ("troca"/"consecutivos"/
-- "guarda" só aparecem em 'rotating').
-- ============================================================================

ALTER TABLE public.coparenting_groups
  ADD COLUMN IF NOT EXISTS arrangement TEXT NOT NULL DEFAULT 'rotating'
    CHECK (arrangement IN ('rotating', 'together', 'single', 'custom'));

COMMENT ON COLUMN public.coparenting_groups.arrangement IS
  'Forma da família: rotating (revezam guarda — Herói de Guarda) / together (intacto) / single (solo) / custom. Default rotating = regressão-zero. Drives seleção de herói + gating de copy no dashboard.';
