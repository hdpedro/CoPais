/* ------------------------------------------------------------------ */
/* services/expenses.ts                                                */
/* Single source of truth for expense create/update/delete.            */
/* Called by:                                                          */
/*   - src/actions/expenses.ts (PWA, RLS client; handles file upload   */
/*     before calling the service)                                     */
/*   - src/lib/ai/tools.ts:create_expense (Assistant + WhatsApp,       */
/*     admin client; receipt path comes from `media.ts:processReceiptImage`)*/
/*                                                                     */
/* Native (kindar-native/src/services/expenses.ts) currently writes    */
/* directly via safeWrite for offline support — this divergence is     */
/* tracked in `.claude/CLAUDE.md`.                                     */
/* ------------------------------------------------------------------ */

import "server-only";
import { SupabaseClient } from "@supabase/supabase-js";
import { createNotificationWithPush } from "@/lib/push";
import { postChatNotification } from "@/lib/chat-notify";
import { captureServerEvent } from "@/lib/posthog-server";
import { notifyGroupViaWhatsApp } from "@/lib/whatsapp/notify";
import { notifyCollabCreate, type CollabPriority } from "@/lib/services/collab";
import { logExpenseHistory, type ExpenseSnapshot } from "@/lib/services/expense-history";
import { formatBRL } from "@/lib/format/currency";

export type ExpenseCategory =
  | "education"
  | "health"
  | "food"
  | "clothing"
  | "leisure"
  | "transport"
  | "housing"
  | "sport"
  | "art"
  | "music"
  | "therapy"
  | "school"
  | "course"
  | "other";

export interface CreateExpenseInput {
  groupId: string;
  paidBy: string;
  description: string;
  amount: number;
  category: ExpenseCategory | string;
  expenseDate: string; // YYYY-MM-DD
  childId?: string | null;
  splitRatio?: Record<string, number> | null;
  receiptUrl?: string | null;
  /** Collab priority — drives push urgency + UI emphasis. Default 'info'. */
  priority?: CollabPriority;
  /** Caller channel — used to tailor the broadcast message. */
  origin?: "pwa" | "native" | "whatsapp" | "assistant";
  /** Display name of the actor — used for the coparent push title.
   *  Optional; falls back to a generic message if not provided. */
  actorDisplayName?: string | null;
}

export interface EditExpenseInput {
  expenseId: string;
  actorId: string; // deve ser o criador (paid_by)
  patch: {
    description?: string;
    amount?: number;
    category?: ExpenseCategory | string;
    expenseDate?: string;
    childId?: string | null;
    priority?: CollabPriority;
  };
  /** Display name pro push de re-aprovação quando status volta a pending. */
  actorDisplayName?: string | null;
}

export interface CancelExpenseInput {
  expenseId: string;
  actorId: string; // criador
  /** Motivo obrigatório — vira reason no audit + corpo do push pro reviewer. */
  reason: string;
  actorDisplayName?: string | null;
}

export interface RespondCancelInput {
  expenseId: string;
  reviewerId: string; // NÃO pode ser o criador
  approved: boolean; // true = cancel confirmado; false = cancel rejeitado (volta a 'approved')
  reason?: string | null; // motivo se rejeitando o cancel
}

export interface ReopenApprovalInput {
  expenseId: string;
  actorId: string; // deve ser o approved_by original
  reason: string;
}

/** Janela máxima pra reabrir uma aprovação. Decisão de produto:
 *  aprovação consciente exige finalidade; 24h é razoável pra erro humano
 *  ("aprovei sem ler") mas curto o bastante pra não virar arma. */
const REOPEN_WINDOW_MS = 24 * 60 * 60 * 1000;

export interface UpdateExpenseStatusInput {
  expenseId: string;
  reviewerId: string;
  status: "approved" | "rejected" | "pending";
  rejectionReason?: string | null;
}

export interface DeleteExpenseInput {
  expenseId: string;
  requesterId: string;
}

export type ServiceResult<T = Record<string, unknown>> =
  | { ok: true; data: T }
  | { ok: false; error: string; status: number };

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_AMOUNT = 999_999.99;

/* ------------------------------------------------------------------ */
/* Build default split ratio                                           */
/* ------------------------------------------------------------------ */

