import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getActiveGroup } from "@/lib/group-utils";
import { PARENT_COLORS, getDisplayName } from "@/lib/constants";
import dynamic from "next/dynamic";
import FinanceiroHeader from "./FinanceiroHeader";

const FinancialDashboard = dynamic(() => import("./FinancialDashboard"), {
  loading: () => <div className="animate-pulse bg-gray-100 rounded-xl h-96" />,
});

export default async function FinanceiroPage({ searchParams }: { searchParams: Promise<{ success?: string; error?: string }> }) {
  const params = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const activeGroup = await getActiveGroup(supabase, user.id);
  if (!activeGroup) redirect("/onboarding");
  const { groupId, custodyEnabled } = activeGroup;

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
      .order("expense_date", { ascending: false })
      .limit(10000),
    supabase
      .from("settlements")
      .select("id, paid_by, paid_to, amount, payment_method, reference_note, status, confirmed_at, settlement_date, created_at")
      .eq("group_id", groupId)
      .order("settlement_date", { ascending: false })
      .limit(100),
  ]);

  const colors = [PARENT_COLORS.primary, PARENT_COLORS.secondary];
  const memberList = (members || []).map((m, i) => {
    const p = Array.isArray(m.profiles) ? m.profiles[0] : m.profiles;
    return {
      user_id: m.user_id,
      full_name: getDisplayName(p?.full_name),
      color: colors[i] || colors[1],
    };
  });

  const serializedExpenses = (expenses || []).map((e) => ({
    id: e.id,
    category: e.category,
    description: e.description,
    amount: Number(e.amount),
    paid_by: e.paid_by,
    paid_by_name: getDisplayName((Array.isArray(e.profiles) ? e.profiles[0] : e.profiles)?.full_name),
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

      <FinanceiroHeader />
      <FinancialDashboard
        expenses={serializedExpenses}
        members={memberList}
        currentUserId={user.id}
        groupId={groupId}
        settlements={serializedSettlements}
        custodyEnabled={custodyEnabled}
      />
    </div>
  );
}
