import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getActiveGroup } from "@/lib/group-utils";
import { getDisplayName } from "@/lib/constants";
import { getSignedFileUrl } from "@/lib/storage-signed-url";
import ExpensesClient from "./ExpensesClient";

export default async function ExpensesPage({ searchParams }: { searchParams: Promise<{ success?: string; error?: string }> }) {
  const params = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const activeGroup = await getActiveGroup(supabase, user.id);
  if (!activeGroup) redirect("/onboarding");
  const { groupId, isReadonly } = activeGroup;

  // Fetch expenses with all new fields (priority, cancel tracking, approval tracking).
  const { data: expenses } = await supabase
    .from("expenses")
    .select(
      "id, description, amount, expense_date, category, paid_by, child_id, status, priority, split_ratio, receipt_url, rejection_reason, approved_by, approved_at, rejected_by, rejected_at, cancel_requested_by, cancel_requested_at, cancel_reason, cancelled_by, cancelled_at, edited_at, edit_count, profiles!expenses_paid_by_fkey(full_name), children(full_name)",
    )
    .eq("group_id", groupId)
    .order("expense_date", { ascending: false })
    .limit(200);

  // Fetch children for the edit modal dropdown.
  const { data: childrenList } = await supabase
    .from("children")
    .select("id, full_name")
    .eq("group_id", groupId);

  // Fetch group members for the "Visto por X" display (name lookup).
  const { data: membersRaw } = await supabase
    .from("group_members")
    .select("user_id, profiles(full_name, display_name)")
    .eq("group_id", groupId);
  const membersList = (membersRaw || []).map((m) => ({
    user_id: m.user_id as string,
    name: getDisplayName(
      (m.profiles as unknown as { display_name?: string; full_name?: string } | null)?.display_name ||
        (m.profiles as unknown as { full_name?: string } | null)?.full_name,
    ),
  }));

  // Collab reads — todos os reads pra essas expenses (próprio user + coparentes).
  // Powers o badge "Nova" + "Visto por X". Two-step query pra não exigir FK custom.
  const expenseIds = (expenses || []).map((e) => e.id);
  const reads = expenseIds.length > 0
    ? ((await supabase
        .from("collab_reads")
        .select("record_id, user_id, read_at")
        .eq("record_type", "expense")
        .in("record_id", expenseIds)).data || [])
    : [];

  // Calculate totals (exclude rejected + cancelled from total)
  const approvedAndPending = expenses?.filter(e => e.status === "pending" || e.status === "approved" || e.status === "cancel_pending") || [];
  const total = approvedAndPending.reduce((sum, e) => sum + Number(e.amount), 0);
  const pending = expenses?.filter(e => e.status === "pending").length || 0;
  const rejected = expenses?.filter(e => e.status === "rejected").length || 0;

  // Sign receipt URLs server-side (post-migration 062, bucket is private).
  const serializedExpenses = await Promise.all(
    (expenses || []).map(async (e) => ({
      id: e.id,
      description: e.description,
      amount: Number(e.amount),
      category: e.category,
      status: e.status,
      priority: ((e as unknown as { priority?: string }).priority as "info" | "important" | "urgent") || "info",
      expense_date: e.expense_date,
      paid_by: e.paid_by,
      receipt_url: e.receipt_url
        ? (await getSignedFileUrl(supabase, "receipts", e.receipt_url)) || e.receipt_url
        : null,
      rejection_reason: (e as unknown as { rejection_reason: string | null }).rejection_reason || null,
      approved_by: (e as unknown as { approved_by: string | null }).approved_by || null,
      approved_at: (e as unknown as { approved_at: string | null }).approved_at || null,
      rejected_by: (e as unknown as { rejected_by: string | null }).rejected_by || null,
      rejected_at: (e as unknown as { rejected_at: string | null }).rejected_at || null,
      cancel_requested_by: (e as unknown as { cancel_requested_by: string | null }).cancel_requested_by || null,
      cancel_requested_at: (e as unknown as { cancel_requested_at: string | null }).cancel_requested_at || null,
      cancel_reason: (e as unknown as { cancel_reason: string | null }).cancel_reason || null,
      cancelled_by: (e as unknown as { cancelled_by: string | null }).cancelled_by || null,
      cancelled_at: (e as unknown as { cancelled_at: string | null }).cancelled_at || null,
      edited_at: (e as unknown as { edited_at: string | null }).edited_at || null,
      edit_count: (e as unknown as { edit_count: number }).edit_count || 0,
      child_id: (e as unknown as { child_id: string | null }).child_id || null,
      paid_by_name: getDisplayName((e.profiles as unknown as { full_name: string | null } | null)?.full_name),
      child_name: (e.children as unknown as { full_name: string } | null)?.full_name || null,
    })),
  );

  const serializedReads = (reads as Array<{ record_id: string; user_id: string; read_at: string }>).map((r) => ({
    expense_id: r.record_id,
    user_id: r.user_id,
    read_at: r.read_at,
  }));

  return (
    <ExpensesClient
      expenses={serializedExpenses}
      reads={serializedReads}
      members={membersList}
      childrenList={(childrenList || []).map((c) => ({ id: c.id as string, full_name: c.full_name as string }))}
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