async function buildDefaultSplitRatio(
  supabase: SupabaseClient,
  groupId: string,
): Promise<Record<string, number>> {
  const { data: members } = await supabase
    .from("group_members")
    .select("user_id")
    .eq("group_id", groupId);
  const userIds = (members || []).map((m) => m.user_id as string);
  if (userIds.length === 0) return {};
  const ratio: Record<string, number> = {};
  const share = Math.floor(100 / userIds.length);
  userIds.forEach((id, i) => {
    ratio[id] = i === userIds.length - 1 ? 100 - share * (userIds.length - 1) : share;
  });
  return ratio;
}

/* ------------------------------------------------------------------ */
/* Validate split ratio                                                */
/* ------------------------------------------------------------------ */

function validateSplitRatio(
  raw: Record<string, number> | null | undefined,
): Record<string, number> | null {
  if (!raw) return null;
  const values = Object.values(raw);
  if (values.length < 2) return null;
  const allValid = values.every((v) => typeof v === "number" && v >= 0 && v <= 100);
  if (!allValid) return null;
  const sum = values.reduce((s, v) => s + v, 0);
  if (Math.abs(sum - 100) > 0.01) return null;
  return raw;
}

/* ------------------------------------------------------------------ */
/* Verify membership (with optional child gate)                        */
/* ------------------------------------------------------------------ */

async function verifyMembership(
  supabase: SupabaseClient,
  groupId: string,
  userId: string,
): Promise<boolean> {
  const { data } = await supabase
    .from("group_members")
    .select("user_id")
    .eq("group_id", groupId)
    .eq("user_id", userId)
    .maybeSingle();
  return !!data;
}

async function verifyChildBelongsToGroup(
  supabase: SupabaseClient,
  childId: string,
  groupId: string,
): Promise<boolean> {
  const { data } = await supabase
    .from("children")
    .select("id")
    .eq("id", childId)
    .eq("group_id", groupId)
    .maybeSingle();
  return !!data;
}

/* ------------------------------------------------------------------ */
/* Create expense                                                      */
/* ------------------------------------------------------------------ */

export async function createExpense(
  supabase: SupabaseClient,
  input: CreateExpenseInput,
): Promise<ServiceResult<{ id: string }>> {
  const {
    groupId,
    paidBy,
    description: rawDescription,
    amount,
    category,
    expenseDate,
    childId = null,
    splitRatio: rawSplitRatio = null,
    receiptUrl = null,
    origin = "pwa",
  } = input;

  const description = rawDescription?.trim();
  if (!groupId || !paidBy || !description) {
    return { ok: false, error: "Parâmetros obrigatórios ausentes.", status: 400 };
  }
  if (!Number.isFinite(amount) || amount <= 0 || amount > MAX_AMOUNT) {
    return { ok: false, error: "Valor invalido.", status: 400 };
  }
  if (!expenseDate || !ISO_DATE.test(expenseDate)) {
    return { ok: false, error: "Data invalida (YYYY-MM-DD).", status: 400 };
  }

  const isMember = await verifyMembership(supabase, groupId, paidBy);
  if (!isMember) {
    return { ok: false, error: "Sem permissao para este grupo.", status: 403 };
  }

  if (childId) {
    const childOk = await verifyChildBelongsToGroup(supabase, childId, groupId);
    if (!childOk) {
      return { ok: false, error: "Crianca nao pertence a este grupo.", status: 400 };
    }
  }

  let splitRatio = validateSplitRatio(rawSplitRatio);
  if (!splitRatio) {
    splitRatio = await buildDefaultSplitRatio(supabase, groupId);
  }

  const priority: CollabPriority = input.priority || "info";
  const safeDescription = description.slice(0, 200);

  const { data: inserted, error } = await supabase
    .from("expenses")
    .insert({
      group_id: groupId,
      child_id: childId,
      category: category || "other",
      description: safeDescription,
      amount,
      expense_date: expenseDate,
      paid_by: paidBy,
      receipt_url: receiptUrl,
      split_ratio: splitRatio,
      status: "pending",
      priority,
    })
    .select("id")
    .single();

  if (error || !inserted) {
    return { ok: false, error: error?.message || "Falha ao registrar despesa.", status: 400 };
  }

  const expenseId = inserted.id as string;

  captureServerEvent(paidBy, "expense_created", {
    category,
    amount,
    group_id: groupId,
    origin,
    priority,
  });

  // Audit trail — snapshot do estado inicial. Fire-and-forget.
  void logExpenseHistory({
    supabase,
    expenseId,
    actorId: paidBy,
    action: "created",
    after: {
      description: safeDescription,
      amount,
      category: category || "other",
      expense_date: expenseDate,
      child_id: childId ?? null,
      priority,
    },
  });

  // Collab notify (push coalescing + read tracking + analytics).
  // Chat + WhatsApp continuam via helper legado (canais separados).
  const actorName = input.actorDisplayName?.trim() || "Um responsável";
  void notifyCollabCreate({
    recordType: "expense",
    recordId: expenseId,
    groupId,
    actorUserId: paidBy,
    priority,
    title: `${actorName} registrou uma despesa`,
    message: `${safeDescription} — ${formatBRL(amount)}`,
    link: `/despesas?highlight=${expenseId}`,
  });

  // Fire-and-forget broadcast em chat + WhatsApp (canais paralelos ao push).
  void sendExpenseCreatedNotifications({
    supabase,
    groupId,
    paidBy,
    description: safeDescription,
    amount,
  }).catch(() => {
    // already swallowed inside helper
  });

  return { ok: true, data: { id: expenseId } };
}

