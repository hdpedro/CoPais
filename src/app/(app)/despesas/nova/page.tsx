import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createExpense } from "@/actions/expenses";
import { EXPENSE_CATEGORIES } from "@/lib/constants";
import Link from "next/link";
import { getBrazilToday } from "@/lib/calendar-utils";

export default async function NewExpensePage() {
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  const user = session?.user;
  if (!user) redirect("/login");

  const { data: memberships } = await supabase
    .from("group_members")
    .select("group_id, role")
    .eq("user_id", user.id);

  if (!memberships || memberships.length === 0) redirect("/onboarding");
  if (memberships[0].role === "readonly") redirect("/dashboard");
  const groupId = memberships[0].group_id;

  const { data: children } = await supabase
    .from("children")
    .select("id, full_name")
    .eq("group_id", groupId);

  const today = getBrazilToday();

  return (
    <div className="max-w-lg mx-auto pb-20">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/despesas" className="text-muted hover:text-dark">
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </Link>
        <h1 className="text-2xl font-bold text-dark">Nova Despesa</h1>
      </div>

      <form action={createExpense} className="bg-white rounded-xl p-6 shadow-sm space-y-4">
        <input type="hidden" name="groupId" value={groupId} />

        <div>
          <label className="block text-sm font-medium text-dark mb-1">Descricao</label>
          <input type="text" name="description" required placeholder="Ex: Mensalidade escola"
            className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary" />
        </div>

        <div>
          <label className="block text-sm font-medium text-dark mb-1">Valor (R$)</label>
          <input type="number" name="amount" required step="0.01" min="0.01" placeholder="0.00"
            className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary" />
        </div>

        <div>
          <label className="block text-sm font-medium text-dark mb-1">Categoria</label>
          <select name="category" required
            className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary">
            {EXPENSE_CATEGORIES.map((cat) => (
              <option key={cat.value} value={cat.value}>{cat.icon} {cat.label}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-dark mb-1">Crianca (opcional)</label>
          <select name="childId"
            className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary">
            <option value="">Geral</option>
            {children?.map((child) => (
              <option key={child.id} value={child.id}>{child.full_name}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-dark mb-1">Data</label>
          <input type="date" name="expenseDate" required defaultValue={today}
            className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary" />
        </div>

        <button type="submit"
          className="w-full py-3 bg-primary text-white font-semibold rounded-lg hover:bg-primary-dark transition-colors">
          Registrar Despesa
        </button>
      </form>
    </div>
  );
}
