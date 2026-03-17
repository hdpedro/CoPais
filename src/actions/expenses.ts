"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function createExpense(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const groupId = formData.get("groupId") as string;
  const childId = formData.get("childId") as string;
  const category = formData.get("category") as string;
  const description = formData.get("description") as string;
  const amount = parseFloat(formData.get("amount") as string);
  const expenseDate = formData.get("expenseDate") as string;
  const receiptUrl = formData.get("receiptUrl") as string;

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

  const { error } = await supabase
    .from("expenses")
    .update({
      status,
      approved_by: user.id,
      approved_at: new Date().toISOString(),
    })
    .eq("id", expenseId);

  if (error) redirect("/despesas?error=" + encodeURIComponent(error.message));
  redirect("/despesas");
}
