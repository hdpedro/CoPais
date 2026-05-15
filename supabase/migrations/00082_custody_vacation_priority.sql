-- ============================================================================
-- MIGRATION 082: Custody — `vacation` vira cidadão de primeira classe
--
-- Bug Amanda (admin) 2026-05-14: tentou criar férias do Bê pelo fluxo
-- "Novo Evento" (eventos sociais). Ficou travada porque o form forçava
-- "Quem leva / responsável" e ela queria deixar vazio (achando que
-- férias não tem responsável fixo).
--
-- Causa estrutural: férias é período de CUSTÓDIA que sobrepõe a escala
-- regular, não evento social. O Kindar já tem `custody_type='vacation'`
-- no enum desde a migration 00001, mas o `custody_resolved` view (00079)
-- nunca dava prioridade pra vacation — tratava igual regular (prio 3).
-- Resultado: ninguém usava porque criava férias e a escala regular
-- continuava aparecendo no calendário "como sempre".
--
-- Esta migration corrige isso:
--   1. `custody_resolved` view passa a aplicar a hierarquia certa
--      (swap > vacation > regular).
--   2. Comentários documentam a semântica de cada tipo.
--
-- Hierarquia de prioridade (menor número = ganha):
--   1 = swap        — acordo pontual entre coparentes, dia-a-dia
--   2 = vacation    — férias prolongadas, sobrepõe regular
--   2 = exception   — ajuste isolado (futuro, ainda não no enum)
--   3 = regular     — escala padrão
--   3 = holiday     — feriado nacional/escolar (não sobrepõe custódia)
--   3 = special     — ad-hoc, sem prioridade definida
--
-- Por que swap > vacation: um swap é pontual e explícito ("vou pegar dia
-- 15 mesmo que seja semana dela"). Se já existe vacation, swap continua
-- valendo pra aquele dia específico. Pra evitar conflito, validação no
-- swap-create flow é trabalho separado (Fase 2 — alert quando swap cai
-- em vacation aprovada).
--
-- Por que vacation > regular: o ponto inteiro do vacation é sobrepor
-- a escala. Senão é só uma nota.
--
-- Tie-break dentro do mesmo prio: created_at DESC (mesma regra do 00079).
-- ============================================================================

CREATE OR REPLACE VIEW public.custody_resolved AS
WITH expanded AS (
  SELECT
    ce.id AS source_id,
    ce.group_id,
    ce.child_id,
    ce.responsible_user_id,
    ce.custody_type,
    ce.notes,
    ce.created_at,
    generate_series(ce.start_date::date, ce.end_date::date, '1 day'::interval)::date AS dia,
    -- Prioridade: swap > (vacation, exception) > regular/holiday/special.
    -- Migration 00082 elevou vacation pra prio 2 (antes era 3).
    CASE ce.custody_type::TEXT
      WHEN 'swap' THEN 1
      WHEN 'exception' THEN 2
      WHEN 'vacation' THEN 2
      ELSE 3  -- regular, holiday, special
    END AS prio
  FROM public.custody_events ce
),
ranked AS (
  SELECT
    *,
    ROW_NUMBER() OVER (
      PARTITION BY group_id, child_id, dia
      ORDER BY prio ASC, created_at DESC  -- prio crescente, dentro do mesmo prio mais recente vence
    ) AS rn
  FROM expanded
)
SELECT
  source_id,
  group_id,
  child_id,
  dia AS date,
  responsible_user_id,
  custody_type,
  notes,
  created_at
FROM ranked
WHERE rn = 1;

COMMENT ON VIEW public.custody_resolved IS
'Resolução canônica de custody por dia. Aplica swap > vacation/exception > regular + created_at DESC como tie-break. Use esta view em vez de custody_events pra "quem é responsável no dia X". Atualizada 2026-05-14 (migration 00082) pra elevar vacation à prio 2.';
