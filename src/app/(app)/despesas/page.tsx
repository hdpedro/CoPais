import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getActiveGroup } from "@/lib/group-utils";
import { getDisplayName } from "@/lib/constants";
import ExpensesClient from "./ExpensesClient";

export default async function ExpensesPage({ searchParams }: { searchParams: Promise<{ success?: string; error?: string }> }) {
  const params = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const activeGroup = await getActiveGroup(supabase, user.id);
  if (!activeGroup) redirect("/onboarding");
  const { groupId, isReadonly } = activeGroup;

  const { data: expenses } = await supabase
    .from("expenses")
    .select("id, description, amount, expense_date, category, paid_by, child_id, status, split_type, split_value, receipt_url, rejection_reason, profiles!expenses_paid_by_fkey(full_name), children(full_name)")
    .eq("group_id", groupId)
    .order("expense_date", { ascending: false })
    .limit(200);

  // Calculate totals (exclude rejected from total)
  const approvedAndPending = expenses?.filter(e => e.status !== "rejected") || [];
  const total = approvedAndPending.reduce((sum, e) => sum + Number(e.amount), 0);
  const pending = expenses?.filter(e => e.status === "pending").length || 0;
  const rejected = expenses?.filter(e => e.status === "rejected").length || 0;

  const serializedExpenses = (expenses || []).map((e) => ({
    id: e.id,
    description: e.description,
    amount: Number(e.amount),
    category: e.category,
    status: e.status,
    expense_date: e.expense_date,
    paid_by: e.paid_by,
    receipt_url: e.receipt_url || null,
    rejection_reason: (e as unknown as { rejection_reason: string | null }).rejection_reason || null,
    paid_by_name: getDisplayName((e.profiles as unknown as { full_name: string | null } | null)?.full_name),
    child_name: (e.children as unknown as { full_name: string } | null)?.full_name || null,
  }));

  return (
    <ExpensesClient
      expenses={serializedExpenses}
      total={total}
      pending={pending}
      rejected={rejected}
      isReadonly={isReadonly}
      currentUserId={user.id}
      successMessage={params.success ? decodeURIComponent(params.success) : undefined}
      errorMessage={params.error ? decodeURIComponent(params.error) : undefined}
    />
  );
}
