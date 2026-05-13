-- ============================================================
-- MIGRATION 078: Despesas — Collab adoption + Edit/Cancel/Reopen + Audit trail
--
-- Estende a Foundation: Collaborative Records (migration 00077) pro
-- módulo de Despesas, com 3 frentes:
--
-- 1A. Foundation adoption: priority + auto-mark-creator + WHEN branch
-- 1B. Edit/Cancel/Reopen: status estendido + colunas de tracking
-- 1C. Audit trail: tabela expense_history imutável (segurança e trust)
--
-- Premissas de segurança (CLAUDE.md):
--   - RLS estrita em expense_history (read pra grupo, insert só self,
--     sem update/delete — imutabilidade)
--   - Status transitions enforced via CHECK constraint + service layer
--   - Reabrir aprovada limitado a 24h (server-side, não no client)
--   - Cancelar aprovada exige acordo bilateral (status intermediário)
--
-- Premissas de performance:
--   - Index composto (group_id, status, created_at DESC) pro feed
--   - expense_history indexado por (expense_id, at DESC) pra audit panel
--   - Backfill de history só pro evento "created" (não tentamos
--     reconstruir histórico que não temos)
-- ============================================================

-- ─── 1A. Foundation adoption ─────────────────────────────────

ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS priority public.collab_priority NOT NULL DEFAULT 'info';

CREATE INDEX IF NOT EXISTS idx_expenses_priority
  ON public.expenses (group_id, priority);

-- Estende collab_record_group pra resolver 'expense' → group_id.
-- Cada adoção de módulo só adiciona uma branch aqui (e o WHEN agora
-- cobre school_log + expense; saúde/decisões adicionam as próximas).
CREATE OR REPLACE FUNCTION public.collab_record_group(p_record_type TEXT, p_record_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $f$
DECLARE
  v_group UUID;
BEGIN
  CASE p_record_type
    WHEN 'school_log' THEN
      SELECT group_id INTO v_group FROM public.school_logs WHERE id = p_record_id;
    WHEN 'expense' THEN
      SELECT group_id INTO v_group FROM public.expenses WHERE id = p_record_id;
    ELSE
      RETURN NULL;
  END CASE;
  RETURN v_group;
END;
$f$;

-- Trigger AFTER INSERT: criador automaticamente marcado como leu.
-- Sem isso, o próprio criador veria a despesa como "Nova" no dashboard.
CREATE OR REPLACE FUNCTION public.expenses_auto_mark_creator_read()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $f$
BEGIN
  IF NEW.paid_by IS NOT NULL THEN
    INSERT INTO public.collab_reads (record_type, record_id, user_id, read_at)
    VALUES ('expense', NEW.id, NEW.paid_by, now())
    ON CONFLICT (record_type, record_id, user_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$f$;

DROP TRIGGER IF EXISTS expenses_auto_mark_creator_read ON public.expenses;
CREATE TRIGGER expenses_auto_mark_creator_read
  AFTER INSERT ON public.expenses
  FOR EACH ROW
  EXECUTE FUNCTION public.expenses_auto_mark_creator_read();

-- ─── 1B. Status estendido + colunas de cancel/edit tracking ──

-- `expenses.status` usa o enum `approval_status` (pending/approved/
-- rejected/disputed). Adicionamos 2 novos labels: 'cancelled' (criador
-- cancelou) e 'cancel_pending' (criador pediu cancelar despesa já
-- aprovada, aguardando concordância do reviewer original).
-- ALTER TYPE ... ADD VALUE é idempotente via IF NOT EXISTS (PG 12+).
ALTER TYPE public.approval_status ADD VALUE IF NOT EXISTS 'cancelled';
ALTER TYPE public.approval_status ADD VALUE IF NOT EXISTS 'cancel_pending';

-- Tracking columns. `approved_by` e `approved_at` já existem desde a
-- migration original; só adicionamos os faltantes.
ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS rejected_by UUID REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS rejected_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancel_requested_by UUID REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS cancel_requested_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancel_reason TEXT,
  ADD COLUMN IF NOT EXISTS cancelled_by UUID REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS edited_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS edit_count INT NOT NULL DEFAULT 0;

-- ─── 1C. Audit trail (imutável) ──────────────────────────────

CREATE TABLE IF NOT EXISTS public.expense_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  expense_id UUID NOT NULL REFERENCES public.expenses(id) ON DELETE CASCADE,
  actor_id UUID NOT NULL REFERENCES public.profiles(id),
  action TEXT NOT NULL CHECK (action IN (
    'created',
    'edited',
    'approved',
    'rejected',
    'cancel_requested',
    'cancelled',
    'reopened',
    'restored'
  )),
  -- Snapshots: `before` é o estado anterior (null pra 'created'),
  -- `after` é o estado novo (null pra ações sem mudança de campo,
  -- como 'approved'). Schema flexível pra reuso em outros módulos.
  before JSONB,
  after JSONB,
  -- Motivo da ação. Obrigatório pra: rejected, cancelled, reopened.
  -- Service layer enforça — não temos check constraint pra deixar
  -- flexibilidade pra eventos sem motivo (created, approved, edited).
  reason TEXT,
  at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index do audit panel: ordenado por tempo descendente per expense.
CREATE INDEX IF NOT EXISTS idx_expense_history_expense_at
  ON public.expense_history (expense_id, at DESC);

ALTER TABLE public.expense_history ENABLE ROW LEVEL SECURITY;

-- SELECT: qualquer membro do grupo da despesa pode ler. Transparência
-- entre coparentes é o ponto — quem viu o quê.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'expense_history' AND policyname = 'expense_history group read'
  ) THEN
    CREATE POLICY "expense_history group read"
      ON public.expense_history FOR SELECT
      USING (
        public.is_group_member(
          (SELECT group_id FROM public.expenses WHERE id = expense_id)
        )
      );
  END IF;
END $$;

-- INSERT: somente o próprio user pode escrever (actor_id = auth.uid)
-- E precisa ser membro do grupo da despesa. Sem isso, um user
-- malicioso poderia inserir eventos atribuídos a outro.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'expense_history' AND policyname = 'expense_history self insert'
  ) THEN
    CREATE POLICY "expense_history self insert"
      ON public.expense_history FOR INSERT
      WITH CHECK (
        actor_id = auth.uid()
        AND public.is_group_member(
          (SELECT group_id FROM public.expenses WHERE id = expense_id)
        )
      );
  END IF;
