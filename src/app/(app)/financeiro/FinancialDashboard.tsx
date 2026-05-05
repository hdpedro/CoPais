"use client";

import { useState, useMemo, useTransition } from "react";
import Link from "next/link";
import { EXPENSE_CATEGORIES, SETTLEMENT_METHODS, getDisplayName } from "@/lib/constants";
import { createSettlement, confirmSettlement } from "@/actions/settlements";
import { useI18n } from "@/i18n/provider";

interface Expense {
  id: string;
  category: string;
  description: string;
  amount: number;
  paid_by: string;
  paid_by_name: string;
  status: string;
  expense_date: string;
  split_ratio: Record<string, number> | null;
  child_name: string | null;
}

interface Settlement {
  id: string;
  paid_by: string;
  paid_to: string;
  amount: number;
  payment_method: string;
  reference_note: string | null;
  status: string;
  confirmed_at: string | null;
  settlement_date: string;
  created_at: string;
}

interface Member {
  user_id: string;
  full_name: string;
  color: string;
}

interface Props {
  expenses: Expense[];
  members: Member[];
  currentUserId: string;
  groupId: string;
  settlements: Settlement[];
  custodyEnabled: boolean;
}

function getExpenseSplitShare(expense: Expense, memberId: string, members: Member[]): number {
  // Returns how much of this expense should be borne by memberId
  if (expense.split_ratio && expense.split_ratio[memberId] !== undefined) {
    return (expense.split_ratio[memberId] / 100) * expense.amount;
  }
  // Default 50/50 for 2 members
  if (members.length >= 2) {
    return expense.amount / 2;
  }
  return expense.amount;
}

