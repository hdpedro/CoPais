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
import { apiFetch } from '../lib/api-fetch';
import { safeWrite } from './offline';
import { notifyAction } from './notify';

export type DecisionStatus = 'aberta' | 'aprovada' | 'rejeitada' | 'expirada';
export type DecisionCategory = 'escola' | 'saude' | 'atividade' | 'viagem' | 'financeiro' | 'moradia' | 'outro';
// Canonical vote values (matches `decision_votes.vote` column + PWA action).
// Wave H: native previously used `sim/nao/abster` against a non-existent
// `choice` column — silently dropping every vote. Now aligned.
export type VoteChoice = 'concordo' | 'discordo' | 'abstencao';
// Legacy values used by older builds; map to canonical before send.
export type LegacyVoteChoice = 'sim' | 'nao' | 'abster';
const LEGACY_TO_CANONICAL: Record<LegacyVoteChoice, VoteChoice> = {
  sim: 'concordo',
  nao: 'discordo',
  abster: 'abstencao',
};

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

/**
 * 2026-05-18: corrigido mismatch com schema do banco.
 * - DB: `decision_arguments.argument_type` com CHECK (pro|contra). Doc:
 *   pg_constraint `decision_arguments_argument_type_check`.
 * - PWA: usa `argument_type` correto.
 * - Native (versão anterior): usava `stance` + valores `favor|contra|neutro`.
 *   Causava "Could not find the 'stance' column" no PostgREST schema cache.
 * Fix: alinhar native ao schema canônico. Botão "Neutro" removido do
 * composer (não suportado pelo DB; PWA também não tem).
 */
export interface DecisionArgument {
  id: string;
  decision_id: string;
  user_id: string;
  authorName: string;
  argument_type: 'pro' | 'contra';
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

  // Bulk fetch votes + member count in parallel.
  // Wave H: column is `vote` (not `choice`). Values are concordo/discordo/abstencao.
  const [votesResp, membersResp] = await Promise.all([
    supabase
      .from('decision_votes')
      .select('decision_id, user_id, vote')
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
        ? (votes.find((v: any) => v.decision_id === d.id && v.user_id === userId)?.vote as VoteChoice | undefined) ?? null
        : null;
    const decVotes = votes.filter((v: any) => v.decision_id === d.id);
    const yesCount = decVotes.filter((v: any) => v.vote === 'concordo').length;
    const noCount = decVotes.filter((v: any) => v.vote === 'discordo').length;
    const abstainCount = decVotes.filter((v: any) => v.vote === 'abstencao').length;
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

// Consolidação 13/jun: create/argument/close roteiam pela API consolidada
// (services/decisions.ts) em vez de safeWrite/insert cru. O servidor faz o
// membership gate, as notificações (push + chat) e — no close — a regra de
// resolução ÚNICA (antes duplicada aqui, risco de drift). createDecision não
// notifica mais localmente (servidor já faz via notifyDecisionCreated).
export async function createDecision(params: {
  groupId: string;
  title: string;
  description?: string;
  category?: DecisionCategory;
  deadline?: string;
  createdBy: string;
}): Promise<{ success: boolean; error?: string }> {
  try {
    const r = await apiFetch('/api/decisions', {
      method: 'POST',
      body: {
        groupId: params.groupId,
        title: params.title.trim(),
        description: params.description?.trim() || null,
        category: params.category || 'outro',
        deadline: params.deadline || null,
      },
    });
    return { success: r.ok, error: r.error };
  } catch {
    return { success: false, error: 'Falha de conexão.' };
  }
}

/** Cast or update my vote. Upserts so repeated calls change the choice instead of erroring. */
export async function voteOnDecision(
  decisionId: string,
  _userId: string,
  groupId: string,
  choice: VoteChoice | LegacyVoteChoice,
  decisionTitle: string
): Promise<{ success: boolean; error?: string; resolved?: boolean; status?: string }> {
  // Wave H: server enforces canonical column name (`vote`) + auto-resolve
  // logic + push notifications. Map legacy `sim/nao/abster` UI to canonical
  // values transparently for older builds still on the old enum.
  const canonical = (LEGACY_TO_CANONICAL as Record<string, VoteChoice>)[choice] ?? (choice as VoteChoice);
  const r = await apiFetch<{ success: boolean; resolved: boolean; status: string }>(
    '/api/decisions/vote',
    {
      method: 'POST',
      body: { decisionId, vote: canonical },
    },
  );
  if (!r.ok || !r.data) return { success: false, error: r.error };

  notifyAction('decision_voted', groupId, {
    decisionId,
    decisionTitle,
    choice: canonical,
  });
  return {
    success: true,
    resolved: r.data.resolved,
    status: r.data.status,
  };
}

export async function fetchArguments(decisionId: string): Promise<DecisionArgument[]> {
  const { data } = await supabase
    .from('decision_arguments')
    .select('id, decision_id, user_id, argument_type, text, created_at, profiles!decision_arguments_user_id_fkey(full_name)')
    .eq('decision_id', decisionId)
    .order('created_at', { ascending: true });

  return (data || []).map((a: any) => ({
    id: a.id,
    decision_id: a.decision_id,
    user_id: a.user_id,
    argument_type: a.argument_type,
    text: a.text,
    created_at: a.created_at,
    authorName: a.profiles?.full_name?.split(' ')[0] || '',
  }));
}

export async function postArgument(params: {
  decisionId: string;
  userId: string;
  groupId: string;
  argumentType: 'pro' | 'contra';
  text: string;
  decisionTitle: string;
}): Promise<{ success: boolean; error?: string }> {
  try {
    const r = await apiFetch('/api/decisions/arguments', {
      method: 'POST',
      body: {
        decisionId: params.decisionId,
        argumentType: params.argumentType,
        text: params.text.trim(),
      },
    });
    if (!r.ok) return { success: false, error: r.error };
    // Servidor (addArgument) não notifica argumento → mantém o push local.
    notifyAction('decision_argument_posted', params.groupId, {
      decisionId: params.decisionId,
      decisionTitle: params.decisionTitle,
      argumentType: params.argumentType,
    });
    return { success: true };
  } catch {
    return { success: false, error: 'Falha de conexão.' };
  }
}

/**
 * Close a decision manually. Wave H: counts votes from the canonical
 * `vote` column (concordo/discordo/abstencao) — was reading non-existent
 * `choice` column with `sim/nao` values.
 *
 * Resolution rules align with PWA `voteOnDecision` auto-resolve:
 *   - Any `discordo` → rejeitada
 *   - All voters `concordo` → aprovada
 *   - Otherwise → expirada (manual close before quorum)
 */
export async function closeDecision(
  decisionId: string,
  _groupId: string,
  _title: string,
): Promise<{ success: boolean; error?: string; finalStatus?: DecisionStatus }> {
  // Regra de resolução + notificações vivem no servidor (closeDecision do
  // service) — não mais duplicadas aqui. _groupId/_title ficam na assinatura
  // por compat de callers.
  try {
    const r = await apiFetch<{ success: boolean; status: string }>('/api/decisions', {
      method: 'PATCH',
      body: { decisionId },
    });
    if (!r.ok || !r.data) return { success: false, error: r.error };
    return { success: true, finalStatus: r.data.status as DecisionStatus };
  } catch {
    return { success: false, error: 'Falha de conexão.' };
  }
}
