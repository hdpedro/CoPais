/**
 * Agreements Service — mirrors PWA src/actions/agreements.ts.
 *
 * Workflow 7/8: acordo parental com aceite do co-responsavel.
 * Categorias: principle/value/rule/boundary/routine (DB CHECK constraint).
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
import { supabase } from '../lib/supabase';
import { safeWrite } from './offline';
import { notifyAction } from './notify';

export type AgreementCategory = 'principle' | 'value' | 'rule' | 'boundary' | 'routine';

export interface Agreement {
  id: string;
  title: string;
  description: string;
  category: AgreementCategory | string;
  is_non_negotiable: boolean;
  created_by: string;
  accepted_by: string | null;
  accepted_at: string | null;
  created_at: string;
  authorName?: string;
  acceptedByName?: string;
}

export async function fetchAgreements(groupId: string): Promise<Agreement[]> {
  const { data } = await supabase.from('agreements')
    .select('id, title, description, category, is_non_negotiable, created_by, accepted_by, accepted_at, created_at, profiles!agreements_created_by_fkey(full_name), accepted_profile:profiles!agreements_accepted_by_fkey(full_name)')
    .eq('group_id', groupId)
    .order('created_at', { ascending: false })
    .limit(100);

  return (data || []).map((a: any) => ({
    id: a.id,
    title: a.title,
    description: a.description,
    category: a.category,
    is_non_negotiable: a.is_non_negotiable,
    created_by: a.created_by,
    accepted_by: a.accepted_by,
    accepted_at: a.accepted_at,
    created_at: a.created_at,
    authorName: a.profiles?.full_name?.split(' ')[0] || '',
    acceptedByName: a.accepted_profile?.full_name?.split(' ')[0] || '',
  }));
}

export async function createAgreement(params: {
  groupId: string;
  title: string;
  description: string;
  category: AgreementCategory;
  isNonNegotiable?: boolean;
  createdBy: string;
}) {
  const result = await safeWrite({
    table: 'agreements',
    operation: 'insert',
    payload: {
      group_id: params.groupId,
      title: params.title.trim(),
      description: params.description.trim(),
      category: params.category,
      is_non_negotiable: params.isNonNegotiable ?? false,
      created_by: params.createdBy,
    },
  });
  if (result.success && !result.queued) {
    notifyAction('agreement_created', params.groupId, {
      title: params.title,
      category: params.category,
    });
  }
  return result;
}

export async function acceptAgreement(
  agreementId: string,
  userId: string,
  groupId: string,
  title: string
): Promise<{ success: boolean; error?: string }> {
  const { error } = await supabase
    .from('agreements')
    .update({ accepted_by: userId, accepted_at: new Date().toISOString() })
    .eq('id', agreementId)
    .is('accepted_by', null);
  if (error) return { success: false, error: error.message };

  notifyAction('agreement_accepted', groupId, { title, agreementId });
  return { success: true };
}

export async function deleteAgreement(
  agreementId: string,
  groupId: string
): Promise<{ success: boolean; error?: string }> {
  const { error } = await supabase.from('agreements').delete().eq('id', agreementId);
  if (error) return { success: false, error: error.message };
  notifyAction('agreement_revoked', groupId, { agreementId });
  return { success: true };
}
