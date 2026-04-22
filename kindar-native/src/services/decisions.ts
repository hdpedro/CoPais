/**
 * Decisions Service — mirrors PWA src/actions/decisions.ts.
 *
 * Covers the full shared-decision workflow (workflow 5 of 8):
 * - fetchDecisions: list with status + my vote + counts
 * - createDecision: open a new decision
 * - voteOnDecision: cast / update my vote (sim / nao / abster)
 * - fetchArguments / postArgument: discussion thread per decision
 * - closeDecision: manual close by creator
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
import { supabase } from '../lib/supabase';
import { safeWrite } from './offline';
import { notifyAction } from './notify';

export type DecisionStatus = 'aberta' | 'aprovada' | 'rejeitada' | 'expirada';
export type DecisionCategory = 'escola' | 'saude' | 'atividade' | 'viagem' | 'financeiro' | 'moradia' | 'outro';
export type VoteChoice = 'sim' | 'nao' | 'abster';

export interface Decision {
  id: string;
  title: string;
  description: string | null;
  category: DecisionCategory | string;
  status: DecisionStatus | string;
  deadline: string | null;
  created_by: string;
  created_at: string;
  authorName?: string;
  myVote?: VoteChoice | null;
  yesCount?: number;
  noCount?: number;
  abstainCount?: number;
  totalVoters?: number;
}

export interface DecisionArgument {
  id: string;
  decision_id: string;
  user_id: string;
  authorName: string;
  stance: 'favor' | 'contra' | 'neutro';
  text: string;
  created_at: string;
}

export async function fetchDecisions(groupId: string, userId: string | null): Promise<Decision[]> {
  const { data, error } = await supabase
    .from('decisions')
    .select(
      'id, title, description, category, status, deadline, created_by, created_at, profiles!decisions_created_by_fkey(full_name)'
    )
    .eq('group_id', groupId)
    .order('created_at', { ascending: false })
    .limit(100);

  if (error || !data) return [];

  const decisionIds = data.map((d: any) => d.id);
  if (decisionIds.length === 0) return [];

  // Bulk fetch votes + member count in parallel
  const [votesResp, membersResp] = await Promise.all([
    supabase
      .from('decision_votes')
      .select('decision_id, user_id, choice')
      .in('decision_id', decisionIds),
    supabase
      .from('group_members')
      .select('user_id', { count: 'exact', head: true })
      .eq('group_id', groupId),
  ]);

  const votes = votesResp.data || [];
  const totalVoters = membersResp.count || 1;

  return data.map((d: any) => {
    const myVote =
      userId != null
        ? (votes.find((v: any) => v.decision_id === d.id && v.user_id === userId)?.choice as VoteChoice | undefined) ?? null
        : null;
    const decVotes = votes.filter((v: any) => v.decision_id === d.id);
    const yesCount = decVotes.filter((v: any) => v.choice === 'sim').length;
    const noCount = decVotes.filter((v: any) => v.choice === 'nao').length;
    const abstainCount = decVotes.filter((v: any) => v.choice === 'abster').length;
    return {
      ...d,
      authorName: d.profiles?.full_name?.split(' ')[0] || '',
      myVote,
      yesCount,
      noCount,
      abstainCount,
      totalVoters,
    };
  });
}

export async function createDecision(params: {
  groupId: string;
  title: string;
  description?: string;
  category?: DecisionCategory;
  deadline?: string;
  createdBy: string;
}) {
  const result = await safeWrite({
    table: 'decisions',
    operation: 'insert',
    payload: {
      group_id: params.groupId,
      title: params.title.trim(),
      description: params.description?.trim() || null,
      category: params.category || 'outro',
      status: 'aberta', // PWA uses pt-BR enum — was 'open'
      deadline: params.deadline || null,
      created_by: params.createdBy,
    },
  });
  if (result.success && !result.queued) {
    notifyAction('decision_created', params.groupId, {
      title: params.title,
      category: params.category || 'outro',
      deadline: params.deadline || null,
    });
  }
  return result;
}

/** Cast or update my vote. Upserts so repeated calls change the choice instead of erroring. */
export async function voteOnDecision(
  decisionId: string,
  userId: string,
  groupId: string,
  choice: VoteChoice,
  decisionTitle: string
): Promise<{ success: boolean; error?: string }> {
  const { error } = await supabase
    .from('decision_votes')
    .upsert(
      { decision_id: decisionId, user_id: userId, choice },
      { onConflict: 'decision_id,user_id' }
    );
  if (error) return { success: false, error: error.message };

  notifyAction('decision_voted', groupId, {
    decisionId,
    decisionTitle,
    choice,
  });
  return { success: true };
}

export async function fetchArguments(decisionId: string): Promise<DecisionArgument[]> {
  const { data } = await supabase
    .from('decision_arguments')
    .select('id, decision_id, user_id, stance, text, created_at, profiles!decision_arguments_user_id_fkey(full_name)')
    .eq('decision_id', decisionId)
    .order('created_at', { ascending: true });

  return (data || []).map((a: any) => ({
    id: a.id,
    decision_id: a.decision_id,
    user_id: a.user_id,
    stance: a.stance,
    text: a.text,
    created_at: a.created_at,
    authorName: a.profiles?.full_name?.split(' ')[0] || '',
  }));
}

export async function postArgument(params: {
  decisionId: string;
  userId: string;
  groupId: string;
  stance: 'favor' | 'contra' | 'neutro';
  text: string;
  decisionTitle: string;
}): Promise<{ success: boolean; error?: string }> {
  const { error } = await supabase.from('decision_arguments').insert({
    decision_id: params.decisionId,
    user_id: params.userId,
    stance: params.stance,
    text: params.text.trim(),
  });
  if (error) return { success: false, error: error.message };

  notifyAction('decision_argument_posted', params.groupId, {
    decisionId: params.decisionId,
    decisionTitle: params.decisionTitle,
    stance: params.stance,
  });
  return { success: true };
}

/** Close a decision manually. Computes final status from votes. */
export async function closeDecision(
  decisionId: string,
  groupId: string,
  title: string
): Promise<{ success: boolean; error?: string; finalStatus?: DecisionStatus }> {
  // Count votes
  const { data: votes } = await supabase
    .from('decision_votes')
    .select('choice')
    .eq('decision_id', decisionId);

  const yes = (votes || []).filter((v: any) => v.choice === 'sim').length;
  const no = (votes || []).filter((v: any) => v.choice === 'nao').length;
  const finalStatus: DecisionStatus = yes > no ? 'aprovada' : yes < no ? 'rejeitada' : 'expirada';

  const { error } = await supabase
    .from('decisions')
    .update({ status: finalStatus, resolved_at: new Date().toISOString() })
    .eq('id', decisionId);

  if (error) return { success: false, error: error.message };

  notifyAction('decision_closed', groupId, { decisionId, title, finalStatus });
  return { success: true, finalStatus };
}
