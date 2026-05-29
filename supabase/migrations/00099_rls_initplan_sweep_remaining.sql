-- Sweep migration: wrap auth.uid() em (select auth.uid()) nas 77 policies restantes
-- (fora do hot path do dashboard que já foi tratado em 00098).
-- Mesma técnica recomendada pela Supabase:
-- https://supabase.com/docs/guides/database/postgres/row-level-security#call-functions-with-select
--
-- Zero impacto semântico. Tabelas afetadas: account_deletion_audit, activity_*,
-- agreements, ai_*, auth_login_devices, calendar_tokens, chat_*, checklist_*,
-- child_sizes, clinical_context_inferences, coparenting_groups, custody_*,
-- daily_checkins, decision_arguments, documents, event_*, events, expense_history,
-- growth_records, health_*, invitations, medical_professionals, medication_doses,
-- onboarding_quests, private_notes, referral_*, sensitive_notes, subscriptions,
-- terms_acceptances, usage_events, vaccine_notification_dismissals, whatsapp_*.

-- account_deletion_audit
ALTER POLICY "account_deletion_audit_select_own" ON public.account_deletion_audit
  USING (user_id = (select auth.uid()));

-- activity_checklist_items
ALTER POLICY "Group members can delete checklist items" ON public.activity_checklist_items
  USING (activity_id IN (
    SELECT child_activities.id FROM child_activities
    WHERE child_activities.group_id IN (
      SELECT group_members.group_id FROM group_members
      WHERE group_members.user_id = (select auth.uid())
    )
  ));
ALTER POLICY "Group members can manage checklist items" ON public.activity_checklist_items
  WITH CHECK (activity_id IN (
    SELECT child_activities.id FROM child_activities
    WHERE child_activities.group_id IN (
      SELECT group_members.group_id FROM group_members
      WHERE group_members.user_id = (select auth.uid())
    )
  ));
ALTER POLICY "Group members can view checklist items" ON public.activity_checklist_items
  USING (activity_id IN (
    SELECT child_activities.id FROM child_activities
    WHERE child_activities.group_id IN (
      SELECT group_members.group_id FROM group_members
      WHERE group_members.user_id = (select auth.uid())
    )
  ));

-- activity_reminder_sends
ALTER POLICY "Group members can view reminder sends" ON public.activity_reminder_sends
  USING (activity_id IN (
    SELECT child_activities.id FROM child_activities
    WHERE child_activities.group_id IN (
      SELECT group_members.group_id FROM group_members
      WHERE group_members.user_id = (select auth.uid())
    )
  ));

-- agreements
ALTER POLICY "Group members can create agreements" ON public.agreements
  WITH CHECK (is_group_member(group_id) AND (created_by = (select auth.uid())));
ALTER POLICY "Group members can delete own agreements" ON public.agreements
  USING (created_by = (select auth.uid()));

-- ai_event_logs
ALTER POLICY "Users can insert own logs" ON public.ai_event_logs
  WITH CHECK ((select auth.uid()) = user_id);
ALTER POLICY "Users can view own logs" ON public.ai_event_logs
  USING ((select auth.uid()) = user_id);

-- ai_requests
ALTER POLICY "Users can view own AI requests" ON public.ai_requests
  USING ((select auth.uid()) = user_id);

-- auth_login_devices
ALTER POLICY "Users read own devices" ON public.auth_login_devices
  USING (user_id = (select auth.uid()));

-- calendar_tokens
ALTER POLICY "Users can create own calendar tokens" ON public.calendar_tokens
  WITH CHECK (user_id = (select auth.uid()));
ALTER POLICY "Users can delete own calendar tokens" ON public.calendar_tokens
  USING (user_id = (select auth.uid()));
ALTER POLICY "Users can view own calendar tokens" ON public.calendar_tokens
  USING (user_id = (select auth.uid()));

-- chat_channel_reads
ALTER POLICY "Users insert own channel reads" ON public.chat_channel_reads
  WITH CHECK (user_id = (select auth.uid()));
ALTER POLICY "Users manage own channel reads" ON public.chat_channel_reads
  USING (user_id = (select auth.uid()));
ALTER POLICY "Users update own channel reads" ON public.chat_channel_reads
  USING (user_id = (select auth.uid()));

-- chat_messages
ALTER POLICY "Group members can send messages" ON public.chat_messages
  WITH CHECK (is_group_member(group_id) AND (sender_id = (select auth.uid())));

