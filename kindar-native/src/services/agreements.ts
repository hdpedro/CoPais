/**
 * Agreements Service — All writes use safeWrite.
 */

import { supabase } from '../lib/supabase';
import { safeWrite } from './offline';
import { notifyAction } from './notify';

export interface Agreement {
  id: string; title: string; description: string | null; category: string;
  status: string; created_by: string; created_at: string; authorName?: string;
}

export async function fetchAgreements(groupId: string): Promise<Agreement[]> {
  const { data } = await supabase.from('agreements')
    .select('id, title, description, category, status, created_by, created_at, profiles!agreements_created_by_fkey(full_name)')
    .eq('group_id', groupId).order('created_at', { ascending: false }).limit(100);
  return (data || []).map((a: any) => ({ ...a, authorName: a.profiles?.full_name?.split(' ')[0] || '' }));
}

export async function createAgreement(params: {
  groupId: string; title: string; description?: string; category?: string; createdBy: string;
}) {
  const result = await safeWrite({
    table: 'agreements', operation: 'insert',
    payload: {
      group_id: params.groupId, title: params.title.trim(),
      description: params.description?.trim() || null, category: params.category || 'geral',
      status: 'active', created_by: params.createdBy,
    },
  });
  if (result.success && !result.queued) {
    notifyAction('agreement_created', params.groupId, { title: params.title });
  }
  return result;
}
