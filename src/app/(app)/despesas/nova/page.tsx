import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getActiveGroup } from "@/lib/group-utils";
import { createExpense } from "@/actions/expenses";
import { EXPENSE_CATEGORIES } from "@/lib/constants";
import { getBrazilToday } from "@/lib/calendar-utils";
import ExpenseFormClient from "./ExpenseFormClient";
import NewExpenseHeader from "./NewExpenseHeader";

export default async function NewExpensePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const activeGroup = await getActiveGroup(supabase, user.id);
  if (!activeGroup) redirect("/onboarding");
  if (activeGroup.isReadonly) redirect("/dashboard");
  const { groupId } = activeGroup;

  const [{ data: children }, { data: groupMembers }] = await Promise.all([
    supabase
      .from("children")
      .select("id, full_name")
      .eq("group_id", groupId),
    supabase
      .from("group_members")
      .select("user_id, profiles(full_name)")
      .eq("group_id", groupId)
      .order("joined_at", { ascending: true }),
  ]);

  const members = (groupMembers || []).map((m) => {
    const p = Array.isArray(m.profiles) ? m.profiles[0] : m.profiles;
    const fullName = (p as { full_name?: string | null } | null)?.full_name;
    return { user_id: m.user_id, full_name: fullName || "Usuario" };
  });

  const today = getBrazilToday();

  return (
    <div className="max-w-lg mx-auto pb-20">
      <NewExpenseHeader />

      <ExpenseFormClient
        groupId={groupId}
        children={children || []}
        categories={EXPENSE_CATEGORIES as unknown as { value: string; label: string; icon: string }[]}
        today={today}
        createExpense={createExpense}
        members={members}
        currentUserId={user.id}
      />
    </div>
  );
}
