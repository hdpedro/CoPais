import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PARENT_COLORS } from "@/lib/constants";
import FinancialDashboard from "./FinancialDashboard";

export default async function FinanceiroPage({ searchParams }: { searchParams: Promise<{ success?: string; error?: string }> }) {
  const params = await searchParams;
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  const user = session?.user;
  if (!user) redirect("/login");

  const { data: memberships } = await supabase
    .from("group_members")
    .select("group_id")
    .eq("user_id", user.id);

  if (!memberships || memberships.length === 0) redirect("/onboarding");
  const groupId = memberships[0].group_id;

  // Parallel fetch: members + expenses + settlements
  const [{ data: members }, { data: expenses }, { data: settlements }] = await Promise.all([
    supabase
      .from("group_members")
      .select("user_id, role, joined_at, profiles(full_name)")
      .eq("group_id", groupId)
      .order("joined_at", { ascending: true }),
    supabase
      .from("expenses")
      .select("id, category, description, amount, paid_by, status, expense_date, split_ratio, child_id, children(full_name), profiles!expenses_paid_by_fkey(full_name)")
      .eq("group_id", groupId)
      .order("expense_date", { ascending: false }),
    supabase
      .from("settlements")
      .select("id, paid_by, paid_to, amount, payment_method, reference_note, status, confirmed_at, settlement_date, created_at")
      .eq("group_id", groupId)
      .order("settlement_date", { ascending: false }),
  ]);

  const colors = [PARENT_COLORS.primary, PARENT_COLORS.secondary];
  const memberList = (members || []).map((m, i) => {
    const p = Array.isArray(m.profiles) ? m.profiles[0] : m.profiles;
    return {
      user_id: m.user_id,
      full_name: p?.full_name || "Usuario",
      color: colors[i] || colors[1],
    };
  });

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

  const serializedSettlements = (settlements || []).map((s) => ({
    id: s.id,
    paid_by: s.paid_by,
    paid_to: s.paid_to,
    amount: Number(s.amount),
    payment_method: s.payment_method,
    reference_note: s.reference_note,
    status: s.status,
    confirmed_at: s.confirmed_at,
    settlement_date: s.settlement_date,
    created_at: s.created_at,
  }));

  return (
    <div className="space-y-4 pb-20">
      {/* Success/Error messages */}
      {params?.success && (
        <div className="bg-success/10 text-success px-4 py-3 rounded-lg text-sm font-medium">
          {decodeURIComponent(params.success)}
        </div>
      )}
      {params?.error && (
        <div className="bg-error/10 text-error px-4 py-3 rounded-lg text-sm font-medium">
          {decodeURIComponent(params.error)}
        </div>
      )}

      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-dark">Financeiro</h1>
      </div>
      <FinancialDashboard
        expenses={serializedExpenses}
        members={memberList}
        currentUserId={user.id}
        groupId={groupId}
        settlements={serializedSettlements}
      />
    </div>
  );
}
