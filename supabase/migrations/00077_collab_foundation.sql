-- ============================================================
-- MIGRATION 077: Collaborative Records Foundation
--
-- Provides shared infrastructure for "collaborative" records — anything
-- where multiple coparents need awareness, read receipts, and priority.
-- First consumer: school_logs (Fase 1). Future consumers (Saúde, Decisões,
-- Financeiro, Calendário, Ocorrências) opt in with ~20 lines: add a
-- priority column + add a WHEN branch to collab_record_group().
--
-- See DEV/.claude/CLAUDE.md "Foundation: Collaborative Records" for the
-- adoption pattern.
-- ============================================================

-- ── 1. Priority enum (shared across collaborative modules) ───────
-- A module opts in by adding `priority collab_priority DEFAULT 'info'`
-- to its main table. Notification fanout reads this column to decide
-- push urgency.
DO $$ BEGIN
  CREATE TYPE public.collab_priority AS ENUM ('info', 'important', 'urgent');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ── 2. collab_reads — one row per (record, user) when user has read ─
-- The same table serves every collaborative module. record_type is the
-- module name (e.g. 'school_log') and record_id points to the row in
-- that module's table. Polymorphic by convention, not by FK — we
-- accept this because the alternative (one reads table per module) is
-- duplication that scales badly.
CREATE TABLE IF NOT EXISTS public.collab_reads (
  record_type TEXT NOT NULL,
  record_id   UUID NOT NULL,
  user_id     UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  read_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (record_type, record_id, user_id)
);

-- Index for "what has THIS user read?" lookups — drives unread counts.
CREATE INDEX IF NOT EXISTS idx_collab_reads_user_type
  ON public.collab_reads (user_id, record_type);

-- ── 3. collab_record_group — resolves record → group_id for RLS ──
-- SECURITY DEFINER so the RLS check on collab_reads can look up the
-- record's group without the caller needing direct SELECT on every
-- collaborative table. Each module adds a WHEN branch on adoption.
CREATE OR REPLACE FUNCTION public.collab_record_group(p_record_type TEXT, p_record_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_group UUID;
BEGIN
  CASE p_record_type
    WHEN 'school_log' THEN
      SELECT group_id INTO v_group FROM public.school_logs WHERE id = p_record_id;
    -- Future modules — add a branch here when adopting:
    --   WHEN 'decision' THEN SELECT group_id INTO v_group FROM public.decisions WHERE id = p_record_id;
    --   WHEN 'health_event' THEN SELECT group_id INTO v_group FROM public.illness_episodes WHERE id = p_record_id;
    --   WHEN 'expense' THEN SELECT group_id INTO v_group FROM public.expenses WHERE id = p_record_id;
    ELSE
      RETURN NULL;
  END CASE;
  RETURN v_group;
END;
$$;

-- ── 4. RLS on collab_reads ───────────────────────────────────────
-- A user can read and write only their own read-receipts AND only
-- for records in groups they belong to. The membership check prevents
-- creating receipts for records in groups the user isn't part of.
ALTER TABLE public.collab_reads ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'collab_reads' AND policyname = 'collab_reads self read') THEN
    CREATE POLICY "collab_reads self read"
      ON public.collab_reads FOR SELECT
      USING (user_id = auth.uid()
             AND public.is_group_member(public.collab_record_group(record_type, record_id)));
  END IF;
END $$;

-- Coparents can see each other's read receipts ("Visto por Amanda · 14:32").
-- Without this policy, only the reader could see their own row — defeating
-- the purpose. Limited to group co-members via the group lookup.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'collab_reads' AND policyname = 'collab_reads coparent read') THEN
    CREATE POLICY "collab_reads coparent read"
      ON public.collab_reads FOR SELECT
      USING (public.is_group_member(public.collab_record_group(record_type, record_id)));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'collab_reads' AND policyname = 'collab_reads self write') THEN
    CREATE POLICY "collab_reads self write"
      ON public.collab_reads FOR INSERT
      WITH CHECK (user_id = auth.uid()
                  AND public.is_group_member(public.collab_record_group(record_type, record_id)));
  END IF;
END $$;

-- Note: no UPDATE/DELETE policies. read_at is set once on creation;
-- the receipt is immutable. If a user "unreads", we'd add a separate
-- column or feature later — for now, simpler is better.

-- ── 5. mark_collab_read RPC ──────────────────────────────────────
-- Idempotent. Returns void. Clients call this when the user opens a
-- record detail (NOT on list scroll/mount — see CLAUDE.md guidance).
CREATE OR REPLACE FUNCTION public.mark_collab_read(
  p_record_type TEXT,
  p_record_id   UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
BEGIN
  INSERT INTO public.collab_reads (record_type, record_id, user_id)
  VALUES (p_record_type, p_record_id, auth.uid())
  ON CONFLICT (record_type, record_id, user_id) DO NOTHING;
END;
$$;

-- ── 6. School-specific: priority column ──────────────────────────
-- Each module adopts the foundation by adding this column with the
-- same default. Future migrations for other modules will repeat this
-- single line per adopting table.
ALTER TABLE public.school_logs
  ADD COLUMN IF NOT EXISTS priority public.collab_priority NOT NULL DEFAULT 'info';

CREATE INDEX IF NOT EXISTS idx_school_logs_priority
  ON public.school_logs (group_id, priority);

-- ── 7. Auto-mark creator as read ─────────────────────────────────
-- The user who creates a record shouldn't see it as "novo" — they
-- already know about their own action. Trigger inserts a collab_reads
-- row for logged_by on each INSERT. Idempotent via PK ON CONFLICT.
CREATE OR REPLACE FUNCTION public.school_logs_auto_mark_creator_read()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.logged_by IS NOT NULL THEN
    INSERT INTO public.collab_reads (record_type, record_id, user_id, read_at)
    VALUES ('school_log', NEW.id, NEW.logged_by, now())
    ON CONFLICT (record_type, record_id, user_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS school_logs_auto_mark_creator_read ON public.school_logs;
CREATE TRIGGER school_logs_auto_mark_creator_read
  AFTER INSERT ON public.school_logs
  FOR EACH ROW
  EXECUTE FUNCTION public.school_logs_auto_mark_creator_read();

-- ── 8. Backfill: existing logs marked as read by their creator ───
-- Without this, every old school_log shows as "novo" to everyone
-- including the creator on first deploy. One-shot idempotent backfill.
INSERT INTO public.collab_reads (record_type, record_id, user_id, read_at)
SELECT 'school_log', id, logged_by, COALESCE(created_at, now())
FROM public.school_logs
WHERE logged_by IS NOT NULL
ON CONFLICT (record_type, record_id, user_id) DO NOTHING;