/* ------------------------------------------------------------------ */
/* Update expense status (approve / reject)                            */
/* ------------------------------------------------------------------ */

export async function updateExpenseStatus(
  supabase: SupabaseClient,
  input: UpdateExpenseStatusInput,
): Promise<ServiceResult<{ id: string; status: string }>> {
  const { expenseId, reviewerId, status, rejectionReason = null } = input;

  if (!["approved", "rejected", "pending"].includes(status)) {
    return { ok: false, error: "Status inválido.", status: 400 };
  }

  const { data: expense } = await supabase
    .from("expenses")
    .select("id, group_id, paid_by, status, description, amount")
    .eq("id", expenseId)
    .maybeSingle();
  if (!expense) {
    return { ok: false, error: "Despesa nao encontrada.", status: 404 };
  }

  const isMember = await verifyMembership(supabase, expense.group_id, reviewerId);
  if (!isMember) {
    return { ok: false, error: "Sem permissao para este grupo.", status: 403 };
  }

  if (expense.paid_by === reviewerId && status === "approved") {
    return {
      ok: false,
      error: "Voce nao pode aprovar sua propria despesa.",
      status: 403,
    };
  }

  const currentStatus = expense.status as string;
  if (
    (currentStatus === "approved" || currentStatus === "rejected") &&
    status === "pending"
  ) {
    return {
      ok: false,
      error:
        "Nao e possivel reverter uma despesa ja aprovada ou rejeitada para pendente.",
      status: 400,
    };
  }

  const nowIso = new Date().toISOString();
  const updateData: Record<string, unknown> = { status };
  if (status === "approved") {
    updateData.approved_by = reviewerId;
    updateData.approved_at = nowIso;
    updateData.rejected_by = null;
    updateData.rejected_at = null;
    updateData.rejection_reason = null;
  } else if (status === "rejected") {
    updateData.approved_by = null;
    updateData.approved_at = null;
    updateData.rejected_by = reviewerId;
    updateData.rejected_at = nowIso;
    updateData.rejection_reason = rejectionReason;
  }

  const { error } = await supabase
    .from("expenses")
    .update(updateData)
    .eq("id", expenseId);
  if (error) {
    return { ok: false, error: error.message, status: 400 };
  }

  // Audit trail.
  void logExpenseHistory({
    supabase,
    expenseId,
    actorId: reviewerId,
    action: status === "approved" ? "approved" : status === "rejected" ? "rejected" : "created",
    reason: status === "rejected" ? rejectionReason : null,
  });

  // Notify the creator (best-effort).
  if (expense.paid_by !== reviewerId && (status === "approved" || status === "rejected")) {
    sendExpenseStatusNotification({
      supabase,
      reviewerId,
      creatorId: expense.paid_by as string,
      description: (expense.description as string) || "Despesa",
      amount: Number(expense.amount) || 0,
      status,
      rejectionReason,
    }).catch(() => {});
  }

  return { ok: true, data: { id: expenseId, status } };
}

/* ------------------------------------------------------------------ */
/* Delete expense                                                      */
/* ------------------------------------------------------------------ */