END $$;

-- Sem UPDATE / DELETE policies — history é imutável. Quem precisar
-- editar (admin operacional) usa service role direto.

-- ─── 2. Performance — index composto pro feed ────────────────

-- Query principal: SELECT FROM expenses WHERE group_id = ? ORDER BY
-- created_at DESC. Com filtros de status quando o user troca de aba.
-- Composto (group_id, status, created_at DESC) cobre os 2 padrões.
CREATE INDEX IF NOT EXISTS idx_expenses_group_status_created
  ON public.expenses (group_id, status, created_at DESC);

-- ─── 3. Backfill — collab_reads pros criadores existentes ────

-- Sem isso, todo expense criado antes desta migration apareceria como
-- "Novo" pro próprio criador no dashboard. Idempotente via PK.
INSERT INTO public.collab_reads (record_type, record_id, user_id, read_at)
SELECT 'expense', id, paid_by, COALESCE(created_at, now())
FROM public.expenses
WHERE paid_by IS NOT NULL
ON CONFLICT (record_type, record_id, user_id) DO NOTHING;

-- ─── 4. Backfill — expense_history.created pros existentes ────

-- One-shot retroativo: cada despesa antiga ganha 1 evento "created"
-- pra audit panel não ficar vazio. Idempotente (NOT EXISTS guard).
-- Não tentamos reconstruir approved/rejected históricos — não temos
-- timestamps confiáveis pra todos. A partir desta migration, eventos
-- novos têm histórico completo.
INSERT INTO public.expense_history (expense_id, actor_id, action, after, at)
SELECT
  e.id,
  e.paid_by,
  'created',
  jsonb_build_object(
    'description', e.description,
    'amount', e.amount,
    'category', e.category,
    'expense_date', e.expense_date,
    'child_id', e.child_id
  ),
  COALESCE(e.created_at, now())
FROM public.expenses e
WHERE e.paid_by IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.expense_history h WHERE h.expense_id = e.id
  );
