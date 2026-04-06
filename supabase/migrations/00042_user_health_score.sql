CREATE OR REPLACE VIEW user_health_score AS
SELECT
  p.id,
  p.full_name,
  p.email,
  COALESCE(p.onboarding_step, 0) as onboarding_step,
  p.created_at,
  EXTRACT(DAY FROM now() - p.created_at)::int as days_since_signup,
  (SELECT COUNT(*)::int FROM group_members WHERE user_id = p.id) as groups_count,
  (SELECT COUNT(*)::int FROM child_activities WHERE created_by = p.id) as activities_created,
  (SELECT COUNT(*)::int FROM daily_checkins WHERE logged_by = p.id AND checkin_date > now() - interval '7 days') as recent_checkins,
  (SELECT COUNT(*)::int FROM chat_messages WHERE sender_id = p.id AND created_at > now() - interval '7 days') as recent_messages,
  CASE
    WHEN COALESCE(p.onboarding_step, 0) >= 4
      AND (SELECT COUNT(*) FROM child_activities WHERE created_by = p.id) >= 3
      AND (SELECT COUNT(*) FROM chat_messages WHERE sender_id = p.id AND created_at > now() - interval '7 days') > 0
    THEN 'hot'
    WHEN COALESCE(p.onboarding_step, 0) >= 4
      AND (SELECT COUNT(*) FROM child_activities WHERE created_by = p.id) >= 1
    THEN 'warm'
    WHEN COALESCE(p.onboarding_step, 0) > 0 THEN 'cold'
    ELSE 'inactive'
  END as lead_status
FROM profiles p;
