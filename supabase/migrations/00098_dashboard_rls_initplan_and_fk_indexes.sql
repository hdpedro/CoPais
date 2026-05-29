-- Wrap auth.uid() em (select auth.uid()) nas 25 policies do hot path do dashboard
-- + 6 índices em FKs sem cobertura.
--
-- Causa raiz confirmada via app_errors (severity=info) nos últimos 7 dias:
--   25 TimeoutError em useDashboard:mainQueries (15s ceiling), 4 users iOS distintos.
-- Supabase advisor diagnosticou auth_rls_initplan WARN em 25 policies — auth.uid()
-- reavaliado por LINHA em vez de uma vez por query. Custo virava O(N) por query × 17
-- queries paralelas competindo por pool.
--
-- Fix mecânico recomendado oficialmente pela Supabase:
-- https://supabase.com/docs/guides/database/postgres/row-level-security#call-functions-with-select
-- Zero impacto semântico: (select auth.uid()) força Postgres a tratar como subplan
-- estável (computado 1× por query).

-- ============================================================
-- 1) RLS init-plan: wrap auth.uid() em (select auth.uid())
-- ============================================================

-- active_medications
ALTER POLICY "Group members can create medications" ON public.active_medications
  WITH CHECK (is_group_member(group_id) AND (created_by = (select auth.uid())));

-- child_activities (4 policies — alimentam joins do calendar_occurrences)
ALTER POLICY "Group members can create activities" ON public.child_activities
  WITH CHECK (group_id IN (
    SELECT group_members.group_id FROM group_members
    WHERE group_members.user_id = (select auth.uid())
  ));

ALTER POLICY "Group members can delete activities" ON public.child_activities
  USING (group_id IN (
    SELECT group_members.group_id FROM group_members
    WHERE group_members.user_id = (select auth.uid())
  ));

ALTER POLICY "Group members can update activities" ON public.child_activities
  USING (group_id IN (
    SELECT group_members.group_id FROM group_members
    WHERE group_members.user_id = (select auth.uid())
  ));

ALTER POLICY "Group members can view activities" ON public.child_activities
  USING (group_id IN (
    SELECT group_members.group_id FROM group_members
    WHERE group_members.user_id = (select auth.uid())
  ));

-- child_allergies
ALTER POLICY "Group members can create allergies" ON public.child_allergies
  WITH CHECK (is_group_member(group_id) AND (created_by = (select auth.uid())));

-- collab_reads (2 policies)
ALTER POLICY "collab_reads self read" ON public.collab_reads
  USING ((user_id = (select auth.uid())) AND is_group_member(collab_record_group(record_type, record_id)));

ALTER POLICY "collab_reads self write" ON public.collab_reads
  WITH CHECK ((user_id = (select auth.uid())) AND is_group_member(collab_record_group(record_type, record_id)));

-- decision_votes (2 policies)
ALTER POLICY "Members can cast votes" ON public.decision_votes
  WITH CHECK ((user_id = (select auth.uid())) AND (EXISTS (
    SELECT 1 FROM decisions d
    WHERE ((d.id = decision_votes.decision_id) AND is_group_member(d.group_id))
  )));

ALTER POLICY "Users can update own votes" ON public.decision_votes
  USING (user_id = (select auth.uid()));

-- decisions
ALTER POLICY "Group members can create decisions" ON public.decisions
  WITH CHECK (is_group_member(group_id) AND (created_by = (select auth.uid())));

-- expenses
ALTER POLICY "Group members can create expenses" ON public.expenses
  WITH CHECK (is_group_member(group_id) AND (paid_by = (select auth.uid())));

-- group_members
ALTER POLICY "Admins can insert group members" ON public.group_members
  WITH CHECK (is_group_admin(group_id) OR (user_id = (select auth.uid())));

-- illness_episodes
ALTER POLICY "Group members can create episodes" ON public.illness_episodes
  WITH CHECK (is_group_member(group_id) AND (created_by = (select auth.uid())));

-- medical_appointments
ALTER POLICY "Group members can create appointments" ON public.medical_appointments
  WITH CHECK (is_group_member(group_id) AND (created_by = (select auth.uid())));

-- notifications (2 policies)
ALTER POLICY "Users can update own notifications" ON public.notifications
  USING (user_id = (select auth.uid()));

ALTER POLICY "Users can view own notifications" ON public.notifications
  USING (user_id = (select auth.uid()));

-- profiles (2 policies — todo join paga isso)
ALTER POLICY "Users can update own profile" ON public.profiles
  USING (id = (select auth.uid()));

ALTER POLICY "Users can view profiles of group co-members" ON public.profiles
  USING (
    (id = (select auth.uid())) OR (id IN (
      SELECT gm2.user_id FROM (group_members gm1
        JOIN group_members gm2 ON ((gm1.group_id = gm2.group_id)))
      WHERE (gm1.user_id = (select auth.uid()))
    ))
  );

-- school_logs (2 policies)
ALTER POLICY "Creators can delete school logs" ON public.school_logs
  USING (logged_by = (select auth.uid()));

ALTER POLICY "Group members can create school logs" ON public.school_logs
  WITH CHECK (is_group_member(group_id) AND (logged_by = (select auth.uid())));

-- swap_requests (3 policies)
ALTER POLICY "Group members can create swap requests" ON public.swap_requests
  WITH CHECK (
    is_group_member(group_id)
    AND (requester_id = (select auth.uid()))
    AND (target_user_id IN (
      SELECT group_members.user_id FROM group_members
      WHERE (group_members.group_id = swap_requests.group_id)
    ))
  );

ALTER POLICY "Requester can cancel own pending swap" ON public.swap_requests
  USING ((requester_id = (select auth.uid())) AND (status = 'pending'::swap_status))
  WITH CHECK (requester_id = (select auth.uid()));

ALTER POLICY "Target user can update swap request" ON public.swap_requests
  USING (target_user_id = (select auth.uid()));

-- vaccination_records
ALTER POLICY "Group members can create vaccinations" ON public.vaccination_records
  WITH CHECK (is_group_member(group_id) AND (created_by = (select auth.uid())));

-- ============================================================
-- 2) Hot FK indexes (calendar_occurrences + child_activities + custody_events)
--    Estes 3 são os caminhos mais quentes do useDashboard:mainQueries.
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_calendar_occurrences_child_id
  ON public.calendar_occurrences(child_id);

CREATE INDEX IF NOT EXISTS idx_child_activities_responsible_id
  ON public.child_activities(responsible_id);

CREATE INDEX IF NOT EXISTS idx_child_activities_created_by
  ON public.child_activities(created_by);

CREATE INDEX IF NOT EXISTS idx_custody_events_child_id
  ON public.custody_events(child_id);

CREATE INDEX IF NOT EXISTS idx_custody_events_responsible_user_id
  ON public.custody_events(responsible_user_id);

CREATE INDEX IF NOT EXISTS idx_custody_events_created_by
  ON public.custody_events(created_by);

-- ============================================================
-- 3) ANALYZE — atualiza stats pro planner usar os novos índices
-- ============================================================

ANALYZE public.calendar_occurrences;
ANALYZE public.child_activities;
ANALYZE public.custody_events;
ANALYZE public.profiles;
ANALYZE public.group_members;
ANALYZE public.collab_reads;
