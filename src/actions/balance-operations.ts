"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { verifyGroupMembership } from "@/lib/auth-utils";
import { createNotificationWithPush } from "@/lib/push";
import { postChatNotification } from "@/lib/chat-notify";

const OPERATION_LABELS: Record<string, string> = {
  debit: "Débito",
  credit: "Crédito",
  waive: "Isenção",
  gift_day: "Doação de dia",
  forgive_balance: "Perdão de saldo",
  reset_balance: "Zeramento consensual",
  manual_adjustment: "Ajuste manual",
};

const OPERATION_ICONS: Record<string, string> = {
  debit: "📅",
  credit: "📅",
  waive: "🤝",
  gift_day: "🎁",
  forgive_balance: "⚖️",
  reset_balance: "🧹",
  manual_adjustment: "🔧",
};

function directionForType(
  operationType: string,
  proposerIsRequester: boolean
): string {
  switch (operationType) {
    case "debit":
      return proposerIsRequester ? "proposer_gains" : "target_gains";
    case "credit":
      return proposerIsRequester ? "target_gains" : "proposer_gains";
    case "waive":
    case "gift_day":
      return "neutral";
    case "forgive_balance":
      return "neutral";
    case "reset_balance":
      return "both_zero";
    case "manual_adjustment":
      return "neutral";
    default:
      return "neutral";
  }
}

export async function createBalanceOperation(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Nao autenticado" };

  const groupId = formData.get("groupId") as string;
  const operationType = formData.get("operationType") as string;
  const targetUserId = formData.get("targetUserId") as string;
  const days = parseInt(formData.get("days") as string) || 1;
  const notes = formData.get("notes") as string;
  const relatedDate = formData.get("relatedDate") as string;
  const swapRequestId = formData.get("swapRequestId") as string;

  if (!groupId || !operationType || !targetUserId) {
    return { error: "Dados incompletos." };
  }

  if (targetUserId === user.id) {
    return { error: "Não é possível criar operação consigo mesmo." };
  }

  const membership = await verifyGroupMembership(supabase, groupId, user.id);
  if (!membership) return { error: "Sem permissão para este grupo." };

  const targetMembership = await verifyGroupMembership(supabase, groupId, targetUserId);
  if (!targetMembership) return { error: "Usuário alvo não pertence a este grupo." };

  const direction = directionForType(operationType, true);

  const { error } = await supabase.from("custody_balance_operations").insert({
    group_id: groupId,
    operation_type: operationType,
    proposed_by: user.id,
    target_user_id: targetUserId,
    status: "pending",
    days,
    direction,
    swap_request_id: swapRequestId || null,
    related_date: relatedDate || null,
    notes: notes || null,
  });

  if (error) return { error: error.message };

  try {
    const { data: proposerProfile } = await supabase
      .from("profiles")
      .select("full_name")
      .eq("id", user.id)
      .single();

    const proposerName = proposerProfile?.full_name?.split(" ")[0] || "Alguém";
    const label = OPERATION_LABELS[operationType] || operationType;

    await createNotificationWithPush(
      targetUserId,
      "balance_proposal",
      "Proposta de Saldo",
      `${proposerName} propôs: ${label}${days > 1 ? ` (${days} dias)` : ""}`,
      "/calendario"
    );
  } catch {
    // Push failure shouldn't block
  }

  try {
    const icon = OPERATION_ICONS[operationType] || "⚖️";
    const label = OPERATION_LABELS[operationType] || operationType;
    await postChatNotification(
      supabase,
      groupId,
      user.id,
      `${icon} Proposta: ${label}${days > 1 ? ` (${days} dias)` : ""}${notes ? ` — ${notes}` : ""}`
    );
  } catch {
    // Chat failure shouldn't block
  }

  revalidatePath("/calendario");
  revalidatePath("/chat");
  return { success: true };
}

export async function respondToBalanceOperation(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Nao autenticado" };

  const operationId = formData.get("operationId") as string;
  const response = formData.get("response") as "approved" | "rejected";

  if (!operationId || !response) return { error: "Dados incompletos." };

  const { data: op } = await supabase
    .from("custody_balance_operations")
    .select("*")
    .eq("id", operationId)
    .single();

  if (!op) return { error: "Operação não encontrada." };
  if (op.target_user_id !== user.id) return { error: "Apenas o destinatário pode responder." };
  if (op.status !== "pending") return { error: "Esta operação já foi processada." };

  const { data: updated, error: updateError } = await supabase
    .from("custody_balance_operations")
    .update({
      status: response,
      responded_by: user.id,
      responded_at: new Date().toISOString(),
    })
    .eq("id", operationId)
    .eq("status", "pending")
    .select("id");

  if (updateError) return { error: updateError.message };
  if (!updated || updated.length === 0) return { error: "Operação já processada." };

  try {
    const { data: responderProfile } = await supabase
      .from("profiles")
      .select("full_name")
      .eq("id", user.id)
      .single();

    const responderName = responderProfile?.full_name?.split(" ")[0] || "Alguém";
    const label = OPERATION_LABELS[op.operation_type] || op.operation_type;
    const statusText = response === "approved" ? "aprovada" : "recusada";

    await createNotificationWithPush(
      op.proposed_by,
      "balance_response",
      response === "approved" ? "Proposta Aceita" : "Proposta Recusada",
      `${responderName} ${statusText}: ${label}`,
      "/calendario"
    );
  } catch {
    // Push failure shouldn't block
  }

  try {
    const icon = response === "approved" ? "✅" : "❌";
    const label = OPERATION_LABELS[op.operation_type] || op.operation_type;
    await postChatNotification(
      supabase,
      op.group_id,
      user.id,
      `${icon} ${label} ${response === "approved" ? "aceita" : "recusada"}`
    );
  } catch {
    // Chat failure shouldn't block
  }

  revalidatePath("/calendario");
  revalidatePath("/chat");
  return { success: true };
}
