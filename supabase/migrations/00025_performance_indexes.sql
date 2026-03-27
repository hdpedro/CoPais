-- ============================================================
-- Performance indexes based on query audit (March 2026)
-- ============================================================

-- chat_messages: queried by channel_id frequently (channel filtering)
CREATE INDEX IF NOT EXISTS idx_chat_messages_channel
  ON public.chat_messages(channel_id);

-- chat_messages: queried by group_id + sender_id (unread count queries filter by sender)
CREATE INDEX IF NOT EXISTS idx_chat_messages_group_sender
  ON public.chat_messages(group_id, sender_id, created_at);

-- chat_channel_reads: queried by user_id for unread computation
CREATE INDEX IF NOT EXISTS idx_chat_channel_reads_user
  ON public.chat_channel_reads(user_id);

-- swap_requests: queried by group_id + status + target_user_id (dashboard pending swaps)
CREATE INDEX IF NOT EXISTS idx_swap_requests_group_status
  ON public.swap_requests(group_id, status);

-- active_medications: queried by child_id + status (saude page)
CREATE INDEX IF NOT EXISTS idx_active_medications_child_status
  ON public.active_medications(child_id, status);

-- active_medications: queried by group_id + status (dashboard)
CREATE INDEX IF NOT EXISTS idx_active_medications_group_status
  ON public.active_medications(group_id, status);

-- child_allergies: queried by child_id (saude page) and by group_id + severity (dashboard)
CREATE INDEX IF NOT EXISTS idx_child_allergies_child
  ON public.child_allergies(child_id);
CREATE INDEX IF NOT EXISTS idx_child_allergies_group
  ON public.child_allergies(group_id);

-- medical_appointments: queried by child_id + status + date (saude page, dashboard)
CREATE INDEX IF NOT EXISTS idx_medical_appointments_child_status
  ON public.medical_appointments(child_id, status, appointment_date);

-- illness_episodes: queried by child_id + status (saude page, dashboard)
CREATE INDEX IF NOT EXISTS idx_illness_episodes_child_status
  ON public.illness_episodes(child_id, status);

-- daily_checkins: queried by group_id + checkin_date (dashboard)
CREATE INDEX IF NOT EXISTS idx_daily_checkins_group_date
  ON public.daily_checkins(group_id, checkin_date);

-- child_activities: queried by group_id + is_active (calendar, dashboard, cron jobs)
CREATE INDEX IF NOT EXISTS idx_child_activities_group_active
  ON public.child_activities(group_id, is_active);

-- activity_reports: queried by group_id + activity_id + occurrence_date
CREATE INDEX IF NOT EXISTS idx_activity_reports_activity_date
  ON public.activity_reports(activity_id, occurrence_date);
CREATE INDEX IF NOT EXISTS idx_activity_reports_group
  ON public.activity_reports(group_id);

-- medication_doses: queried by medication_id (join to active_medications)
CREATE INDEX IF NOT EXISTS idx_medication_doses_medication
  ON public.medication_doses(medication_id, administered_at);

-- decisions: queried by group_id + status (dashboard)
CREATE INDEX IF NOT EXISTS idx_decisions_group_status
  ON public.decisions(group_id, status);

-- decision_votes: queried by user_id + decision_id (dashboard voting check)
CREATE INDEX IF NOT EXISTS idx_decision_votes_user
  ON public.decision_votes(user_id, decision_id);

-- events: queried by group_id + status + event_date (calendar, dashboard)
CREATE INDEX IF NOT EXISTS idx_events_group_date
  ON public.events(group_id, event_date);

-- vaccination_records: queried by child_id (saude vaccine comparison)
CREATE INDEX IF NOT EXISTS idx_vaccination_records_child
  ON public.vaccination_records(child_id);

-- growth_records: queried by child_id (saude counts)
CREATE INDEX IF NOT EXISTS idx_growth_records_child
  ON public.growth_records(child_id);

-- health_views: queried by group_id + child_id (saude page)
CREATE INDEX IF NOT EXISTS idx_health_views_group_child
  ON public.health_views(group_id, child_id);

-- settlements: queried by group_id (financeiro page)
CREATE INDEX IF NOT EXISTS idx_settlements_group
  ON public.settlements(group_id);