export async function deleteExpense(
  supabase: SupabaseClient,
  input: DeleteExpenseInput,
): Promise<ServiceResult<{ id: string }>> {
  const { expenseId, requesterId } = input;

  const { data: expense } = await supabase
    .from("expenses")
    .select("id, group_id, paid_by, status")
    .eq("id", expenseId)
    .maybeSingle();
  if (!expense) {
    return { ok: false, error: "Despesa nao encontrada.", status: 404 };
  }

  if (expense.paid_by !== requesterId) {
    return {
      ok: false,
      error: "Apenas quem criou pode excluir a despesa.",
      status: 403,
    };
  }
  if (expense.status === "approved") {
    return {
      ok: false,
      error: "Despesas aprovadas nao podem ser excluidas.",
      status: 400,
    };
  }

  const isMember = await verifyMembership(supabase, expense.group_id, requesterId);
  if (!isMember) {
    return { ok: false, error: "Sem permissao para este grupo.", status: 403 };
  }

  const { error } = await supabase.from("expenses").delete().eq("id", expenseId);
  if (error) return { ok: false, error: error.message, status: 400 };
  return { ok: true, data: { id: expenseId } };
}

/* ------------------------------------------------------------------ */
/* Internal: create-time notifications                                 */
/* ------------------------------------------------------------------ */

async function sendExpenseCreatedNotifications(args: {
  supabase: SupabaseClient;
  groupId: string;
  paidBy: string;
  description: string;
  amount: number;
}): Promise<void> {
  // NOTA: push + notificação in-app são responsabilidade do
  // `notifyCollabCreate` (chamado em createExpense). Aqui só fazemos
  // broadcast em chat + WhatsApp (canais paralelos sem dedup com push).
  try {
    const { data: profile } = await args.supabase
      .from("profiles")
      .select("full_name")
      .eq("id", args.paidBy)
      .single();
    const senderName = profile?.full_name?.split(" ")[0] || "Alguém";

    await postChatNotification(
      args.supabase,
      args.groupId,
      args.paidBy,
      `💰 Nova despesa: ${args.description} — ${formatBRL(args.amount)}`,
    );

    await notifyGroupViaWhatsApp(
      args.groupId,
      args.paidBy,
      `💰 *Nova despesa registrada*\n\n${senderName} registrou: ${args.description}\nValor: ${formatBRL(args.amount)}\n\nAcesse kindar.com.br/despesas para ver detalhes.`,
      "expense",
    );
  } catch (err) {
    console.error(
      "[SVC-EXPENSES] notify create error:",
      err instanceof Error ? err.message : err,
    );
  }
}

async function sendExpenseStatusNotification(args: {
  supabase: SupabaseClient;
  reviewerId: string;
  creatorId: string;
  description: string;
  amount: number;
  status: "approved" | "rejected";
  rejectionReason: string | null;
}): Promise<void> {
  try {
    const { data: profile } = await args.supabase
      .from("profiles")
      .select("full_name")
      .eq("id", args.reviewerId)
      .single();
    const reviewerName = profile?.full_name?.split(" ")[0] || "Alguém";

    if (args.status === "approved") {
      await createNotificationWithPush(
        args.creatorId,
        "expense_approved",
        "Despesa Aprovada ✅",
        `${reviewerName} aprovou sua despesa de ${formatBRL(args.amount)} — ${args.description}`,
        "/despesas",
      );
    } else {
      const reasonText = args.rejectionReason ? ` Motivo: ${args.rejectionReason}` : "";
      await createNotificationWithPush(
        args.creatorId,
        "expense_rejected",
        "Despesa Rejeitada ❌",
        `${reviewerName} rejeitou sua despesa de ${formatBRL(args.amount)} — ${args.description}.${reasonText}`,
        "/despesas",
      );
    }
  } catch (err) {
    console.error(
      "[SVC-EXPENSES] notify status error:",
      err instanceof Error ? err.message : err,
    );
  }
}

/* ------------------------------------------------------------------ */
/* Edit expense — pending edita livre; approved volta a pending        */
/* ------------------------------------------------------------------ */