-- checklist_completions
ALTER POLICY "Group members can create completions" ON public.checklist_completions
  WITH CHECK (activity_id IN (
    SELECT child_activities.id FROM child_activities
    WHERE child_activities.group_id IN (
      SELECT group_members.group_id FROM group_members
      WHERE group_members.user_id = (select auth.uid())
    )
  ));
ALTER POLICY "Group members can delete completions" ON public.checklist_completions
  USING (activity_id IN (
    SELECT child_activities.id FROM child_activities
    WHERE child_activities.group_id IN (
      SELECT group_members.group_id FROM group_members
      WHERE group_members.user_id = (select auth.uid())
    )
  ));
ALTER POLICY "Group members can view completions" ON public.checklist_completions
  USING (activity_id IN (
    SELECT child_activities.id FROM child_activities
    WHERE child_activities.group_id IN (
      SELECT group_members.group_id FROM group_members
      WHERE group_members.user_id = (select auth.uid())
    )
  ));

-- child_sizes
ALTER POLICY "child_sizes insert" ON public.child_sizes
  WITH CHECK (is_group_member(group_id) AND (created_by = (select auth.uid())));

-- clinical_context_inferences
ALTER POLICY "clinical_inferences_insert" ON public.clinical_context_inferences
  WITH CHECK (is_group_member(group_id) AND (created_by = (select auth.uid())));
ALTER POLICY "clinical_inferences_update" ON public.clinical_context_inferences
  USING (created_by = (select auth.uid()));

-- coparenting_groups
ALTER POLICY "Authenticated users can create groups" ON public.coparenting_groups
  WITH CHECK ((select auth.uid()) = created_by);

-- custody_balance_operations
ALTER POLICY "Group members can create balance operations" ON public.custody_balance_operations
  WITH CHECK (is_group_member(group_id) AND (proposed_by = (select auth.uid())));
ALTER POLICY "Target or proposer can update balance operations" ON public.custody_balance_operations
  USING ((target_user_id = (select auth.uid())) OR (proposed_by = (select auth.uid())));

-- custody_schedules
ALTER POLICY "Group members can insert custody schedules" ON public.custody_schedules
  WITH CHECK (EXISTS (
    SELECT 1 FROM group_members
    WHERE ((group_members.group_id = custody_schedules.group_id)
      AND (group_members.user_id = (select auth.uid())))
  ));
ALTER POLICY "Group members can update custody schedules" ON public.custody_schedules
  USING (EXISTS (
    SELECT 1 FROM group_members
    WHERE ((group_members.group_id = custody_schedules.group_id)
      AND (group_members.user_id = (select auth.uid())))
  ));
ALTER POLICY "Group members can view custody schedules" ON public.custody_schedules
  USING (EXISTS (
    SELECT 1 FROM group_members
    WHERE ((group_members.group_id = custody_schedules.group_id)
      AND (group_members.user_id = (select auth.uid())))
  ));

-- daily_checkins
ALTER POLICY "Users can update own checkins" ON public.daily_checkins
  USING (logged_by = (select auth.uid()));

-- decision_arguments
ALTER POLICY "Members can add arguments" ON public.decision_arguments
  WITH CHECK ((user_id = (select auth.uid())) AND (EXISTS (
    SELECT 1 FROM decisions d
    WHERE ((d.id = decision_arguments.decision_id) AND is_group_member(d.group_id))
  )));

-- documents
ALTER POLICY "Group members can upload documents" ON public.documents
  WITH CHECK (is_group_member(group_id) AND (uploaded_by = (select auth.uid())));

-- event_history
ALTER POLICY "Members can insert event history" ON public.event_history
  WITH CHECK (group_id IN (
    SELECT group_members.group_id FROM group_members
    WHERE group_members.user_id = (select auth.uid())
  ));
ALTER POLICY "Members can view event history" ON public.event_history
  USING (group_id IN (
    SELECT group_members.group_id FROM group_members
    WHERE group_members.user_id = (select auth.uid())
  ));

-- event_requests
ALTER POLICY "Affected users and requester can update" ON public.event_requests
  USING (((select auth.uid()) = ANY (affected_user_ids))
    OR (requester_id = (select auth.uid())));
ALTER POLICY "Members can create event requests" ON public.event_requests
  WITH CHECK ((requester_id = (select auth.uid())) AND (group_id IN (
    SELECT group_members.group_id FROM group_members
    WHERE group_members.user_id = (select auth.uid())
  )));
