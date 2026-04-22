/**
 * Invitations service — mirrors PWA src/actions/invitation.ts.
 *
 * Workflow 1/8 da aprovacao: convidar outro responsavel a entrar no grupo.
 * Estados: pending → accepted | expired | cancelled.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
import { supabase } from '../lib/supabase';
import { notifyAction } from './notify';

export interface Invitation {
  id: string;
  group_id: string;
  email: string;
  role: string;
  group_role: 'admin' | 'member' | 'readonly';
  token: string;
  status: 'pending' | 'accepted' | 'expired' | 'cancelled';
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
  const groupRole: 'readonly' | 'member' =
    params.role === 'mediator' || params.role === 'lawyer' ? 'readonly' : 'member';

  const { data, error } = await supabase
    .from('invitations')
    .insert({
      group_id: params.groupId,
      invited_by: params.invitedBy,
      email: params.email.trim().toLowerCase(),
      role: params.role,
      group_role: groupRole,
    })
    .select('id, token')
    .single();

  if (error || !data) return { success: false, error: error?.message || 'Erro ao criar convite' };

  notifyAction('invitation_sent', params.groupId, {
    email: params.email,
    role: params.role,
  });
  return { success: true, token: data.token, id: data.id };
}

export async function cancelInvitation(invitationId: string, groupId: string): Promise<{ success: boolean; error?: string }> {
  const { error } = await supabase
    .from('invitations')
    .update({ status: 'cancelled' })
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