/**
 * Edita uma despesa existente. Regras de segurança:
 *
 * - SÓ o criador (paid_by) pode editar — outras pessoas tentando vão
 *   receber 403 (validado server-side, não confiamos no client).
 * - Status `pending` ou `rejected`: edita livre. Rejected vira pending
 *   de novo (re-submeter ao reviewer).
 * - Status `approved`: edita REVERTE pra pending (qualquer mudança em
 *   valor/data/descrição invalida a aprovação — senão vira arma de
 *   "depois que aprovou, mudo o valor"). Aprovação anterior some.
 * - Status `cancelled` ou `cancel_pending`: BLOQUEADO. Despesa
 *   cancelada é congelada; restaurar é uma ação separada (não impl).
 *
 * Audit trail sempre registra com snapshot before/after dos campos
 * editáveis. Em caso de revert de aprovação, notifica coparentes de
 * novo via `notifyCollabCreate` (push coalescing aplica normalmente).
 */
export async function editExpense(
  supabase: SupabaseClient,
  input: EditExpenseInput,
): Promise<ServiceResult<{ id: string; status: string }>> {
  const { expenseId, actorId, patch } = input;

  if (!expenseId || !actorId || !patch) {
    return { ok: false, error: "Parâmetros obrigatórios ausentes.", status: 400 };
  }

  const { data: expense } = await supabase
    .from("expenses")
    .select(
      "id, group_id, paid_by, status, description, amount, category, expense_date, child_id, priority, edit_count",
    )
    .eq("id", expenseId)
    .maybeSingle();
  if (!expense) {
    return { ok: false, error: "Despesa não encontrada.", status: 404 };
  }

  // SECURITY: só o criador pode editar.
  if (expense.paid_by !== actorId) {
    return {
      ok: false,
      error: "Apenas quem criou pode editar a despesa.",
      status: 403,
    };
  }

  const currentStatus = expense.status as string;
  if (currentStatus === "cancelled" || currentStatus === "cancel_pending") {
    return {
      ok: false,
      error: "Despesas canceladas não podem ser editadas.",
      status: 400,
    };
  }

  // Validações dos campos editáveis.
  if (patch.amount !== undefined) {
    if (!Number.isFinite(patch.amount) || patch.amount <= 0 || patch.amount > MAX_AMOUNT) {
      return { ok: false, error: "Valor inválido.", status: 400 };
    }
  }
  if (patch.expenseDate !== undefined && !ISO_DATE.test(patch.expenseDate)) {
    return { ok: false, error: "Data inválida (YYYY-MM-DD).", status: 400 };
  }
  if (patch.description !== undefined && !patch.description.trim()) {
    return { ok: false, error: "Descrição obrigatória.", status: 400 };
  }
  if (patch.childId !== undefined && patch.childId !== null) {
    const childOk = await verifyChildBelongsToGroup(supabase, patch.childId, expense.group_id as string);
    if (!childOk) {
      return { ok: false, error: "Criança não pertence a este grupo.", status: 400 };
    }
  }

  const isMember = await verifyMembership(supabase, expense.group_id as string, actorId);
  if (!isMember) {
    return { ok: false, error: "Sem permissão para este grupo.", status: 403 };
  }

  // Snapshot before pra audit.
  const before: ExpenseSnapshot = {
    description: expense.description as string,
    amount: Number(expense.amount),
    category: expense.category as string,
    expense_date: expense.expense_date as string,
    child_id: (expense.child_id as string | null) ?? null,
    priority: (expense.priority as string) || "info",
  };

  // Monta o update — só campos passados, mais reset de status + edited_at + edit_count++.
  const nowIso = new Date().toISOString();
  const update: Record<string, unknown> = {
    edited_at: nowIso,
    edit_count: (expense.edit_count as number) + 1,
  };
  const after: ExpenseSnapshot = { ...before };

  if (patch.description !== undefined) {
    const trimmed = patch.description.trim().slice(0, 200);
    update.description = trimmed;
    after.description = trimmed;
  }
  if (patch.amount !== undefined) {
    update.amount = patch.amount;
    after.amount = patch.amount;
  }
  if (patch.category !== undefined) {
    update.category = patch.category || "other";
    after.category = patch.category || "other";
  }
  if (patch.expenseDate !== undefined) {
    update.expense_date = patch.expenseDate;
    after.expense_date = patch.expenseDate;
  }
  if (patch.childId !== undefined) {
    update.child_id = patch.childId;
    after.child_id = patch.childId;
  }
  if (patch.priority !== undefined) {
    update.priority = patch.priority;
    after.priority = patch.priority;
  }

  // Revert de aprovação: qualquer edit em approved/rejected volta a pending.
  const wasTerminal = currentStatus === "approved" || currentStatus === "rejected";
  if (wasTerminal) {
    update.status = "pending";
    update.approved_by = null;
    update.approved_at = null;
    update.rejected_by = null;
    update.rejected_at = null;
    update.rejection_reason = null;
  }

  const { error } = await supabase.from("expenses").update(update).eq("id", expenseId);
  if (error) {
    return { ok: false, error: error.message, status: 400 };
  }

  // Audit log da edição.
  void logExpenseHistory({
    supabase,
    expenseId,
    actorId,
    action: "edited",
    before,
    after,
    reason: wasTerminal ? `Status revertido de '${currentStatus}' para 'pending'` : null,
  });

  captureServerEvent(actorId, "expense_edited", {
    expense_id: expenseId,
    status_was: currentStatus,
    reverted_to_pending: wasTerminal,
  });

  // Re-notify coparentes se voltou pra pending — eles precisam reanalizar.
  if (wasTerminal) {
    const actorName = input.actorDisplayName?.trim() || "Um responsável";
    const finalAmount = after.amount ?? 0;
    void notifyCollabCreate({
      recordType: "expense",
      recordId: expenseId,
      groupId: expense.group_id as string,
      actorUserId: actorId,
      priority: (after.priority as CollabPriority) || "info",
      title: `${actorName} editou uma despesa`,
      message: `${after.description} — ${formatBRL(finalAmount)} (precisa reaprovar)`,
      link: `/despesas?highlight=${expenseId}`,
    });
  }

  const finalStatus = (update.status as string) || currentStatus;
  return { ok: true, data: { id: expenseId, status: finalStatus } };
}