ALTER POLICY "Members can view event requests" ON public.event_requests
  USING (group_id IN (
    SELECT group_members.group_id FROM group_members
    WHERE group_members.user_id = (select auth.uid())
  ));

-- events
ALTER POLICY "Creators can delete events" ON public.events
  USING (created_by = (select auth.uid()));
ALTER POLICY "Group members can create events" ON public.events
  WITH CHECK (is_group_member(group_id) AND (created_by = (select auth.uid())));

-- expense_history
ALTER POLICY "expense_history self insert" ON public.expense_history
  WITH CHECK ((actor_id = (select auth.uid())) AND is_group_member((
    SELECT expenses.group_id FROM expenses
    WHERE (expenses.id = expense_history.expense_id)
  )));

-- growth_records
ALTER POLICY "Coparents can delete growth" ON public.growth_records
  USING (EXISTS (
    SELECT 1 FROM group_members gm
    WHERE ((gm.group_id = growth_records.group_id)
      AND (gm.user_id = (select auth.uid()))
      AND (gm.role = ANY (ARRAY['admin'::member_role, 'member'::member_role])))
  ));
ALTER POLICY "Coparents can update growth" ON public.growth_records
  USING (EXISTS (
    SELECT 1 FROM group_members gm
    WHERE ((gm.group_id = growth_records.group_id)
      AND (gm.user_id = (select auth.uid()))
      AND (gm.role = ANY (ARRAY['admin'::member_role, 'member'::member_role])))
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM group_members gm
    WHERE ((gm.group_id = growth_records.group_id)
      AND (gm.user_id = (select auth.uid()))
      AND (gm.role = ANY (ARRAY['admin'::member_role, 'member'::member_role])))
  ));
ALTER POLICY "Group members can create growth" ON public.growth_records
  WITH CHECK (is_group_member(group_id) AND (created_by = (select auth.uid())));

-- health_logs
ALTER POLICY "Group members can create health logs" ON public.health_logs
  WITH CHECK (is_group_member(group_id) AND (logged_by = (select auth.uid())));

-- health_views
ALTER POLICY "Users can insert own views" ON public.health_views
  WITH CHECK (is_group_member(group_id) AND (viewed_by = (select auth.uid())));
ALTER POLICY "Users can update own views" ON public.health_views
  USING (viewed_by = (select auth.uid()))
  WITH CHECK (viewed_by = (select auth.uid()));

-- invitations
ALTER POLICY "Coparents can cancel invitations" ON public.invitations
  USING (EXISTS (
    SELECT 1 FROM group_members gm
    WHERE ((gm.group_id = invitations.group_id)
      AND (gm.user_id = (select auth.uid()))
      AND (gm.role = ANY (ARRAY['admin'::member_role, 'member'::member_role])))
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM group_members gm
    WHERE ((gm.group_id = invitations.group_id)
      AND (gm.user_id = (select auth.uid()))
      AND (gm.role = ANY (ARRAY['admin'::member_role, 'member'::member_role])))
  ));
ALTER POLICY "Coparents can create invitations" ON public.invitations
  WITH CHECK (EXISTS (
    SELECT 1 FROM group_members gm
    WHERE ((gm.group_id = invitations.group_id)
      AND (gm.user_id = (select auth.uid()))
      AND (gm.role = ANY (ARRAY['admin'::member_role, 'member'::member_role])))
  ));
ALTER POLICY "Coparents can delete invitations" ON public.invitations
  USING (EXISTS (
    SELECT 1 FROM group_members gm
    WHERE ((gm.group_id = invitations.group_id)
      AND (gm.user_id = (select auth.uid()))
      AND (gm.role = ANY (ARRAY['admin'::member_role, 'member'::member_role])))
  ));
ALTER POLICY "Inviters can view their invitations" ON public.invitations
  USING ((invited_by = (select auth.uid()))
    OR (email = ((select auth.jwt()) ->> 'email'::text))
    OR is_group_member(group_id));

-- medical_professionals
ALTER POLICY "Group members can create professionals" ON public.medical_professionals
  WITH CHECK (is_group_member(group_id) AND (created_by = (select auth.uid())));

-- medication_doses
ALTER POLICY "Group members can log doses" ON public.medication_doses
  WITH CHECK ((administered_by = (select auth.uid())) AND (EXISTS (
    SELECT 1 FROM active_medications m
    WHERE ((m.id = medication_doses.medication_id) AND is_group_member(m.group_id))
  )));

