-- RPC consolidando ~17 SELECTs do useDashboard num único round-trip.
-- SECURITY INVOKER: usa RLS do caller (já corrigida em 00098-00100).
-- STABLE: Postgres pode cachear dentro da transação.
--
-- Motivação: fan-out de 17 queries em 7 batches sequenciais é frágil — qualquer
-- transient (PostgREST schema reload, cron pressure no pool, latência de rede)
-- bate no withTimeout 15s e mostra empty state mesmo pra returning user.
-- 1 round-trip + 1 plan + 1 RLS context = ~30ms estável vs 250ms-15s variável.
--
-- Aplicado em prod via MCP em 2026-05-29 em duas etapas (a primeira tinha
-- gm.created_at, inexistente — fix gm.joined_at). Este arquivo já reflete o
-- estado final correto; CREATE OR REPLACE é idempotente.

CREATE OR REPLACE FUNCTION public.get_dashboard_payload(
  p_group_id uuid,
  p_today date,
  p_tomorrow date,
  p_sixty_days_from_today date,
  p_week_ago date,
  p_yesterday date
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_payload jsonb;
BEGIN
  -- Gate de membership: defesa em profundidade (RLS já cobre mas garante erro claro).
  IF v_user_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM group_members WHERE group_id = p_group_id AND user_id = v_user_id
  ) THEN
    RAISE EXCEPTION 'not a member of group' USING ERRCODE = '42501';
  END IF;

  SELECT jsonb_build_object(
    'members', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'user_id', gm.user_id,
        'role', gm.role,
        'full_name', p.full_name
      ) ORDER BY gm.joined_at)
      FROM group_members gm
      LEFT JOIN profiles p ON p.id = gm.user_id
      WHERE gm.group_id = p_group_id
    ), '[]'::jsonb),

    'children', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', id, 'full_name', full_name, 'birth_date', birth_date, 'photo_url', photo_url
      ) ORDER BY birth_date)
      FROM children
      WHERE group_id = p_group_id
    ), '[]'::jsonb),

    'custody_window', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', ce.id, 'start_date', ce.start_date, 'end_date', ce.end_date,
        'responsible_user_id', ce.responsible_user_id, 'child_id', ce.child_id,
        'custody_type', ce.custody_type,
        'child_full_name', ch.full_name,
        'responsible_full_name', p.full_name
      ) ORDER BY ce.start_date)
      FROM custody_events ce
      LEFT JOIN children ch ON ch.id = ce.child_id
      LEFT JOIN profiles p ON p.id = ce.responsible_user_id
      WHERE ce.group_id = p_group_id
        AND ce.end_date >= p_today
        AND ce.start_date <= p_sixty_days_from_today
    ), '[]'::jsonb),

    'tomorrow_custody', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', ce.id, 'start_date', ce.start_date, 'end_date', ce.end_date,
        'responsible_user_id', ce.responsible_user_id, 'child_id', ce.child_id,
        'custody_type', ce.custody_type,
        'child_full_name', ch.full_name
      ))
      FROM custody_events ce
      LEFT JOIN children ch ON ch.id = ce.child_id
      WHERE ce.group_id = p_group_id
        AND ce.start_date <= p_tomorrow AND ce.end_date >= p_tomorrow
    ), '[]'::jsonb),

    'today_occurrences', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', co.id, 'activity_id', co.activity_id, 'occurrence_date', co.occurrence_date,
        'activity', jsonb_build_object(
          'id', ca.id, 'name', ca.name, 'category', ca.category,
          'time_start', ca.time_start, 'time_end', ca.time_end, 'location', ca.location,
          'child_id', ca.child_id, 'child_full_name', ch.full_name
        )
      ))
      FROM (
        SELECT id, activity_id, occurrence_date FROM calendar_occurrences
        WHERE group_id = p_group_id AND occurrence_date = p_today
        LIMIT 20
      ) co
      LEFT JOIN child_activities ca ON ca.id = co.activity_id
      LEFT JOIN children ch ON ch.id = ca.child_id
    ), '[]'::jsonb),

    'tomorrow_occurrences', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', co.id, 'activity_id', co.activity_id, 'occurrence_date', co.occurrence_date,
        'activity', jsonb_build_object(
          'id', ca.id, 'name', ca.name, 'category', ca.category,
          'time_start', ca.time_start, 'time_end', ca.time_end, 'location', ca.location,
          'child_id', ca.child_id, 'child_full_name', ch.full_name
        )
      ))
      FROM (
        SELECT id, activity_id, occurrence_date FROM calendar_occurrences
        WHERE group_id = p_group_id AND occurrence_date = p_tomorrow
        LIMIT 20
      ) co
      LEFT JOIN child_activities ca ON ca.id = co.activity_id
      LEFT JOIN children ch ON ch.id = ca.child_id
    ), '[]'::jsonb),

    'today_reported_activity_ids', COALESCE((
      SELECT jsonb_agg(activity_id)
      FROM (
        SELECT activity_id FROM activity_reports
        WHERE group_id = p_group_id AND occurrence_date = p_today
        LIMIT 50
      ) ar
    ), '[]'::jsonb),

    'past_pending_reports', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'activity_id', po.activity_id,
        'activity_name', po.activity_name,
        'child_id', po.child_id,
        'child_full_name', po.child_full_name,
        'occurrence_date', po.occurrence_date
      ))
      FROM (
        SELECT DISTINCT ON (co.activity_id, co.occurrence_date)
          co.activity_id, co.occurrence_date,
          ca.name AS activity_name, ca.child_id, ch.full_name AS child_full_name
        FROM calendar_occurrences co
        JOIN child_activities ca ON ca.id = co.activity_id
        LEFT JOIN children ch ON ch.id = ca.child_id
        WHERE co.group_id = p_group_id
          AND co.occurrence_date >= p_week_ago
          AND co.occurrence_date <= p_yesterday
        ORDER BY co.activity_id, co.occurrence_date, co.id
        LIMIT 30
      ) po
      WHERE NOT EXISTS (
        SELECT 1 FROM activity_reports ar
        WHERE ar.group_id = p_group_id
          AND ar.activity_id = po.activity_id
          AND ar.occurrence_date = po.occurrence_date
      )
    ), '[]'::jsonb),

    'notifications_unread_count', COALESCE((
      SELECT count(*) FROM notifications
      WHERE user_id = v_user_id AND is_read = false
    ), 0),

    'pending_expenses_list', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', e.id, 'description', e.description, 'amount', e.amount,
        'category', e.category, 'expense_date', e.expense_date,
        'paid_by', e.paid_by, 'paid_by_full_name', p.full_name
      ) ORDER BY e.created_at DESC)
      FROM (
        SELECT id, description, amount, category, expense_date, paid_by, created_at
        FROM expenses
        WHERE group_id = p_group_id AND status = 'pending' AND paid_by != v_user_id
        ORDER BY created_at DESC LIMIT 5
      ) e
      LEFT JOIN profiles p ON p.id = e.paid_by
    ), '[]'::jsonb),

    'balance_buckets', (
      SELECT jsonb_build_object(
        'my', COALESCE(SUM(amount) FILTER (WHERE paid_by = v_user_id), 0),
        'other', COALESCE(SUM(amount) FILTER (WHERE paid_by != v_user_id), 0)
      )
      FROM expenses
      WHERE group_id = p_group_id AND status = 'approved'
    ),

    'open_decisions', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', d.id, 'title', d.title, 'category', d.category, 'deadline', d.deadline,
        'has_my_vote', EXISTS (
          SELECT 1 FROM decision_votes dv
          WHERE dv.decision_id = d.id AND dv.user_id = v_user_id
        )
      ) ORDER BY d.created_at DESC)
      FROM (
        SELECT id, title, category, deadline, created_at
        FROM decisions
        WHERE group_id = p_group_id AND status = 'aberta'
        ORDER BY created_at DESC LIMIT 10
      ) d
    ), '[]'::jsonb),

    'pending_swaps_target', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', s.id, 'original_date', s.original_date, 'proposed_date', s.proposed_date,
        'reason', s.reason, 'created_at', s.created_at,
        'requester_id', s.requester_id, 'requester_full_name', p.full_name
      ) ORDER BY s.created_at DESC)
      FROM (
        SELECT id, original_date, proposed_date, reason, created_at, requester_id
        FROM swap_requests
        WHERE group_id = p_group_id AND status = 'pending' AND target_user_id = v_user_id
        ORDER BY created_at DESC LIMIT 3
      ) s
      LEFT JOIN profiles p ON p.id = s.requester_id
    ), '[]'::jsonb),

    'my_sent_swaps', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', s.id, 'original_date', s.original_date, 'proposed_date', s.proposed_date,
        'reason', s.reason, 'target_user_id', s.target_user_id,
        'target_full_name', p.full_name
      ) ORDER BY s.created_at DESC)
      FROM (
        SELECT id, original_date, proposed_date, reason, target_user_id, created_at
        FROM swap_requests
        WHERE group_id = p_group_id AND status = 'pending' AND requester_id = v_user_id
        ORDER BY created_at DESC LIMIT 5
      ) s
      LEFT JOIN profiles p ON p.id = s.target_user_id
    ), '[]'::jsonb),

    'illness_active', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', ie.id, 'title', ie.title, 'child_id', ie.child_id, 'child_full_name', ch.full_name
      ))
      FROM (
        SELECT id, title, child_id FROM illness_episodes
        WHERE group_id = p_group_id AND status = 'active' LIMIT 10
      ) ie
      LEFT JOIN children ch ON ch.id = ie.child_id
    ), '[]'::jsonb),

    'meds_active', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', am.id, 'name', am.name, 'child_id', am.child_id, 'child_full_name', ch.full_name
      ))
      FROM (
        SELECT id, name, child_id FROM active_medications
        WHERE group_id = p_group_id AND status = 'active' AND end_date IS NOT NULL
        LIMIT 10
      ) am
      LEFT JOIN children ch ON ch.id = am.child_id
    ), '[]'::jsonb),

    'school_unread_count', (
      SELECT count(*) FROM school_logs sl
      WHERE sl.group_id = p_group_id
        AND NOT EXISTS (
          SELECT 1 FROM collab_reads cr
          WHERE cr.user_id = v_user_id
            AND cr.record_type = 'school_log'
            AND cr.record_id = sl.id
        )
    ),

    'expenses_unread_count', (
      SELECT count(*) FROM expenses e
      WHERE e.group_id = p_group_id
        AND e.status IN ('pending', 'cancel_pending')
        AND NOT EXISTS (
          SELECT 1 FROM collab_reads cr
          WHERE cr.user_id = v_user_id
            AND cr.record_type = 'expense'
            AND cr.record_id = e.id
        )
    ),

    'saude_unread_count', (
      WITH saude_records AS (
        SELECT id, 'medical_appointment'::text AS rt
          FROM medical_appointments
          WHERE group_id = p_group_id AND status = 'scheduled'
        UNION ALL
        SELECT id, 'illness_episode'
          FROM illness_episodes
          WHERE group_id = p_group_id AND status = 'active'
        UNION ALL
        SELECT id, 'active_medication'
          FROM active_medications
          WHERE group_id = p_group_id AND status = 'active'
        UNION ALL
        SELECT id, 'child_allergy'
          FROM child_allergies
          WHERE group_id = p_group_id
        UNION ALL
        SELECT id, 'vaccination_record'
          FROM vaccination_records
          WHERE group_id = p_group_id
      )
      SELECT count(*) FROM saude_records sr
      WHERE NOT EXISTS (
        SELECT 1 FROM collab_reads cr
        WHERE cr.user_id = v_user_id
          AND cr.record_type = sr.rt
          AND cr.record_id = sr.id
      )
    ),

    'vaccine_summary', COALESCE((
      WITH coverage AS (
        SELECT overdue_count, due_soon_count, total_taken,
               next_due_date, next_due_vaccine_name
        FROM child_vaccine_coverage
        WHERE group_id = p_group_id
          AND COALESCE(total_taken, 0) > 0
      )
      SELECT jsonb_build_object(
        'pending_count', COALESCE(SUM(COALESCE(overdue_count, 0) + COALESCE(due_soon_count, 0)), 0),
        'next_due', (
          SELECT jsonb_build_object('due_date', next_due_date, 'vaccine_name', next_due_vaccine_name)
          FROM coverage
          WHERE next_due_date IS NOT NULL
          ORDER BY next_due_date ASC
          LIMIT 1
        )
      )
      FROM coverage
    ), jsonb_build_object('pending_count', 0, 'next_due', NULL)),

    'group_name', (SELECT name FROM coparenting_groups WHERE id = p_group_id),

    'user_profile', (
      SELECT jsonb_build_object(
        'display_name', display_name,
        'full_name', full_name,
        'email', email
      )
      FROM profiles WHERE id = v_user_id
    )
  ) INTO v_payload;

  RETURN v_payload;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_dashboard_payload(uuid, date, date, date, date, date) TO authenticated;

COMMENT ON FUNCTION public.get_dashboard_payload IS
  'Consolida ~17 SELECTs do useDashboard num único round-trip. SECURITY INVOKER usa RLS do caller. Adicionado 2026-05-29 pra estabilizar empty-state transiente do dashboard iOS após o sweep RLS 00098-00100.';