/* ------------------------------------------------------------------ */
/* Cancel expense — pending cancela direto; approved exige acordo      */
/* ------------------------------------------------------------------ */

/**
 * Pedido de cancelamento iniciado pelo CRIADOR. Comportamento por status:
 *
 * - `pending`: cancela direto. Status vira 'cancelled'.
 * - `rejected`: cancela direto (já estava inativa). Status vira 'cancelled'.
 * - `approved`: NÃO cancela direto. Status vira 'cancel_pending' e notifica
 *   o reviewer original — ele decide via `respondToCancelRequest`. Sem isso,
 *   um lado poderia desfazer compromissos bilaterais unilateralmente.
 * - `cancelled` / `cancel_pending`: erro (idempotência).
 *
 * Motivo é obrigatório — fica no audit + push pro reviewer.
 */
export async function requestCancelExpense(
  supabase: SupabaseClient,
  input: CancelExpenseInput,
): Promise<ServiceResult<{ id: string; status: string }>> {
  const { expenseId, actorId, reason } = input;
  if (!expenseId || !actorId) {
    return { ok: false, error: "Parâmetros obrigatórios ausentes.", status: 400 };
  }
  const trimmedReason = (reason || "").trim();
  if (!trimmedReason) {
    return { ok: false, error: "Motivo obrigatório.", status: 400 };
  }

  const { data: expense } = await supabase
    .from("expenses")
    .select("id, group_id, paid_by, status, approved_by, description, amount, priority")
    .eq("id", expenseId)
    .maybeSingle();
  if (!expense) return { ok: false, error: "Despesa não encontrada.", status: 404 };

  // SECURITY: apenas o criador inicia o cancel.
  if (expense.paid_by !== actorId) {
    return {
      ok: false,
      error: "Apenas quem criou pode cancelar a despesa.",
      status: 403,
    };
  }

  const isMember = await verifyMembership(supabase, expense.group_id as string, actorId);
  if (!isMember) {
    return { ok: false, error: "Sem permissão para este grupo.", status: 403 };
  }

  const currentStatus = expense.status as string;
  if (currentStatus === "cancelled" || currentStatus === "cancel_pending") {
    return { ok: false, error: "Despesa já cancelada ou em processo.", status: 400 };
  }

  const nowIso = new Date().toISOString();

  // Pending / rejected: cancela direto (sem precisar acordo).
  if (currentStatus === "pending" || currentStatus === "rejected") {
    const { error } = await supabase
      .from("expenses")
      .update({
        status: "cancelled",
        cancelled_by: actorId,
        cancelled_at: nowIso,
        cancel_reason: trimmedReason,
      })
      .eq("id", expenseId);
    if (error) return { ok: false, error: error.message, status: 400 };

    void logExpenseHistory({
      supabase,
      expenseId,
      actorId,
      action: "cancelled",
      reason: trimmedReason,
    });
    captureServerEvent(actorId, "expense_cancelled", {
      expense_id: expenseId,
      from_status: currentStatus,
    });
    return { ok: true, data: { id: expenseId, status: "cancelled" } };
  }

  // Approved: precisa de acordo bilateral → vira cancel_pending.
  const { error } = await supabase
    .from("expenses")
    .update({
      status: "cancel_pending",
      cancel_requested_by: actorId,
      cancel_requested_at: nowIso,
      cancel_reason: trimmedReason,
    })
    .eq("id", expenseId);
  if (error) return { ok: false, error: error.message, status: 400 };

  void logExpenseHistory({
    supabase,
    expenseId,
    actorId,
    action: "cancel_requested",
    reason: trimmedReason,
  });

  captureServerEvent(actorId, "expense_cancel_requested", {
    expense_id: expenseId,
  });

  // Notifica o reviewer original (approved_by) — push de prioridade
  // 'important' porque é uma decisão pendente que precisa de ação.
  const reviewerId = expense.approved_by as string | null;
  if (reviewerId && reviewerId !== actorId) {
    const actorName = input.actorDisplayName?.trim() || "Um responsável";
    const amount = Number(expense.amount) || 0;
    void notifyCollabCreate({
      recordType: "expense",
      recordId: expenseId,
      groupId: expense.group_id as string,
      actorUserId: actorId,
      priority: "important",
      title: `${actorName} quer cancelar uma despesa`,
      message: `${expense.description} — ${formatBRL(amount)} — motivo: ${trimmedReason}`,
      link: `/despesas?highlight=${expenseId}`,
    });
  }

  return { ok: true, data: { id: expenseId, status: "cancel_pending" } };
}

