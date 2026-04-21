/**
 * Supabase client for data validation tests.
 * Queries the SAME database used by both PWA and Native.
 */

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_ANON_KEY || ''
);

export { supabase };

/**
 * Login and get authenticated client for data queries.
 */
export async function getAuthenticatedClient(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`Auth failed: ${error.message}`);
  return { client: supabase, userId: data.user?.id, session: data.session };
}

/**
 * Fetch core data for a user — used to compare what PWA and Native should show.
 */
export async function fetchUserCoreData(userId: string) {
  // Get user's group
  const { data: memberships } = await supabase
    .from('group_members')
    .select('group_id, role, coparenting_groups(id, name)')
    .eq('user_id', userId)
    .limit(1);

  const groupId = (memberships?.[0]?.coparenting_groups as any)?.id;
  if (!groupId) return null;

  // Parallel queries — same as dashboard
  const [
    { data: children },
    { data: expenses, count: expenseCount },
    { data: events },
    { data: activities },
    { data: channels },
    { data: decisions },
    { data: notes },
    { data: notifications, count: notifCount },
    { data: illnesses },
    { data: medications },
    { data: documents },
    { data: agreements },
  ] = await Promise.all([
    supabase.from('children').select('id, full_name').eq('group_id', groupId),
    supabase.from('expenses').select('id', { count: 'exact', head: true }).eq('group_id', groupId),
    supabase.from('events').select('id, title').eq('group_id', groupId).limit(10),
    supabase.from('child_activities').select('id, name').eq('group_id', groupId).eq('is_active', true),
    supabase.from('chat_channels').select('id, name').eq('group_id', groupId),
    supabase.from('decisions').select('id, title').eq('group_id', groupId),
    supabase.from('private_notes').select('id').eq('user_id', userId),
    supabase.from('notifications').select('id', { count: 'exact', head: true }).eq('user_id', userId),
    supabase.from('illness_episodes').select('id').eq('group_id', groupId),
    supabase.from('active_medications').select('id').eq('group_id', groupId),
    supabase.from('documents').select('id').eq('group_id', groupId),
    supabase.from('agreements').select('id').eq('group_id', groupId),
  ]);

  return {
    groupId,
    childrenCount: children?.length || 0,
    expenseCount: expenseCount || 0,
    eventCount: events?.length || 0,
    activityCount: activities?.length || 0,
    channelCount: channels?.length || 0,
    decisionCount: decisions?.length || 0,
    noteCount: notes?.length || 0,
    notificationCount: notifCount || 0,
    illnessCount: illnesses?.length || 0,
    medicationCount: medications?.length || 0,
    documentCount: documents?.length || 0,
    agreementCount: agreements?.length || 0,
  };
}
