/**
 * Expenses Service — All writes use safeWrite for offline support.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */

import { supabase } from '../lib/supabase';
import { safeWrite } from './offline';
import { notifyAction } from './notify';

// Upload receipt image to 'receipts' storage bucket. Returns public URL or null.
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
    const { data } = supabase.storage.from('receipts').getPublicUrl(path);
    return { success: true, url: data.publicUrl };
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

export async function fetchFinancialSummary(groupId: string, userId: string) {
  const { data: expenses } = await supabase
    .from('expenses')
    .select('amount, paid_by, status, split_ratio')
    .eq('group_id', groupId)
    .eq('status', 'approved')
    .limit(10000);

  let myTotal = 0;
  let otherTotal = 0;
  (expenses || []).forEach((e: any) => {
    if (e.paid_by === userId) myTotal += e.amount;
    else otherTotal += e.amount;
  });

  const balance = (myTotal - otherTotal) / 2;
  return { myTotal, otherTotal, balance, totalMonth: myTotal + otherTotal };
}
