"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { verifyGroupMembership } from "@/lib/auth-utils";
import { captureServerEvent } from "@/lib/posthog-server";
import { createNotificationWithPush } from "@/lib/push";

export async function createExpense(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const groupId = formData.get("groupId") as string;

  // Verify user belongs to this group
  const membership = await verifyGroupMembership(supabase, groupId, user.id);
  if (!membership) {
    redirect("/dashboard?error=" + encodeURIComponent("Sem permissao para este grupo."));
  }

  const childId = formData.get("childId") as string;
  const category = formData.get("category") as string;
  const description = formData.get("description") as string;
  const amount = parseFloat(formData.get("amount") as string);
  const expenseDate = formData.get("expenseDate") as string;
  const receiptUrl = formData.get("receiptUrl") as string;
  const splitRatioRaw = formData.get("splitRatio") as string;

  if (isNaN(amount) || amount <= 0 || !isFinite(amount) || amount > 999999.99) {
    redirect("/despesas/nova?error=" + encodeURIComponent("Valor invalido."));
  }

  // Verify child belongs to group if provided
  if (childId) {
    const { data: child } = await supabase
      .from("children")
      .select("id")
      .eq("id", childId)
      .eq("group_id", groupId)
      .single();
    if (!child) {
      redirect("/despesas/nova?error=" + encodeURIComponent("Crianca nao pertence a este grupo."));
    }
  }

  // Parse and validate split ratio if provided
  let splitRatio: Record<string, number> | null = null;
  if (splitRatioRaw) {
    try {
      const parsed = JSON.parse(splitRatioRaw);
      // Validate: all values must be numbers 0-100 and sum to 100
      const values = Object.values(parsed) as number[];
      const allValid = values.every((v) => typeof v === "number" && v >= 0 && v <= 100);
      const sum = values.reduce((s, v) => s + v, 0);
      if (allValid && Math.abs(sum - 100) < 0.01 && values.length >= 2) {
        splitRatio = parsed;
      }
    } catch {
      // Invalid JSON, ignore and use default
    }
  }

  const { error } = await supabase.from("expenses").insert({
    group_id: groupId,
    child_id: childId || null,
    category,
    description,
    amount,
    expense_date: expenseDate,
    paid_by: user.id,
    receipt_url: receiptUrl || null,
    split_ratio: splitRatio,
  });

  if (error) redirect("/despesas/nova?error=" + encodeURIComponent(error.message));

  captureServerEvent(user.id, "expense_created", {
    category,
    amount,
    group_id: groupId,
  });

  // Send push notification to other group members
  try {
    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name")
      .eq("id", user.id)
      .single();
    const senderName = profile?.full_name?.split(" ")[0] || "Alguem";

    const { data: otherMembers } = await supabase
      .from("group_members")
      .select("user_id")
      .eq("group_id", groupId)
      .neq("user_id", user.id);

    if (otherMembers) {
      await Promise.allSettled(
        otherMembers.map((m) =>
          createNotificationWithPush(
            m.user_id,
            "expense_created",
            "Nova Despesa",
            `${senderName} registrou uma despesa de R$ ${amount.toFixed(2)} — ${description}`,
            "/despesas"
          )
        )
      );
    }
  } catch {
    // Push failure should never break the flow
  }

  redirect("/despesas?success=" + encodeURIComponent("Despesa registrada com sucesso."));
}

export async function updateExpenseStatus(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const expenseId = formData.get("expenseId") as string;
  const status = formData.get("status") as string;
  const rejectionReason = formData.get("rejectionReason") as string;

  // Validate status value
  const validStatuses = ["approved", "rejected", "pending"];
  if (!validStatuses.includes(status)) {
    redirect("/despesas?error=" + encodeURIComponent("Status invalido."));
  }

  // Fetch the expense to verify authorization
  const { data: expense } = await supabase
    .from("expenses")
    .select("group_id, paid_by, description, amount")
    .eq("id", expenseId)
    .single();

  if (!expense) {
    redirect("/despesas?error=" + encodeURIComponent("Despesa nao encontrada."));
  }

  // Verify user belongs to the expense's group
  const membership = await verifyGroupMembership(supabase, expense.group_id, user.id);
  if (!membership) {
    redirect("/dashboard?error=" + encodeURIComponent("Sem permissao para este grupo."));
  }

  // Cannot approve your own expense
  if (status === "approved" && expense.paid_by === user.id) {
    redirect("/despesas?error=" + encodeURIComponent("Voce nao pode aprovar sua propria despesa."));
  }

  // Use correct fields based on status
  const updateData: Record<string, unknown> = { status };
  if (status === "approved") {
    updateData.approved_by = user.id;
    updateData.approved_at = new Date().toISOString();
  } else if (status === "rejected") {
    updateData.approved_by = null;
    updateData.approved_at = null;
    updateData.rejection_reason = rejectionReason || null;
  }

  const { error } = await supabase
    .from("expenses")
    .update(updateData)
    .eq("id", expenseId);

  if (error) redirect("/despesas?error=" + encodeURIComponent(error.message));

  // Send push notification to the expense creator about status change
  try {
    if (expense.paid_by !== user.id) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("id", user.id)
        .single();
      const reviewerName = profile?.full_name?.split(" ")[0] || "Alguem";

      if (status === "approved") {
        await createNotificationWithPush(
          expense.paid_by,
          "expense_approved",
          "Despesa Aprovada ✅",
          `${reviewerName} aprovou sua despesa de R$ ${Number(expense.amount).toFixed(2)} — ${expense.description}`,
          "/despesas"
        );
      } else if (status === "rejected") {
        const reasonText = rejectionReason ? ` Motivo: ${rejectionReason}` : "";
        await createNotificationWithPush(
          expense.paid_by,
          "expense_rejected",
          "Despesa Rejeitada ❌",
          `${reviewerName} rejeitou sua despesa de R$ ${Number(expense.amount).toFixed(2)} — ${expense.description}.${reasonText}`,
          "/despesas"
        );
      }
    }
  } catch {
    // Push failure should never break the flow
  }

  redirect("/despesas");
}

export async function deleteExpense(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const expenseId = formData.get("expenseId") as string;

  // Fetch the expense to verify ownership and status
  const { data: expense } = await supabase
    .from("expenses")
    .select("group_id, paid_by, status")
    .eq("id", expenseId)
    .single();

  if (!expense) {
    redirect("/despesas?error=" + encodeURIComponent("Despesa nao encontrada."));
  }

  // Only the creator can delete
  if (expense.paid_by !== user.id) {
    redirect("/despesas?error=" + encodeURIComponent("Apenas quem criou pode excluir a despesa."));
  }

  // Can only delete if not yet approved
  if (expense.status === "approved") {
    redirect("/despesas?error=" + encodeURIComponent("Despesas aprovadas nao podem ser excluidas."));
  }

  // Verify user belongs to the expense's group
  const membership = await verifyGroupMembership(supabase, expense.group_id, user.id);
  if (!membership) {
    redirect("/dashboard?error=" + encodeURIComponent("Sem permissao para este grupo."));
  }

  const { error } = await supabase
    .from("expenses")
    .delete()
    .eq("id", expenseId);

  if (error) redirect("/despesas?error=" + encodeURIComponent(error.message));
  redirect("/despesas?success=" + encodeURIComponent("Despesa excluida com sucesso."));
}
