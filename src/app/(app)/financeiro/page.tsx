import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PARENT_COLORS } from "@/lib/constants";
import FinancialDashboard from "./FinancialDashboard";

export default async function FinanceiroPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: memberships } = await supabase
    .from("group_members")
    .select("group_id")
    .eq("user_id", user.id);

  if (!memberships || memberships.length === 0) redirect("/onboarding");
  const groupId = memberships[0].group_id;

  // Get all members
  const { data: members } = await supabase
    .from("group_members")
    .select("user_id, role, joined_at, profiles(full_name)")
    .eq("group_id", groupId)
    .order("joined_at", { ascending: true });

  const colors = [PARENT_COLORS.primary, PARENT_COLORS.secondary];
  const memberList = (members || []).map((m, i) => {
    const p = Array.isArray(m.profiles) ? m.profiles[0] : m.profiles;
    return {
      user_id: m.user_id,
      full_name: p?.full_name || "Usuario",
      color: colors[i] || colors[1],
    };
  });

  // Fetch ALL expenses for this group (we'll filter by month client-side)
  const { data: expenses } = await supabase
    .from("expenses")
    .select("id, category, description, amount, paid_by, status, expense_date, split_ratio, child_id, children(full_name), profiles!expenses_paid_by_fkey(full_name)")
    .eq("group_id", groupId)
    .order("expense_date", { ascending: false });

  const serializedExpenses = (expenses || []).map((e) => ({
    id: e.id,
    category: e.category,
    description: e.description,
    amount: Number(e.amount),
    paid_by: e.paid_by,
    paid_by_name: (Array.isArray(e.profiles) ? e.profiles[0] : e.profiles)?.full_name || "—",
    status: e.status,
    expense_date: e.expense_date,
    split_ratio: e.split_ratio as Record<string, number> | null,
    child_name: (Array.isArray(e.children) ? e.children[0] : e.children)?.full_name || null,
  }));

  return (
    <div className="space-y-4 pb-20">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-dark">Financeiro</h1>
      </div>
      <FinancialDashboard
        expenses={serializedExpenses}
        members={memberList}
        currentUserId={user.id}
        groupId={groupId}
      />
    </div>
  );
}
