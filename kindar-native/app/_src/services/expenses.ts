/**
 * Expenses Service — All writes use safeWrite for offline support.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */

import { supabase } from '../lib/supabase';
import { safeWrite } from './offline';
import { notifyAction } from './notify';

// Upload receipt image to 'receipts' storage bucket. Returns the storage
// path (post-migration 062 the bucket is private; reads must use
// createSignedUrl). The caller stores `path` as `expenses.receipt_url`.
export async function uploadExpenseReceipt(params: {
  uri: string; mimeType: string; groupId: string;
}): Promise<{ success: true; url: string } | { success: false; error: string }> {
  try {
    const res = await fetch(params.uri);
    const arrayBuffer = await res.arrayBuffer();
    const ext = params.mimeType.split('/')[1] || 'jpg';
    const path = `${params.groupId}/${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from('receipts').upload(path, arrayBuffer, {
      contentType: params.mimeType, upsert: false,
    });
    if (error) return { success: false, error: error.message };
    return { success: true, url: path };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Falha no upload' };
  }
}

export interface Expense {
  id: string;
  group_id: string;
  child_id: string | null;
  category: string;
  description: string;
  amount: number;
  paid_by: string;
  split_ratio: Record<string, number>;
  receipt_url: string | null;
  status: string;
  approved_by: string | null;
  expense_date: string;
  created_at: string;
  paidByName?: string;
  childName?: string;
}

export async function fetchExpenses(groupId: string, limit = 200): Promise<Expense[]> {
  const { data } = await supabase
    .from('expenses')
    .select('id, group_id, child_id, category, description, amount, paid_by, split_ratio, receipt_url, status, approved_by, expense_date, created_at, profiles!expenses_paid_by_fkey(full_name), children(full_name)')
    .eq('group_id', groupId)
    .order('expense_date', { ascending: false })
    .limit(limit);

  return (data || []).map((e: any) => ({
    ...e,
    paidByName: e.profiles?.full_name?.split(' ')[0] || '',
    childName: e.children?.full_name?.split(' ')[0] || '',
  }));
}

export async function createExpense(params: {
  groupId: string; childId?: string; category: string; description: string;
  amount: number; paidBy: string; splitRatio?: Record<string, number>;
  expenseDate: string; receiptUrl?: string | null;
}) {
  const result = await safeWrite({
    table: 'expenses',
    operation: 'insert',
    payload: {
      group_id: params.groupId, child_id: params.childId || null,
      category: params.category, description: params.description.trim(),
      amount: params.amount, paid_by: params.paidBy,
      split_ratio: params.splitRatio || { default: 50 },
      expense_date: params.expenseDate, status: 'pending',
      receipt_url: params.receiptUrl || null,
    },
  });
  if (result.success && !result.queued) {
    notifyAction('expense_created', params.groupId, {
      description: params.description, amount: params.amount, category: params.category,
    });
  }
  return result;
}

export async function approveExpense(expenseId: string, userId: string, groupId: string, description?: string) {
  const result = await safeWrite({
    table: 'expenses',
    operation: 'update',
    payload: { id: expenseId, status: 'approved', approved_by: userId },
  });
  if (result.success && !result.queued) {
    notifyAction('expense_approved', groupId, { description: description || '' });
  }
  return result;
}

export async function deleteExpense(expenseId: string) {
  return safeWrite({ table: 'expenses', operation: 'delete', payload: { id: expenseId } });
}

export async function rejectExpense(expenseId: string, userId: string, groupId: string, description?: string) {
  const result = await safeWrite({
    table: 'expenses',
    operation: 'update',
    payload: { id: expenseId, status: 'rejected', approved_by: userId },
  });
  if (result.success && !result.queued) {
    notifyAction('expense_rejected', groupId, { description: description || '' });
  }
  return result;
}

/**
 * Compute financial summary with PWA-equivalent math.
 *
 * Mirrors `src/app/(app)/financeiro/FinancialDashboard.tsx:50-152`:
 *   - For each approved expense, look up the user's share via
 *     `expense.split_ratio[userId]`. Falls back to 50/50 if not present.
 *   - `myTotal` = sum the user has spent (paid_by === userId)
 *   - `otherTotal` = sum the OTHER member spent (paid_by !== userId)
 *   - `myShouldPay` = sum of the user's share across all approved expenses
 *   - balance = (myActuallyPaid - myShouldPay) corrected by confirmed
 *     settlements (subtract what the user already paid back, add what
 *     the other member paid back).
 *
 * Positive balance ⇒ user is owed money. Negative ⇒ user owes money.
 *
 * The previous implementation ignored `split_ratio` and `settlements`
 * entirely, producing incorrect numbers for any non-50/50 split or
 * after any partial settlement.
 */
/**
 * Per-month spending breakdown for the dashboard view (Wave G).
 * Returns the total spent in the month + how much each member contributed.
 * Mirrors PWA `FinancialDashboard.tsx` `memberSpending`+`totalMonth` calc.
 */
export async function fetchMonthlySpending(
  groupId: string,
  month: number, // 0-11
  year: number,
): Promise<{ totalMonth: number; memberSpending: Record<string, number>; expensesCount: number }> {
  // Build YYYY-MM-DD bounds for the month
  const start = new Date(year, month, 1);
  const end = new Date(year, month + 1, 0);
  const fmt = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

  const { data: expenses } = await supabase
    .from('expenses')
    .select('amount, paid_by, status, expense_date')
    .eq('group_id', groupId)
    .gte('expense_date', fmt(start))
    .lte('expense_date', fmt(end))
    .neq('status', 'rejected')
    .limit(1000);

  let totalMonth = 0;
  const memberSpending: Record<string, number> = {};
  (expenses || []).forEach((e: { amount: number | string; paid_by: string }) => {
    const amount = Number(e.amount) || 0;
    totalMonth += amount;
    memberSpending[e.paid_by] = (memberSpending[e.paid_by] || 0) + amount;
  });

  return { totalMonth, memberSpending, expensesCount: expenses?.length || 0 };
}

export async function fetchFinancialSummary(groupId: string, userId: string) {
  const [{ data: expenses }, { data: settlements }] = await Promise.all([
    supabase
      .from('expenses')
      .select('amount, paid_by, status, split_ratio')
      .eq('group_id', groupId)
      .eq('status', 'approved')
      .limit(10000),
    supabase
      .from('settlements')
      .select('amount, paid_by, paid_to, status')
      .eq('group_id', groupId)
      .eq('status', 'confirmed'),
  ]);

  let myActuallyPaid = 0;
  let otherActuallyPaid = 0;
  let myShouldPay = 0;

  (expenses || []).forEach((e: any) => {
    const amount = Number(e.amount) || 0;
    const split = (e.split_ratio || {}) as Record<string, number>;
    const myShareRaw = split[userId];
    const myShare = typeof myShareRaw === 'number' ? (myShareRaw / 100) * amount : amount / 2;
    myShouldPay += myShare;

    if (e.paid_by === userId) myActuallyPaid += amount;
    else otherActuallyPaid += amount;
  });

  // Settlements: when the user paid the other → reduces what they owe.
  //              when the other paid the user → increases the user's debt.
  let settlementAdjust = 0;
  (settlements || []).forEach((s: any) => {
    const amt = Number(s.amount) || 0;
    if (s.paid_by === userId) settlementAdjust += amt;        // user paid back
    else if (s.paid_to === userId) settlementAdjust -= amt;   // user received back
  });

  // myActuallyPaid - myShouldPay = positive ⇒ the user spent more than
  // their fair share, so they are OWED money.
  const balance = Math.round((myActuallyPaid - myShouldPay + settlementAdjust) * 100) / 100;

  return {
    myTotal: myActuallyPaid,
    otherTotal: otherActuallyPaid,
    balance,
    totalMonth: myActuallyPaid + otherActuallyPaid,
  };
}
