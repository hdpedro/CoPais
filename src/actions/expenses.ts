"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { verifyGroupMembership } from "@/lib/auth-utils";

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

  if (isNaN(amount) || amount <= 0) {
    redirect("/despesas/nova?error=" + encodeURIComponent("Valor invalido."));
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
  });

  if (error) redirect("/despesas/nova?error=" + encodeURIComponent(error.message));
  redirect("/despesas");
}

export async function updateExpenseStatus(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const expenseId = formData.get("expenseId") as string;
  const status = formData.get("status") as string;

  // Validate status value
  const validStatuses = ["approved", "rejected", "pending"];
  if (!validStatuses.includes(status)) {
    redirect("/despesas?error=" + encodeURIComponent("Status invalido."));
  }

  // Fetch the expense to verify authorization
  const { data: expense } = await supabase
    .from("expenses")
    .select("group_id")
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

  // Use correct fields based on status
  const updateData: Record<string, unknown> = { status };
  if (status === "approved") {
    updateData.approved_by = user.id;
    updateData.approved_at = new Date().toISOString();
  } else if (status === "rejected") {
    updateData.approved_by = null;
    updateData.approved_at = null;
  }

  const { error } = await supabase
    .from("expenses")
    .update(updateData)
    .eq("id", expenseId);

  if (error) redirect("/despesas?error=" + encodeURIComponent(error.message));
  redirect("/despesas");
}
