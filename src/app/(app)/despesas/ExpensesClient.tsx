"use client";

import Link from "next/link";
import { useI18n } from "@/i18n/provider";
import { EXPENSE_CATEGORIES, getDisplayName } from "@/lib/constants";
import { updateExpenseStatus } from "@/actions/expenses";
import RejectExpenseButton from "./RejectExpenseButton";
import DeleteExpenseButton from "./DeleteExpenseButton";
import ReceiptViewer from "./ReceiptViewer";

interface SerializedExpense {
  id: string;
  description: string;
  amount: number;
  category: string;
  status: string;
  expense_date: string;
  paid_by: string;
  receipt_url: string | null;
  rejection_reason: string | null;
  paid_by_name: string;
  child_name: string | null;
}

interface ExpensesClientProps {
  expenses: SerializedExpense[];
  total: number;
  pending: number;
  rejected: number;
  isReadonly: boolean;
  currentUserId: string;
  successMessage?: string;
  errorMessage?: string;
}

export default function ExpensesClient({
  expenses,
  total,
  pending,
  rejected,
  isReadonly,
  currentUserId,
  successMessage,
  errorMessage,
}: ExpensesClientProps) {
  const { t } = useI18n();

  const statusLabels: Record<string, string> = {
    pending: t("expensesPage.statusPending"),
    approved: t("expensesPage.statusApproved"),
    rejected: t("expensesPage.statusRejected"),
    disputed: t("expensesPage.statusDisputed"),
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
        <h1 className="text-2xl font-bold text-dark">{t("expenses.title")}</h1>
        {!isReadonly && (
          <Link href="/despesas/nova"
            className="px-4 py-2 bg-primary text-white text-sm font-semibold rounded-lg hover:bg-primary-dark transition-colors">
            {t("expensesPage.newButton")}
          </Link>
        )}
      </div>

      {/* Success message — prominent with checkmark */}
      {successMessage && (
        <div className="bg-[#5B9E85]/10 border border-[#5B9E85]/30 text-[#2E7268] px-4 py-4 rounded-xl text-sm font-semibold flex items-center gap-3 animate-[fadeIn_300ms_ease-out]">
          <div className="w-8 h-8 rounded-full bg-[#5B9E85] flex items-center justify-center flex-shrink-0">
            <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <span>{successMessage}</span>
        </div>
      )}
      {/* Error message */}
      {errorMessage && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-4 rounded-xl text-sm font-semibold flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-red-500 flex items-center justify-center flex-shrink-0">
            <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Summary */}
      <div className={`grid gap-3 ${rejected > 0 ? "grid-cols-3" : "grid-cols-2"}`}>
        <div className="bg-white rounded-xl p-4 shadow-sm">
          <p className="text-xs text-muted">{t("expensesPage.totalExclRejected")}</p>
          <p className="text-xl font-bold text-dark">R$ {total.toFixed(2)}</p>
        </div>
        <div className="bg-white rounded-xl p-4 shadow-sm">
          <p className="text-xs text-muted">{t("expensesPage.pendingCount")}</p>
          <p className="text-xl font-bold text-accent">{pending}</p>
        </div>
        {rejected > 0 && (
          <div className="bg-white rounded-xl p-4 shadow-sm">
            <p className="text-xs text-muted">{t("expensesPage.rejectedCount")}</p>
            <p className="text-xl font-bold text-error">{rejected}</p>
          </div>
        )}
      </div>

      {/* Expense List */}
      {expenses && expenses.length > 0 ? (
        <div className="space-y-3">
          {expenses.map((expense) => {
            const cat = EXPENSE_CATEGORIES.find(c => c.value === expense.category);
            const isOwnExpense = expense.paid_by === currentUserId;

            return (
              <div key={expense.id} className="bg-white rounded-xl p-4 shadow-sm">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-3">
                    <span className="text-xl">{cat?.icon || "📦"}</span>
                    <div>
                      <p className="font-medium text-dark text-sm">{expense.description}</p>
                      <p className="text-xs text-muted">
                        {expense.paid_by_name} - {new Date(expense.expense_date + "T12:00:00").toLocaleDateString("pt-BR")}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {expense.receipt_url && (
                      <ReceiptViewer url={expense.receipt_url} />
                    )}
                    <div className="text-right">
                      <p className="font-semibold text-dark">R$ {Number(expense.amount).toFixed(2)}</p>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${statusColors[expense.status]}`}>
                        {statusLabels[expense.status]}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Show rejection reason */}
                {expense.status === "rejected" && expense.rejection_reason && (
                  <div className="mt-2 px-3 py-2 bg-error/5 rounded-lg">
                    <p className="text-xs text-error font-medium">{t("expensesPage.reason")}: {expense.rejection_reason}</p>
                  </div>
                )}

                {/* Approve/Reject buttons for other user's pending expenses */}
                {!isReadonly && !isOwnExpense && expense.status === "pending" && (
                  <div className="flex gap-2 mt-3 pt-3 border-t border-gray-100">
                    <form action={updateExpenseStatus} className="flex-1">
                      <input type="hidden" name="expenseId" value={expense.id} />
                      <input type="hidden" name="status" value="approved" />
                      <button type="submit" className="w-full py-2 text-sm font-medium text-success bg-success/10 rounded-lg hover:bg-success/20 transition-colors">
                        {t("expensesPage.approve")}
                      </button>
                    </form>
                    <div className="flex-1">
                      <RejectExpenseButton expenseId={expense.id} />
                    </div>
                  </div>
                )}

                {/* Delete button for creator when expense is NOT approved */}
                {isOwnExpense && expense.status !== "approved" && (
                  <div className="mt-3 pt-3 border-t border-gray-100 space-y-2">
                    {expense.status === "rejected" && (
                      <Link
                        href="/despesas/nova"
                        className="w-full py-2 text-sm font-medium text-primary bg-primary/10 rounded-lg hover:bg-primary/20 transition-colors flex items-center justify-center gap-2"
                      >
                        {t("expensesPage.registerAgain")}
                      </Link>
                    )}
                    <DeleteExpenseButton expenseId={expense.id} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="bg-white rounded-xl p-8 shadow-sm text-center">
          <p className="text-muted">{t("expensesPage.noExpenses")}</p>
          {!isReadonly && <Link href="/despesas/nova" className="text-primary font-medium mt-2 inline-block">{t("expensesPage.addExpense")}</Link>}
        </div>
      )}
    </div>
  );
}
