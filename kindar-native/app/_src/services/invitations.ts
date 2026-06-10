/**
 * Invitations service — mirrors PWA src/actions/invitation.ts.
 *
 * Workflow 1/8 da aprovacao: convidar outro responsavel a entrar no grupo.
 * Estados: pending → accepted | expired | revoked (enum invitation_status do DB;
 * NÃO existe 'cancelled' — bug Matheus 09/jun: cancelInvitation mandava
 * 'cancelled' e o enum rejeitava silenciosamente).
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
import { supabase } from '../lib/supabase';
import { apiFetch } from '../lib/api-fetch';
import { notifyAction } from './notify';

export interface Invitation {
  id: string;
  group_id: string;
  email: string;
  role: string;
  group_role: 'admin' | 'member' | 'readonly';
  token: string;
  status: 'pending' | 'accepted' | 'expired' | 'revoked';
  invited_by: string;
  created_at: string;
  expires_at: string;
  inviterName?: string;
}

export async function listInvitations(groupId: string): Promise<Invitation[]> {
  const { data } = await supabase
    .from('invitations')
    .select('id, group_id, email, role, group_role, token, status, invited_by, created_at, expires_at, profiles!invitations_invited_by_fkey(full_name)')
    .eq('group_id', groupId)
    .order('created_at', { ascending: false })
    .limit(50);

  return (data || []).map((i: any) => ({
    id: i.id,
    group_id: i.group_id,
    email: i.email,
    role: i.role,
    group_role: i.group_role,
    token: i.token,
    status: i.status,
    invited_by: i.invited_by,
    created_at: i.created_at,
    expires_at: i.expires_at,
    inviterName: i.profiles?.full_name?.split(' ')[0] || '',
  }));
}

export async function createInvitation(params: {
  groupId: string;
  email: string;
  role: string;
  invitedBy: string;
}): Promise<{ success: boolean; error?: string; token?: string; id?: string }> {
  // Wave G: server-side admin gate + quest tracking + onboarding step.
  // The previous direct INSERT skipped admin verification entirely.
  const r = await apiFetch<{ success: boolean; invitationId: string; token: string }>(
    '/api/invitations',
    {
      method: 'POST',
      body: {
        groupId: params.groupId,
        email: params.email,
        role: params.role,
      },
    },
  );
  if (!r.ok || !r.data) return { success: false, error: r.error };
  return { success: true, token: r.data.token, id: r.data.invitationId };
}

export async function cancelInvitation(invitationId: string, groupId: string): Promise<{ success: boolean; error?: string }> {
  // Cancellation only updates status — RLS allows the inviter to do this
  // and admin gating is enforced via the existing `update` policy. Read
  // path stays here while a future API wrapper unifies the audit trail.
  const { error } = await supabase
    .from('invitations')
    .update({ status: 'revoked' })
    .eq('id', invitationId);
  if (error) return { success: false, error: error.message };

  notifyAction('invitation_cancelled', groupId, { invitationId });
  return { success: true };
}

/**
 * Accept an invitation — user clicks link from email/share card and is already
 * logged in. Looks up invitation by token, creates group_members row, marks accepted.
 */
export async function acceptInvitation(token: string, userId: string): Promise<{
  success: boolean;
  error?: string;
  groupId?: string;
  groupName?: string;
}> {
  const { data: inv, error: invError } = await supabase
    .from('invitations')
    .select('id, group_id, group_role, status, expires_at, coparenting_groups(name)')
    .eq('token', token)
    .single();

  if (invError || !inv) return { success: false, error: 'Convite nao encontrado' };
  if (inv.status !== 'pending') return { success: false, error: `Convite ja foi ${inv.status === 'accepted' ? 'aceito' : inv.status === 'expired' ? 'expirado' : 'cancelado'}` };
  if (new Date(inv.expires_at) < new Date()) return { success: false, error: 'Convite expirou' };

  // Insert membership (RLS policy deve permitir pois tem token valido)
  const { error: memberError } = await supabase
    .from('group_members')
    .insert({
      group_id: inv.group_id,
      user_id: userId,
      role: inv.group_role,
    });

  if (memberError) {
    // 23505 = unique violation (ja era membro) — considerar sucesso
    if (!memberError.message.includes('duplicate')) {
      return { success: false, error: memberError.message };
    }
  }

  await supabase.from('invitations').update({ status: 'accepted' }).eq('id', inv.id);

  notifyAction('invitation_accepted', inv.group_id, { userId });

  const groupName = (inv.coparenting_groups as any)?.name || '';
  return { success: true, groupId: inv.group_id, groupName };
}
