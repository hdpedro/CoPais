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

import { SupabaseClient } from "@supabase/supabase-js";
import { createNotificationWithPush } from "@/lib/push";
import { postChatNotification } from "@/lib/chat-notify";
import { captureServerEvent } from "@/lib/posthog-server";
import { notifyGroupViaWhatsApp } from "@/lib/whatsapp/notify";

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
  /** Caller channel — used to tailor the broadcast message. */
  origin?: "pwa" | "native" | "whatsapp" | "assistant";
}

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

  const { data: inserted, error } = await supabase
    .from("expenses")
    .insert({
      group_id: groupId,
      child_id: childId,
      category: category || "other",
      description: description.slice(0, 200),
      amount,
      expense_date: expenseDate,
      paid_by: paidBy,
      receipt_url: receiptUrl,
      split_ratio: splitRatio,
      status: "pending",
    })
    .select("id")
    .single();

  if (error || !inserted) {
    return { ok: false, error: error?.message || "Falha ao registrar despesa.", status: 400 };
  }

  captureServerEvent(paidBy, "expense_created", {
    category,
    amount,
    group_id: groupId,
    origin,
  });

  // Fire-and-forget notifications (push + chat + WhatsApp).
  sendExpenseCreatedNotifications({
    supabase,
    groupId,
    paidBy,
    description,
    amount,
  }).catch(() => {
    // already swallowed inside helper
  });

  return { ok: true, data: { id: inserted.id as string } };
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

  const updateData: Record<string, unknown> = { status };
  if (status === "approved") {
    updateData.approved_by = reviewerId;
    updateData.approved_at = new Date().toISOString();
  } else if (status === "rejected") {
    updateData.approved_by = null;
    updateData.approved_at = null;
    updateData.rejection_reason = rejectionReason;
  }

  const { error } = await supabase
    .from("expenses")
    .update(updateData)
    .eq("id", expenseId);
  if (error) {
    return { ok: false, error: error.message, status: 400 };
  }

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
  try {
    const { data: profile } = await args.supabase
      .from("profiles")
      .select("full_name")
      .eq("id", args.paidBy)
      .single();
    const senderName = profile?.full_name?.split(" ")[0] || "Alguém";

    const { data: otherMembers } = await args.supabase
      .from("group_members")
      .select("user_id")
      .eq("group_id", args.groupId)
      .neq("user_id", args.paidBy);

    if (otherMembers && otherMembers.length > 0) {
      await Promise.allSettled(
        otherMembers.map((m) =>
          createNotificationWithPush(
            m.user_id as string,
            "expense_created",
            "Nova Despesa",
            `${senderName} registrou uma despesa de R$ ${args.amount.toFixed(2)} — ${args.description}`,
            "/despesas",
          ),
        ),
      );
    }

    await postChatNotification(
      args.supabase,
      args.groupId,
      args.paidBy,
      `💰 Nova despesa: ${args.description} — R$ ${args.amount.toFixed(2)}`,
    );

    await notifyGroupViaWhatsApp(
      args.groupId,
      args.paidBy,
      `💰 *Nova despesa registrada*\n\n${senderName} registrou: ${args.description}\nValor: R$ ${args.amount.toFixed(2).replace(".", ",")}\n\nAcesse kindar.com.br/despesas para ver detalhes.`,
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
        `${reviewerName} aprovou sua despesa de R$ ${args.amount.toFixed(2)} — ${args.description}`,
        "/despesas",
      );
    } else {
      const reasonText = args.rejectionReason ? ` Motivo: ${args.rejectionReason}` : "";
      await createNotificationWithPush(
        args.creatorId,
        "expense_rejected",
        "Despesa Rejeitada ❌",
        `${reviewerName} rejeitou sua despesa de R$ ${args.amount.toFixed(2)} — ${args.description}.${reasonText}`,
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