/* ------------------------------------------------------------------ */
/* Respond to cancel — reviewer aprova ou rejeita o pedido de cancel   */
/* ------------------------------------------------------------------ */

/**
 * Resposta do reviewer ao pedido de cancelamento de uma despesa aprovada.
 *
 * - `approved: true` → status vira 'cancelled', registra cancelled_by/at.
 * - `approved: false` → status volta a 'approved', limpa cancel_requested_*.
 *   Reviewer pode (e deveria) dar motivo da recusa.
 *
 * SECURITY: reviewer NÃO pode ser o criador. Só faz sentido se houver 2+
 * coparentes — em grupo de 1 pessoa o flow é create+approve+cancel pelo
 * mesmo user (improvável mas válido).
 */
export async function respondToCancelRequest(
  supabase: SupabaseClient,
  input: RespondCancelInput,
): Promise<ServiceResult<{ id: string; status: string }>> {
  const { expenseId, reviewerId, approved, reason = null } = input;
  if (!expenseId || !reviewerId) {
    return { ok: false, error: "Parâmetros obrigatórios ausentes.", status: 400 };
  }

  const { data: expense } = await supabase
    .from("expenses")
    .select("id, group_id, paid_by, status, cancel_reason, description, amount")
    .eq("id", expenseId)
    .maybeSingle();
  if (!expense) return { ok: false, error: "Despesa não encontrada.", status: 404 };

  if (expense.status !== "cancel_pending") {
    return {
      ok: false,
      error: "Despesa não está aguardando resposta de cancelamento.",
      status: 400,
    };
  }

  // SECURITY: criador não pode responder ao próprio pedido.
  if (expense.paid_by === reviewerId) {
    return {
      ok: false,
      error: "Você não pode responder ao próprio pedido de cancelamento.",
      status: 403,
    };
  }

  const isMember = await verifyMembership(supabase, expense.group_id as string, reviewerId);
  if (!isMember) {
    return { ok: false, error: "Sem permissão para este grupo.", status: 403 };
  }

  const nowIso = new Date().toISOString();
  const trimmedReason = reason?.trim() || null;

  if (approved) {
    // Cancel confirmado.
    const { error } = await supabase
      .from("expenses")
      .update({
        status: "cancelled",
        cancelled_by: reviewerId,
        cancelled_at: nowIso,
      })
      .eq("id", expenseId);
    if (error) return { ok: false, error: error.message, status: 400 };

    void logExpenseHistory({
      supabase,
      expenseId,
      actorId: reviewerId,
      action: "cancelled",
      reason: trimmedReason,
    });
    captureServerEvent(reviewerId, "expense_cancel_approved", {
      expense_id: expenseId,
    });
    return { ok: true, data: { id: expenseId, status: "cancelled" } };
  }

  // Cancel rejeitado — volta a 'approved' e limpa cancel_requested_*.
  const { error } = await supabase
    .from("expenses")
    .update({
      status: "approved",
      cancel_requested_by: null,
      cancel_requested_at: null,
      cancel_reason: null,
    })
    .eq("id", expenseId);
  if (error) return { ok: false, error: error.message, status: 400 };

  void logExpenseHistory({
    supabase,
    expenseId,
    actorId: reviewerId,
    action: "restored",
    reason: trimmedReason,
  });
  captureServerEvent(reviewerId, "expense_cancel_rejected", {
    expense_id: expenseId,
  });

  return { ok: true, data: { id: expenseId, status: "approved" } };
}

