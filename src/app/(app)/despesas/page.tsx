import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { EXPENSE_CATEGORIES } from "@/lib/constants";
import { updateExpenseStatus } from "@/actions/expenses";

export default async function ExpensesPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: memberships } = await supabase
    .from("group_members")
    .select("group_id")
    .eq("user_id", user.id);

  if (!memberships || memberships.length === 0) redirect("/onboarding");
  const groupId = memberships[0].group_id;

  const { data: expenses } = await supabase
    .from("expenses")
    .select("*, profiles!expenses_paid_by_fkey(full_name), children(full_name)")
    .eq("group_id", groupId)
    .order("expense_date", { ascending: false });

  // Calculate totals
  const total = expenses?.reduce((sum, e) => sum + Number(e.amount), 0) || 0;
  const pending = expenses?.filter(e => e.status === "pending").length || 0;

  const statusLabels: Record<string, string> = {
    pending: "Pendente",
    approved: "Aprovada",
    rejected: "Rejeitada",
    disputed: "Disputada",
  };

  const statusColors: Record<string, string> = {
    pending: "bg-accent/10 text-accent",
    approved: "bg-success/10 text-success",
    rejected: "bg-error/10 text-error",
    disputed: "bg-secondary/10 text-secondary",
  };

  return (
    <div className="space-y-6 pb-20">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-dark">Despesas</h1>
        <Link href="/despesas/nova"
          className="px-4 py-2 bg-primary text-white text-sm font-semibold rounded-lg hover:bg-primary-dark transition-colors">
          + Nova
        </Link>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-white rounded-xl p-4 shadow-sm">
          <p className="text-xs text-muted">Total</p>
          <p className="text-xl font-bold text-dark">R$ {total.toFixed(2)}</p>
        </div>
        <div className="bg-white rounded-xl p-4 shadow-sm">
          <p className="text-xs text-muted">Pendentes</p>
          <p className="text-xl font-bold text-accent">{pending}</p>
        </div>
      </div>

      {/* Expense List */}
      {expenses && expenses.length > 0 ? (
        <div className="space-y-3">
          {expenses.map((expense) => {
            const cat = EXPENSE_CATEGORIES.find(c => c.value === expense.category);
            const isOwnExpense = expense.paid_by === user.id;

            return (
              <div key={expense.id} className="bg-white rounded-xl p-4 shadow-sm">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-3">
                    <span className="text-xl">{cat?.icon || "📦"}</span>
                    <div>
                      <p className="font-medium text-dark text-sm">{expense.description}</p>
                      <p className="text-xs text-muted">
                        {(expense.profiles as any)?.full_name} - {new Date(expense.expense_date).toLocaleDateString("pt-BR")}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold text-dark">R$ {Number(expense.amount).toFixed(2)}</p>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${statusColors[expense.status]}`}>
                      {statusLabels[expense.status]}
                    </span>
                  </div>
                </div>

                {/* Approve/Reject buttons for other user's pending expenses */}
                {!isOwnExpense && expense.status === "pending" && (
                  <div className="flex gap-2 mt-3 pt-3 border-t border-gray-100">
                    <form action={updateExpenseStatus} className="flex-1">
                      <input type="hidden" name="expenseId" value={expense.id} />
                      <input type="hidden" name="status" value="approved" />
                      <button type="submit" className="w-full py-2 text-sm font-medium text-success bg-success/10 rounded-lg hover:bg-success/20 transition-colors">
                        Aprovar
                      </button>
                    </form>
                    <form action={updateExpenseStatus} className="flex-1">
                      <input type="hidden" name="expenseId" value={expense.id} />
                      <input type="hidden" name="status" value="rejected" />
                      <button type="submit" className="w-full py-2 text-sm font-medium text-error bg-error/10 rounded-lg hover:bg-error/20 transition-colors">
                        Rejeitar
                      </button>
                    </form>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="bg-white rounded-xl p-8 shadow-sm text-center">
          <p className="text-muted">Nenhuma despesa registrada.</p>
          <Link href="/despesas/nova" className="text-primary font-medium mt-2 inline-block">Adicionar despesa</Link>
        </div>
      )}
    </div>
  );
}
