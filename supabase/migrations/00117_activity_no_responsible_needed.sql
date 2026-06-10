-- Atividades extracurriculares DENTRO da escola não precisam de responsável:
-- ninguém precisa levar/buscar (acontece na escola). Hoje o calendário cai no
-- padrão de custódia e mostra "quem está com a criança" como responsável +
-- um aviso de "atribuir", o que é ruído para essas atividades.
--
-- Flag DELIBERADA por atividade (não heurística). Quando true, o calendário
-- esconde o responsável (sem fallback de custódia) e o aviso de atribuir.
-- Feedback Henrique 2026-06-10.
ALTER TABLE child_activities
  ADD COLUMN IF NOT EXISTS no_responsible_needed boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN child_activities.no_responsible_needed IS
  'true = atividade acontece na escola e nao precisa de responsavel; calendario esconde responsavel/custodia e o aviso de atribuir. Migration 00117 (feedback Henrique 2026-06-10).';