export default function FinancialDashboard({ expenses, members, currentUserId, groupId, settlements, custodyEnabled }: Props) {
  const { t } = useI18n();
  const MONTH_NAMES = t("calendar.monthNames").split(",");
  const [now] = useState(() => new Date());
  const [selectedYear, setSelectedYear] = useState(() => now.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(() => now.getMonth());
  const [viewMode, setViewMode] = useState<"dashboard" | "history" | "settlements">("dashboard");
  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const [isPending, startTransition] = useTransition();

  // Filter expenses for selected month
  const monthExpenses = useMemo(() => {
    return expenses.filter((e) => {
      const d = new Date(e.expense_date + "T12:00:00");
      return d.getFullYear() === selectedYear && d.getMonth() === selectedMonth;
    });
  }, [expenses, selectedYear, selectedMonth]);

  const countableExpenses = useMemo(() =>
    monthExpenses.filter(
      (e) => e.status === "approved"
    ),
  [monthExpenses]);

  // Per-member spending
  const memberSpending = useMemo(() => {
    const spending: Record<string, number> = {};
    members.forEach((m) => { spending[m.user_id] = 0; });
    countableExpenses.forEach((e) => {
      spending[e.paid_by] = (spending[e.paid_by] || 0) + e.amount;
    });
    return spending;
  }, [countableExpenses, members]);

  const totalMonth = useMemo(() =>
    countableExpenses.reduce((sum, e) => sum + e.amount, 0),
  [countableExpenses]);

  // Balance calculation using per-expense split_ratio
  const balance = useMemo(() => {
    if (members.length < 2) return null;
    const m0 = members[0];
    const m1 = members[1];

    // Calculate what each member should pay based on split ratios
    let m0ShouldPay = 0;

    countableExpenses.forEach((e) => {
      m0ShouldPay += getExpenseSplitShare(e, m0.user_id, members);
    });

    const m0Spent = memberSpending[m0.user_id] || 0;

    // Balance: positive = m1 owes m0, negative = m0 owes m1
    // diff = what m0 spent - what m0 should have spent
    const diff = Math.round((m0Spent - m0ShouldPay) * 100) / 100;

    return {
      amount: Math.abs(diff),
      owes: diff > 0 ? m1 : m0,
      receives: diff > 0 ? m0 : m1,
    };
  }, [countableExpenses, memberSpending, members]);

  // Overall balance across all time (for settlements section)
  const overallBalance = useMemo(() => {
    if (members.length < 2) return null;
    const m0 = members[0];
    const m1 = members[1];

    const allCountable = expenses.filter(
      (e) => e.status === "approved"
    );

    let m0ShouldPay = 0;

    allCountable.forEach((e) => {
      m0ShouldPay += getExpenseSplitShare(e, m0.user_id, members);
    });

    let m0Spent = 0;
    allCountable.forEach((e) => {
      if (e.paid_by === m0.user_id) m0Spent += e.amount;
    });

    // Account for confirmed settlements.
    //
    // The formula is `diff = (m0Spent + settlementAdjustment) - m0ShouldPay`,
    // where `diff > 0` means m0 is owed money. Settlements push the diff
    // toward zero (they reconcile previous imbalances).
    //
    // Worked example (audit 2026-04-27 caught this):
    //   - m0 spent 200, m1 spent 0, 50/50 split → m0ShouldPay = 100, diff = 100
    //   - m1 then pays m0 100 (s.paid_to === m0)
    //   - new diff should be 0
    //   - therefore settlementAdjustment must be -100 when m0 received money
    //
    // Previous code had the signs inverted, which made the dashboard show
    // a higher imbalance after every confirmed settlement.
    const confirmedSettlements = settlements.filter((s) => s.status === "confirmed");
    let settlementAdjustment = 0;
    confirmedSettlements.forEach((s) => {
      if (s.paid_by === m0.user_id) {
        // m0 paid m1 to settle a debt → reduces m0's deficit by adding to "spent" side
        settlementAdjustment += s.amount;
      } else if (s.paid_to === m0.user_id) {
        // m1 paid m0 → m0 already recovered this much; subtract from "spent" side
        settlementAdjustment -= s.amount;
      }
    });

    const diff = Math.round(((m0Spent + settlementAdjustment) - m0ShouldPay) * 100) / 100;

    return {
      amount: Math.abs(diff),
      owes: diff > 0 ? m1 : m0,
      receives: diff > 0 ? m0 : m1,
    };
  }, [expenses, settlements, members]);

  // Category breakdown
  const categoryBreakdown = useMemo(() => {
    const breakdown: Record<string, number> = {};
    countableExpenses.forEach((e) => {
      breakdown[e.category] = (breakdown[e.category] || 0) + e.amount;
    });
    return Object.entries(breakdown)
      .map(([category, amount]) => {
        const cat = EXPENSE_CATEGORIES.find((c) => c.value === category);
        return {
          category,
          label: cat?.label || category,
          icon: cat?.icon || "📦",
          amount,
          percentage: totalMonth > 0 ? (amount / totalMonth) * 100 : 0,
        };
      })
      .sort((a, b) => b.amount - a.amount);
  }, [countableExpenses, totalMonth]);

  // Monthly history
  const monthlyHistory = useMemo(() => {
    const history: Record<string, { total: number; byMember: Record<string, number>; expenses: Expense[] }> = {};
    expenses
      .filter((e) => e.status === "approved")
      .forEach((e) => {
        const d = new Date(e.expense_date + "T12:00:00");
        const key = `${d.getFullYear()}-${String(d.getMonth()).padStart(2, "0")}`;
        if (!history[key]) {
          history[key] = { total: 0, byMember: {}, expenses: [] };
        }
        history[key].total += e.amount;
        history[key].byMember[e.paid_by] = (history[key].byMember[e.paid_by] || 0) + e.amount;
        history[key].expenses.push(e);
      });
    return Object.entries(history)
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([key, data]) => {
        const [y, m] = key.split("-").map(Number);
        return { year: y, month: m, ...data };
      });
  }, [expenses]);

  function navigateMonth(delta: number) {
    let newMonth = selectedMonth + delta;
    let newYear = selectedYear;
    if (newMonth > 11) { newMonth = 0; newYear++; }
    if (newMonth < 0) { newMonth = 11; newYear--; }
    setSelectedMonth(newMonth);
    setSelectedYear(newYear);
  }

  const statusLabels: Record<string, string> = {
    pending: t("financial.statusPending"),
    approved: t("financial.statusApproved"),
    rejected: t("financial.statusRejected"),
    disputed: t("financial.statusDisputed"),
  };

  const statusColors: Record<string, string> = {
    pending: "bg-amber-100 text-amber-700",
    approved: "bg-green-100 text-green-700",
    rejected: "bg-red-100 text-red-700",
    disputed: "bg-orange-100 text-orange-700",
  };

  const settlementStatusLabels: Record<string, string> = {
    pending: t("financial.settlementPending"),
    confirmed: t("financial.settlementConfirmed"),
    disputed: t("financial.settlementDisputed"),
  };

  const settlementStatusColors: Record<string, string> = {
    pending: "bg-amber-100 text-amber-700",
    confirmed: "bg-green-100 text-green-700",
    disputed: "bg-red-100 text-red-700",
  };

  const handleCreateSettlement = (formData: FormData) => {
    startTransition(async () => {
      await createSettlement(formData);
    });
  };

  const handleConfirmSettlement = (formData: FormData) => {
    startTransition(async () => {
      await confirmSettlement(formData);
    });
  };

  const getMemberName = (userId: string) => {
    const member = members.find((m) => m.user_id === userId);
    return getDisplayName(member?.full_name, true);
  };

  const userOwes = overallBalance && overallBalance.owes.user_id === currentUserId;
  const otherMember = members.find((m) => m.user_id !== currentUserId);

  // ── Single source of truth for the entire module ─────────────────────
  // `isShared` controls whether to show balance/settlements/history-tab
  // and gates the "Registrar pagamento" CTA. UI-level prevention only —
  // never validate-after-click ("Sem co-responsáveis" alert was removed).
  const isShared = members.length > 1;
  // Defensive: bounce out of tabs that no longer apply when isShared flips
  // (e.g., coparent removed mid-session via Família).
  const safeViewMode = !isShared && viewMode !== "dashboard" ? "dashboard" : viewMode;

  return (
    <div className="space-y-4">
      {/* View toggle — Acertar e Histórico só fazem sentido em modo compartilhado */}
      {isShared ? (
        <div className="flex bg-gray-100 rounded-lg p-1">
          <button
            onClick={() => setViewMode("dashboard")}
            className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors ${
              safeViewMode === "dashboard" ? "bg-white text-dark shadow-sm" : "text-muted"
            }`}
          >
            {t("financial.summary")}
          </button>
          <button
            onClick={() => setViewMode("settlements")}
            className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors ${
              safeViewMode === "settlements" ? "bg-white text-dark shadow-sm" : "text-muted"
            }`}
          >
            {t("financial.settleUp")}
          </button>
          <button
            onClick={() => setViewMode("history")}
            className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors ${
              safeViewMode === "history" ? "bg-white text-dark shadow-sm" : "text-muted"
            }`}
          >
            {t("financial.history")}
          </button>
        </div>
      ) : null}

      {/* Solo mode CTA — substitui o Saldo "A pagar / A receber" quando o
          usuário está sozinho. Adiciona valor: convida pra trazer o coparente. */}
      {!isShared && safeViewMode === "dashboard" ? (
        <div className="bg-primary/5 border border-primary/20 rounded-xl p-5">
          <div className="flex items-start gap-3 mb-3">
            <div className="w-11 h-11 rounded-full bg-primary/15 flex items-center justify-center text-xl shrink-0">
              👥
            </div>
            <div className="flex-1">
              <h3 className="text-base font-bold text-dark">Divida despesas com outra pessoa</h3>
              <p className="text-sm text-muted mt-0.5">
                Adicione um co-responsável para dividir gastos automaticamente.
              </p>
            </div>
          </div>
          <Link
            href="/familia"
            className="block w-full py-2.5 bg-primary text-white text-sm font-semibold rounded-lg hover:bg-primary-dark transition-colors text-center"
          >
            Adicionar co-responsável
          </Link>
        </div>
      ) : null}

      {safeViewMode === "dashboard" ? (
        <>
          {/* Month navigation */}
          <div className="bg-white rounded-xl p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <button onClick={() => navigateMonth(-1)} className="p-2 hover:bg-gray-50 rounded-lg">
                <svg className="w-5 h-5 text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <h2 className="text-lg font-semibold text-dark">
                {MONTH_NAMES[selectedMonth]} {selectedYear}
              </h2>
              <button onClick={() => navigateMonth(1)} className="p-2 hover:bg-gray-50 rounded-lg">
                <svg className="w-5 h-5 text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </div>
          </div>

          {/* Total do mes */}
          <div className="bg-white rounded-xl p-5 shadow-sm text-center">
            <p className="text-xs text-muted mb-1">{isShared ? t("financial.monthTotal") : "Seus gastos no mês"}</p>
            <p className="text-3xl font-bold text-dark">
              R$ {totalMonth.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
            </p>
            <p className="text-xs text-muted mt-1">{countableExpenses.length} {t("financial.expenseCount")}</p>
          </div>

          {/* Per-parent cards — só faz sentido em modo compartilhado */}
          {isShared ? (
          <div className="grid grid-cols-2 gap-3">
            {members.map((m) => {
              const spent = memberSpending[m.user_id] || 0;
              const percentage = totalMonth > 0 ? (spent / totalMonth) * 100 : 0;
              return (
                <div key={m.user_id} className="bg-white rounded-xl p-4 shadow-sm">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: m.color }} />
                    <p className="text-xs text-muted truncate">
                      {getDisplayName(m.full_name, true)}
                      {m.user_id === currentUserId ? ` ${t("financial.youSuffix")}` : ""}
                    </p>
                  </div>
                  <p className="text-xl font-bold text-dark">
                    R$ {spent.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                  </p>
                  <div className="mt-2 h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{ width: `${percentage}%`, backgroundColor: m.color }}
                    />
                  </div>
                  <p className="text-xs text-muted mt-1">{percentage.toFixed(0)}% {t("financial.ofTotal")}</p>
                </div>
              );
            })}
          </div>
          ) : null}

          {/* Balance — hide "who owes whom" for single-member families without custody */}
          {balance && balance.amount > 0.01 && (custodyEnabled || members.length > 1) && (
            <div className="bg-white rounded-xl p-4 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-amber-50 flex items-center justify-center text-lg">
                  ⚖️
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-dark">
                    {getDisplayName(balance.owes.full_name, true)} {t("financial.owesVerb")}{" "}
                    <span className="text-primary font-bold">
                      R$ {balance.amount.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                    </span>{" "}
                    {t("financial.toWord")} {getDisplayName(balance.receives.full_name, true)}
                  </p>
                  <p className="text-xs text-muted">{custodyEnabled ? t("financial.thisMonthSplit") : t("financial.familyExpenses")}</p>
                </div>
              </div>
            </div>
          )}

          {/* Category breakdown */}
          {categoryBreakdown.length > 0 && (
            <div className="bg-white rounded-xl p-4 shadow-sm">
              <h3 className="text-sm font-semibold text-dark mb-3">{t("financial.byCategory")}</h3>
              <div className="space-y-3">
                {categoryBreakdown.map((cat) => (
                  <div key={cat.category}>
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm">{cat.icon}</span>
                        <span className="text-sm text-dark">{cat.label}</span>
                      </div>
                      <div className="text-right">
                        <span className="text-sm font-medium text-dark">
                          R$ {cat.amount.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                        </span>
                        <span className="text-xs text-muted ml-2">{cat.percentage.toFixed(0)}%</span>
                      </div>
                    </div>
                    <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-primary rounded-full transition-all"
                        style={{ width: `${cat.percentage}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Month expense list */}
          {monthExpenses.length > 0 ? (
            <div className="bg-white rounded-xl shadow-sm overflow-hidden">
              <h3 className="text-sm font-semibold text-dark px-4 pt-4 pb-2">{t("financial.monthExpenses")}</h3>
              <div className="divide-y divide-gray-50">
                {monthExpenses.map((e) => {
                  const cat = EXPENSE_CATEGORIES.find((c) => c.value === e.category);
                  const member = members.find((m) => m.user_id === e.paid_by);
                  const hasSplitRatio = e.split_ratio && Object.keys(e.split_ratio).length > 0;
                  return (
                    <div key={e.id} className="px-4 py-3 flex items-center gap-3">
                      <span className="text-lg">{cat?.icon || "📦"}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-dark truncate">{e.description}</p>
                        <div className="flex items-center gap-2">
                          <div
                            className="w-2 h-2 rounded-full"
                            style={{ backgroundColor: member?.color || "#ccc" }}
                          />
                          <p className="text-xs text-muted">
                            {e.paid_by_name.split(" ")[0]} · {new Date(e.expense_date + "T12:00:00").toLocaleDateString("pt-BR")}
                          </p>
                          {e.child_name && (
                            <span className="text-xs text-muted">· {e.child_name.split(" ")[0]}</span>
                          )}
                          {hasSplitRatio && (() => {
                            const values = Object.values(e.split_ratio!);
                            const isEqual = values.every((v) => v === 50);
                            if (!isEqual) {
                              return <span className="text-xs text-primary font-medium">· {values.join("/")}</span>;
                            }
                            return null;
                          })()}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-sm font-semibold text-dark">
                          R$ {e.amount.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                        </p>
                        <span className={`text-xs px-1.5 py-0.5 rounded-full ${statusColors[e.status] || ""}`}>
                          {statusLabels[e.status] || e.status}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-xl p-8 shadow-sm text-center">
              <p className="text-muted text-sm">{t("financial.noExpensesThisMonth")}</p>
            </div>
          )}

          {/* Add expense shortcut */}
          <Link
            href="/despesas/nova"
            className="block w-full py-4 bg-primary text-white font-semibold rounded-xl hover:bg-primary-dark transition-colors text-center text-lg"
          >
            {t("financial.newExpense")}
          </Link>
        </>
      ) : safeViewMode === "settlements" ? (
        /* Settlements view */
        <div className="space-y-4">
          {/* Overall balance card */}
          {overallBalance && overallBalance.amount > 0.01 && (
            <div className="bg-gradient-to-r from-primary/10 to-primary/5 rounded-xl p-5 shadow-sm">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-12 h-12 rounded-full bg-white flex items-center justify-center text-2xl shadow-sm">
                  ⚖️
                </div>
                <div className="flex-1">
                  <p className="text-sm text-muted">{t("financial.overallBalance")}</p>
                  <p className="text-lg font-bold text-dark">
                    {getDisplayName(overallBalance.owes.full_name, true)} {t("financial.owesVerb")}{" "}
                    <span className="text-primary">
                      R$ {overallBalance.amount.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                    </span>{" "}
                    {t("financial.toWord")} {getDisplayName(overallBalance.receives.full_name, true)}
                  </p>
                </div>
              </div>

              {/* Show payment button if user owes money */}
              {userOwes && !showPaymentForm && (
                <button
                  onClick={() => setShowPaymentForm(true)}
                  className="w-full py-3 bg-primary text-white font-semibold rounded-lg hover:bg-primary-dark transition-colors text-sm"
                >
                  {t("financial.registerPayment")}
                </button>
              )}
            </div>
          )}

          {overallBalance && overallBalance.amount <= 0.01 && (
            <div className="bg-green-50 rounded-xl p-5 shadow-sm text-center">
              <div className="text-3xl mb-2">✅</div>
              <p className="text-sm font-medium text-green-700">{t("financial.allSettled")}</p>
            </div>
          )}

          {/* Payment form */}
          {showPaymentForm && otherMember && overallBalance && (
            <div className="bg-white rounded-xl p-5 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-dark">{t("financial.registerPayment")}</h3>
                <button
                  onClick={() => setShowPaymentForm(false)}
                  className="text-muted hover:text-dark"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <form action={handleCreateSettlement} className="space-y-4">
                <input type="hidden" name="groupId" value={groupId} />
                <input type="hidden" name="paidTo" value={overallBalance.receives.user_id} />

                <div>
                  <label className="block text-sm font-medium text-dark mb-1">{t("financial.amountLabel")}</label>
                  <input
                    type="number"
                    name="amount"
                    required
                    step="0.01"
                    min="0.01"
                    max={overallBalance.amount.toFixed(2)}
                    defaultValue={overallBalance.amount.toFixed(2)}
                    disabled={isPending}
                    className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary disabled:opacity-50 disabled:bg-gray-50"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-dark mb-1">{t("financial.paymentMethod")}</label>
                  <select
                    name="paymentMethod"
                    required
                    disabled={isPending}
                    className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary disabled:opacity-50 disabled:bg-gray-50"
                  >
                    {SETTLEMENT_METHODS.map((method) => (
                      <option key={method.value} value={method.value}>
                        {method.icon} {method.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-dark mb-1">{t("financial.noteOptional")}</label>
                  <input
                    type="text"
                    name="referenceNote"
                    placeholder={t("financial.noteExample")}
                    disabled={isPending}
                    className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary disabled:opacity-50 disabled:bg-gray-50"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-dark mb-1">{t("financial.dateLabel")}</label>
                  <input
                    type="date"
                    name="settlementDate"
                    required
                    defaultValue={new Date().toISOString().split("T")[0]}
                    disabled={isPending}
                    className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary disabled:opacity-50 disabled:bg-gray-50"
                  />
                </div>

                <button
                  type="submit"
                  disabled={isPending}
                  className="w-full py-3 bg-primary text-white font-semibold rounded-lg hover:bg-primary-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {isPending ? (
                    <>
                      <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      {t("financial.registering")}
                    </>
                  ) : (
                    t("financial.registerPayment")
                  )}
                </button>
              </form>
            </div>
          )}

          {/* Settlement history */}
          <div className="bg-white rounded-xl shadow-sm overflow-hidden">
            <h3 className="text-sm font-semibold text-dark px-4 pt-4 pb-2">{t("financial.paymentHistory")}</h3>
            {settlements.length > 0 ? (
              <div className="divide-y divide-gray-50">
                {settlements.map((s) => {
                  const methodInfo = SETTLEMENT_METHODS.find((m) => m.value === s.payment_method);
                  const isRecipient = s.paid_to === currentUserId;

                  return (
                    <div key={s.id} className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <span className="text-lg">{methodInfo?.icon || "💸"}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-dark">
                            {t("financial.paidTo", { name: getMemberName(s.paid_by), to: getMemberName(s.paid_to) })}
                          </p>
                          <p className="text-xs text-muted">
                            {new Date(s.settlement_date + "T12:00:00").toLocaleDateString("pt-BR")}
                            {s.reference_note ? ` · ${s.reference_note}` : ""}
                          </p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-sm font-semibold text-dark">
                            R$ {s.amount.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                          </p>
                          <span className={`text-xs px-1.5 py-0.5 rounded-full ${settlementStatusColors[s.status] || ""}`}>
                            {settlementStatusLabels[s.status] || s.status}
                          </span>
                        </div>
                      </div>

                      {/* Confirm button for recipient of pending settlement */}
                      {isRecipient && s.status === "pending" && (
                        <form action={handleConfirmSettlement} className="mt-3 pt-3 border-t border-gray-100">
                          <input type="hidden" name="settlementId" value={s.id} />
                          <button
                            type="submit"
                            disabled={isPending}
                            className="w-full py-2 text-sm font-medium text-success bg-success/10 rounded-lg hover:bg-success/20 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                          >
                            {isPending ? (
                              <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                              </svg>
                            ) : null}
                            {t("financial.confirmReceipt")}
                          </button>
                        </form>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="px-4 py-8 text-center">
                <p className="text-muted text-sm">{t("financial.noPayments")}</p>
              </div>
            )}
          </div>
        </div>
      ) : (
        /* History view */
        <div className="space-y-3">
          {monthlyHistory.length > 0 ? (
            monthlyHistory.map((h) => {
              return (
                <button
                  key={`${h.year}-${h.month}`}
                  onClick={() => {
                    setSelectedYear(h.year);
                    setSelectedMonth(h.month);
                    setViewMode("dashboard");
                  }}
                  className="w-full bg-white rounded-xl p-4 shadow-sm text-left hover:shadow-md transition-shadow"
                >
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-semibold text-dark">
                      {MONTH_NAMES[h.month]} {h.year}
                    </h3>
                    <p className="text-sm font-bold text-dark">
                      R$ {h.total.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                    </p>
                  </div>
                  {/* Per-member bar */}
                  <div className="flex h-3 rounded-full overflow-hidden bg-gray-100">
                    {members.map((m) => {
                      const spent = h.byMember[m.user_id] || 0;
                      const pct = h.total > 0 ? (spent / h.total) * 100 : 0;
                      return (
                        <div
                          key={m.user_id}
                          className="h-full transition-all"
                          style={{ width: `${pct}%`, backgroundColor: m.color }}
                        />
                      );
                    })}
                  </div>
                  <div className="flex justify-between mt-2">
                    {members.map((m) => {
                      const spent = h.byMember[m.user_id] || 0;
                      return (
                        <div key={m.user_id} className="flex items-center gap-1.5">
                          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: m.color }} />
                          <span className="text-xs text-muted">
                            {getDisplayName(m.full_name, true)}: R$ {spent.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                  {/* Balance for this month — hide for single-member families without custody */}
                  {members.length >= 2 && h.total > 0 && (custodyEnabled || members.length > 1) && (
                    <div className="mt-2 pt-2 border-t border-gray-50">
                      {(() => {
                        const m0 = members[0];
                        let m0ShouldPay = 0;
                        h.expenses.forEach((e) => {
                          m0ShouldPay += getExpenseSplitShare(e, m0.user_id, members);
                        });
                        const m0Spent = h.byMember[m0.user_id] || 0;
                        const diff = Math.round((m0Spent - m0ShouldPay) * 100) / 100;
                        if (Math.abs(diff) < 0.01) {
                          return <p className="text-xs text-green-600">{t("financial.balanced")}</p>;
                        }
                        const owes = diff > 0 ? members[1] : members[0];
                        const receives = diff > 0 ? members[0] : members[1];
                        return (
                          <p className="text-xs text-muted">
                            {getDisplayName(owes.full_name, true)} {t("financial.owesVerb")} R$ {Math.abs(diff).toLocaleString("pt-BR", { minimumFractionDigits: 2 })} {t("financial.toWord")} {getDisplayName(receives.full_name, true)}
                          </p>
                        );
                      })()}
                    </div>
                  )}
                </button>
              );
            })
          ) : (
            <div className="bg-white rounded-xl p-8 shadow-sm text-center">
              <p className="text-muted text-sm">{t("financial.noExpensesRecorded")}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