-- onboarding_quests
ALTER POLICY "Users can insert own quests" ON public.onboarding_quests
  WITH CHECK (user_id = (select auth.uid()));
ALTER POLICY "Users can read own quests" ON public.onboarding_quests
  USING (user_id = (select auth.uid()));

-- private_notes
ALTER POLICY "Users can create own notes" ON public.private_notes
  WITH CHECK (user_id = (select auth.uid()));
ALTER POLICY "Users can delete own notes" ON public.private_notes
  USING (user_id = (select auth.uid()));
ALTER POLICY "Users can update own notes" ON public.private_notes
  USING (user_id = (select auth.uid()));
ALTER POLICY "Users can view own notes" ON public.private_notes
  USING (user_id = (select auth.uid()));

-- referral_clicks
ALTER POLICY "Users can read their own referral clicks" ON public.referral_clicks
  USING (code IN (
    SELECT profiles.referral_code FROM profiles
    WHERE (profiles.id = (select auth.uid()))
  ));

-- referral_rewards
ALTER POLICY "Users can read their referral rewards" ON public.referral_rewards
  USING ((referrer_user_id = (select auth.uid()))
    OR (referred_user_id = (select auth.uid())));

-- sensitive_notes
ALTER POLICY "Creators can delete sensitive notes" ON public.sensitive_notes
  USING (created_by = (select auth.uid()));
ALTER POLICY "Group members can create sensitive notes" ON public.sensitive_notes
  WITH CHECK (is_group_member(group_id) AND (created_by = (select auth.uid())));

-- subscriptions
ALTER POLICY "Group members can read group subscription" ON public.subscriptions
  USING ((coparenting_group_id IS NOT NULL) AND (EXISTS (
    SELECT 1 FROM group_members gm
    WHERE ((gm.group_id = subscriptions.coparenting_group_id)
      AND (gm.user_id = (select auth.uid())))
  )));
ALTER POLICY "Users can read own subscriptions" ON public.subscriptions
  USING (user_id = (select auth.uid()));

-- terms_acceptances
ALTER POLICY "Users read own acceptances" ON public.terms_acceptances
  USING (user_id = (select auth.uid()));

-- usage_events
ALTER POLICY "Users can view own usage" ON public.usage_events
  USING ((select auth.uid()) = user_id);

-- vaccine_notification_dismissals
ALTER POLICY "User can create own dismissals" ON public.vaccine_notification_dismissals
  WITH CHECK ((user_id = (select auth.uid())) AND is_group_member((
    SELECT children.group_id FROM children
    WHERE (children.id = vaccine_notification_dismissals.child_id)
  )));
ALTER POLICY "User can delete own dismissals" ON public.vaccine_notification_dismissals
  USING (user_id = (select auth.uid()));
ALTER POLICY "User can view own dismissals" ON public.vaccine_notification_dismissals
  USING (user_id = (select auth.uid()));

-- whatsapp_message_logs
ALTER POLICY "Users can view own message logs" ON public.whatsapp_message_logs
  USING ((select auth.uid()) = user_id);

-- whatsapp_notification_preferences
ALTER POLICY "Users can delete own notification prefs" ON public.whatsapp_notification_preferences
  USING ((select auth.uid()) = user_id);
ALTER POLICY "Users can insert own notification prefs" ON public.whatsapp_notification_preferences
  WITH CHECK ((select auth.uid()) = user_id);
ALTER POLICY "Users can update own notification prefs" ON public.whatsapp_notification_preferences
  USING ((select auth.uid()) = user_id);
ALTER POLICY "Users can view own notification prefs" ON public.whatsapp_notification_preferences
  USING ((select auth.uid()) = user_id);

-- whatsapp_phone_links
ALTER POLICY "Users can delete own phone links" ON public.whatsapp_phone_links
  USING ((select auth.uid()) = user_id);
ALTER POLICY "Users can insert own phone links" ON public.whatsapp_phone_links
  WITH CHECK ((select auth.uid()) = user_id);
ALTER POLICY "Users can update own phone links" ON public.whatsapp_phone_links
  USING ((select auth.uid()) = user_id);
ALTER POLICY "Users can view own phone links" ON public.whatsapp_phone_links
  USING ((select auth.uid()) = user_id);
