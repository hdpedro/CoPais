/**
 * Decisions Service — All writes use safeWrite.
 */

import { supabase } from '../lib/supabase';
import { safeWrite } from './offline';
import { notifyAction } from './notify';

export interface Decision {
  id: string; title: string; description: string | null; category: string;
  status: string; deadline: string | null; created_by: string; created_at: string; authorName?: string;
}

export async function fetchDecisions(groupId: string): Promise<Decision[]> {
  const { data } = await supabase.from('decisions')
    .select('id, title, description, category, status, deadline, created_by, created_at, profiles!decisions_created_by_fkey(full_name)')
    .eq('group_id', groupId).order('created_at', { ascending: false }).limit(100);
  return (data || []).map((d: any) => ({ ...d, authorName: d.profiles?.full_name?.split(' ')[0] || '' }));
}

export async function createDecision(params: {
  groupId: string; title: string; description?: string; category?: string; deadline?: string; createdBy: string;
}) {
  const result = await safeWrite({
    table: 'decisions', operation: 'insert',
    payload: {
      group_id: params.groupId, title: params.title.trim(),
      description: params.description?.trim() || null, category: params.category || 'outro',
      status: 'open', deadline: params.deadline || null, created_by: params.createdBy,
    },
  });
  if (result.success && !result.queued) {
    notifyAction('decision_created', params.groupId, { title: params.title });
  }
  return result;
}