/* ------------------------------------------------------------------ */
/* Reopen approval — reviewer reabre despesa aprovada (janela 24h)     */
/* ------------------------------------------------------------------ */

/**
 * Reabre uma despesa aprovada pra reanálise. Decisão de produto:
 *
 * - SÓ o approver original pode reabrir (preserva accountability —
 *   senão qualquer admin poderia desfazer aprovações antigas).
 * - Janela rígida de 24h após approved_at. Fora disso, retorna erro
 *   explícito ("Janela de 24h expirou"). Aprovações antigas viram
 *   compromissos finais.
 * - Motivo obrigatório no audit + push pro criador.
 * - Status volta a 'pending' (criador pode re-editar ou aguardar nova
 *   aprovação).
 */
export async function reopenApproval(
  supabase: SupabaseClient,
  input: ReopenApprovalInput,
): Promise<ServiceResult<{ id: string; status: string }>> {
  const { expenseId, actorId, reason } = input;
  if (!expenseId || !actorId) {
    return { ok: false, error: "Parâmetros obrigatórios ausentes.", status: 400 };
  }
  const trimmedReason = (reason || "").trim();
  if (!trimmedReason) {
    return { ok: false, error: "Motivo obrigatório pra reabrir aprovação.", status: 400 };
  }

  const { data: expense } = await supabase
    .from("expenses")
    .select("id, group_id, paid_by, status, approved_by, approved_at, description, amount")
    .eq("id", expenseId)
    .maybeSingle();
  if (!expense) return { ok: false, error: "Despesa não encontrada.", status: 404 };

  if (expense.status !== "approved") {
    return {
      ok: false,
      error: "Só é possível reabrir despesas aprovadas.",
      status: 400,
    };
  }

  // SECURITY: só o approver original pode reabrir.
  if (expense.approved_by !== actorId) {
    return {
      ok: false,
      error: "Apenas quem aprovou pode reabrir a despesa.",
      status: 403,
    };
  }

  // Janela de 24h. Server-side é a fonte da verdade — não confiamos no client.
  const approvedAt = expense.approved_at ? new Date(expense.approved_at as string).getTime() : 0;
  if (!approvedAt || Date.now() - approvedAt > REOPEN_WINDOW_MS) {
    return {
      ok: false,
      error: "Janela de 24h pra reabrir já expirou.",
      status: 400,
    };
  }

  const { error } = await supabase
    .from("expenses")
    .update({
      status: "pending",
      approved_by: null,
      approved_at: null,
    })
    .eq("id", expenseId);
  if (error) return { ok: false, error: error.message, status: 400 };

  void logExpenseHistory({
    supabase,
    expenseId,
    actorId,
    action: "reopened",
    reason: trimmedReason,
  });

  captureServerEvent(actorId, "expense_reopened", {
    expense_id: expenseId,
  });

  // Notifica o criador.
  const creatorId = expense.paid_by as string;
  if (creatorId && creatorId !== actorId) {
    const amount = Number(expense.amount) || 0;
    void notifyCollabCreate({
      recordType: "expense",
      recordId: expenseId,
      groupId: expense.group_id as string,
      actorUserId: actorId,
      priority: "important",
      title: `Sua despesa foi reaberta pra reanálise`,
      message: `${expense.description} — ${formatBRL(amount)} — motivo: ${trimmedReason}`,
      link: `/despesas?highlight=${expenseId}`,
    });
  }

  return { ok: true, data: { id: expenseId, status: "pending" } };
}
