/**
 * Settlements service — pagamentos entre coparents.
 *
 * Wave G migration: writes go via `/api/settlements` (single source of
 * truth). The cálculo de saldo aconteçe server-side, evitando que a
 * lógica fique fora de sincronia entre PWA e native. Reads ainda vão
 * direto ao Supabase (RLS já cobre).
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
import { supabase } from '../lib/supabase';
import { apiFetch } from '../lib/api-fetch';

export interface Settlement {
  id: string;
  group_id: string;
  paid_by: string;
  paid_to: string;
  amount: number;
  payment_method: string | null;
  reference_note: string | null;
  status: 'pending' | 'confirmed' | 'rejected';
  settlement_date: string;
  confirmed_at: string | null;
  created_at: string;
  paidByName?: string;
  paidToName?: string;
}

/**
 * Compute how much `userId` owes `otherUserId` in the given group.
 * Reads-only — algorithm matches the server but no mutation happens here.
 * Used by the UI to display preview balances before submit.
 */
export async function computeBalanceOwed(
  groupId: string,
  userId: string,
  otherUserId: string,
): Promise<number> {
  const [{ data: approved }, { data: confirmed }] = await Promise.all([
    supabase
      .from('expenses')
      .select('amount, paid_by, split_ratio')
      .eq('group_id', groupId)
      .eq('status', 'approved'),
    supabase
      .from('settlements')
      .select('amount, paid_by, paid_to, status')
      .eq('group_id', groupId)
      .eq('status', 'confirmed'),
  ]);

  let userShouldPay = 0;
  let userActuallyPaid = 0;
  (approved || []).forEach((e: any) => {
    const split = e.split_ratio as Record<string, number> | null;
    const userShare = split && split[userId] !== undefined
      ? (split[userId] / 100) * Number(e.amount)
      : Number(e.amount) / 2;
    userShouldPay += userShare;
    if (e.paid_by === userId) {
      userActuallyPaid += Number(e.amount);
    }
  });

  let adjust = 0;
  (confirmed || []).forEach((s: any) => {
    if (s.paid_by === userId && s.paid_to === otherUserId) adjust += Number(s.amount);
    else if (s.paid_by === otherUserId && s.paid_to === userId) adjust -= Number(s.amount);
  });

  return Math.round((userShouldPay - userActuallyPaid + adjust) * 100) / 100;
}

export async function createSettlement(params: {
  groupId: string;
  paidBy: string;
  paidTo: string;
  amount: number;
  paymentMethod?: string;
  referenceNote?: string;
  settlementDate?: string;
}): Promise<{ success: boolean; error?: string }> {
  // Server enforces validation, balance check, role gate, push notification.
  const r = await apiFetch<{ success: boolean; id: string }>('/api/settlements', {
    method: 'POST',
    body: {
      groupId: params.groupId,
      paidTo: params.paidTo,
      amount: params.amount,
      paymentMethod: params.paymentMethod,
      referenceNote: params.referenceNote,
      settlementDate: params.settlementDate,
    },
  });
  return r.ok ? { success: true } : { success: false, error: r.error };
}

export async function confirmSettlement(
  settlementId: string,
): Promise<{ success: boolean; error?: string }> {
  const r = await apiFetch<{ success: boolean }>('/api/settlements', {
    method: 'PATCH',
    body: { settlementId },
  });
  return r.ok ? { success: true } : { success: false, error: r.error };
}

export async function listSettlements(groupId: string, limit = 50): Promise<Settlement[]> {
  const { data } = await supabase
    .from('settlements')
    .select(`
      id, group_id, paid_by, paid_to, amount, payment_method, reference_note,
      status, settlement_date, confirmed_at, created_at,
      paid_by_profile:profiles!settlements_paid_by_fkey(full_name),
      paid_to_profile:profiles!settlements_paid_to_fkey(full_name)
    `)
    .eq('group_id', groupId)
    .order('settlement_date', { ascending: false })
    .limit(limit);

  return (data || []).map((s: any) => ({
    ...s,
    paidByName: s.paid_by_profile?.full_name?.split(' ')[0] ?? '',
    paidToName: s.paid_to_profile?.full_name?.split(' ')[0] ?? '',
  }));
}
