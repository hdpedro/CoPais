-- Faltava a policy de DELETE na tabela `expenses` (só tinha INSERT/SELECT/UPDATE).
-- Com RLS ligado, todo DELETE era NEGADO silenciosamente (0 linhas) -> "Remover
-- despesa" nunca funcionou pra ninguém (deleteExpense usa safeWrite = DELETE
-- direto sob RLS, não /api/expenses). Reportado 2026-06-04 (usuário sem
-- co-responsável não conseguia apagar despesa pendente; o "co-responsável" era
-- incidental — o bug é a policy ausente).
--
-- Escopo espelha a UI (kindar-native/app/despesas/index.tsx:
-- canDelete = isOwn && status in ('pending','rejected')): o criador pode apagar
-- a PRÓPRIA despesa enquanto pending ou rejected. Aprovadas/canceladas NÃO são
-- apagáveis (têm balanço / usam o fluxo de cancelamento). `expense_history` tem
-- FK ON DELETE CASCADE, então o histórico de edições some junto. auth.uid()
-- envelopado em (select ...) por performance de RLS (init-plan, vide migrations
-- 00098-00100).
--
-- Server-side: vale pros 3 (Native iOS/Android + PWA) na hora, sem build.

CREATE POLICY "Creators can delete own pending or rejected expenses"
ON public.expenses
FOR DELETE
USING (
  paid_by = (select auth.uid())
  AND status IN ('pending', 'rejected')
);
