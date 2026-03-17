"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { EXPENSE_CATEGORIES } from "@/lib/constants";

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
}

const MONTH_NAMES = [
  "Janeiro", "Fevereiro", "Marco", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

export default function FinancialDashboard({ expenses, members, currentUserId, groupId }: Props) {
  const now = new Date();
  const [selectedYear, setSelectedYear] = useState(now.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth());
  const [viewMode, setViewMode] = useState<"dashboard" | "history">("dashboard");

  // Get available months from expenses
  const availableMonths = useMemo(() => {
    const months = new Set<string>();
    expenses.forEach((e) => {
      const d = new Date(e.expense_date + "T12:00:00");
      months.add(`${d.getFullYear()}-${d.getMonth()}`);
    });
    // Always include current month
    months.add(`${now.getFullYear()}-${now.getMonth()}`);
    return Array.from(months)
      .map((m) => {
        const [y, mo] = m.split("-").map(Number);
        return { year: y, month: mo };
      })
      .sort((a, b) => b.year - a.year || b.month - a.month);
  }, [expenses]);

  // Filter expenses for selected month (only approved + pending count toward totals)
  const monthExpenses = useMemo(() => {
    return expenses.filter((e) => {
      const d = new Date(e.expense_date + "T12:00:00");
      return d.getFullYear() === selectedYear && d.getMonth() === selectedMonth;
    });
  }, [expenses, selectedYear, selectedMonth]);

  const countableExpenses = monthExpenses.filter(
    (e) => e.status === "approved" || e.status === "pending"
  );

  // Per-member spending
  const memberSpending = useMemo(() => {
    const spending: Record<string, number> = {};
    members.forEach((m) => { spending[m.user_id] = 0; });
    countableExpenses.forEach((e) => {
      spending[e.paid_by] = (spending[e.paid_by] || 0) + e.amount;
    });
    return spending;
  }, [countableExpenses, members]);

  const totalMonth = countableExpenses.reduce((sum, e) => sum + e.amount, 0);

  // Balance calculation (50/50 default)
  const balance = useMemo(() => {
    if (members.length < 2) return null;
    const fairShare = totalMonth / 2;
    const m0Spent = memberSpending[members[0].user_id] || 0;
    const m1Spent = memberSpending[members[1].user_id] || 0;
    // Positive means member[1] owes member[0], negative means member[0] owes member[1]
    const diff = m0Spent - fairShare;
    return {
      amount: Math.abs(diff),
      owes: diff > 0 ? members[1] : members[0],
      receives: diff > 0 ? members[0] : members[1],
    };
  }, [memberSpending, members, totalMonth]);

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

  // Monthly history (all months)
  const monthlyHistory = useMemo(() => {
    const history: Record<string, { total: number; byMember: Record<string, number> }> = {};
    expenses
      .filter((e) => e.status === "approved" || e.status === "pending")
      .forEach((e) => {
        const d = new Date(e.expense_date + "T12:00:00");
        const key = `${d.getFullYear()}-${String(d.getMonth()).padStart(2, "0")}`;
        if (!history[key]) {
          history[key] = { total: 0, byMember: {} };
        }
        history[key].total += e.amount;
        history[key].byMember[e.paid_by] = (history[key].byMember[e.paid_by] || 0) + e.amount;
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
    pending: "Pendente",
    approved: "Aprovada",
    rejected: "Rejeitada",
    disputed: "Disputada",
  };

  const statusColors: Record<string, string> = {
    pending: "bg-amber-100 text-amber-700",
    approved: "bg-green-100 text-green-700",
    rejected: "bg-red-100 text-red-700",
    disputed: "bg-orange-100 text-orange-700",
  };

  return (
    <div className="space-y-4">
      {/* View toggle */}
      <div className="flex bg-gray-100 rounded-lg p-1">
        <button
          onClick={() => setViewMode("dashboard")}
          className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors ${
            viewMode === "dashboard" ? "bg-white text-dark shadow-sm" : "text-muted"
          }`}
        >
          Resumo
        </button>
        <button
          onClick={() => setViewMode("history")}
          className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors ${
            viewMode === "history" ? "bg-white text-dark shadow-sm" : "text-muted"
          }`}
        >
          Historico
        </button>
      </div>

      {viewMode === "dashboard" ? (
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
            <p className="text-xs text-muted mb-1">Total do mes</p>
            <p className="text-3xl font-bold text-dark">
              R$ {totalMonth.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
            </p>
            <p className="text-xs text-muted mt-1">{countableExpenses.length} despesas</p>
          </div>

          {/* Per-parent cards */}
          <div className="grid grid-cols-2 gap-3">
            {members.map((m) => {
              const spent = memberSpending[m.user_id] || 0;
              const percentage = totalMonth > 0 ? (spent / totalMonth) * 100 : 0;
              return (
                <div key={m.user_id} className="bg-white rounded-xl p-4 shadow-sm">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: m.color }} />
                    <p className="text-xs text-muted truncate">
                      {m.full_name.split(" ")[0]}
                      {m.user_id === currentUserId ? " (voce)" : ""}
                    </p>
                  </div>
                  <p className="text-xl font-bold text-dark">
                    R$ {spent.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                  </p>
                  {/* Percentage bar */}
                  <div className="mt-2 h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{ width: `${percentage}%`, backgroundColor: m.color }}
                    />
                  </div>
                  <p className="text-xs text-muted mt-1">{percentage.toFixed(0)}% do total</p>
                </div>
              );
            })}
          </div>

          {/* Balance */}
          {balance && balance.amount > 0.01 && (
            <div className="bg-white rounded-xl p-4 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-amber-50 flex items-center justify-center text-lg">
                  ⚖️
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-dark">
                    {balance.owes.full_name.split(" ")[0]} deve{" "}
                    <span className="text-primary font-bold">
                      R$ {balance.amount.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                    </span>{" "}
                    para {balance.receives.full_name.split(" ")[0]}
                  </p>
                  <p className="text-xs text-muted">Baseado na divisao 50/50</p>
                </div>
              </div>
            </div>
          )}

          {/* Category breakdown */}
          {categoryBreakdown.length > 0 && (
            <div className="bg-white rounded-xl p-4 shadow-sm">
              <h3 className="text-sm font-semibold text-dark mb-3">Por categoria</h3>
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
              <h3 className="text-sm font-semibold text-dark px-4 pt-4 pb-2">Despesas do mes</h3>
              <div className="divide-y divide-gray-50">
                {monthExpenses.map((e) => {
                  const cat = EXPENSE_CATEGORIES.find((c) => c.value === e.category);
                  const member = members.find((m) => m.user_id === e.paid_by);
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
              <p className="text-muted text-sm">Nenhuma despesa neste mes.</p>
            </div>
          )}

          {/* Add expense shortcut */}
          <Link
            href="/despesas/nova"
            className="block w-full py-4 bg-primary text-white font-semibold rounded-xl hover:bg-primary-dark transition-colors text-center text-lg"
          >
            + Nova Despesa
          </Link>
        </>
      ) : (
        /* History view */
        <div className="space-y-3">
          {monthlyHistory.length > 0 ? (
            monthlyHistory.map((h) => {
              const fairShare = h.total / 2;
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
                            {m.full_name.split(" ")[0]}: R$ {spent.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                  {/* Balance for this month */}
                  {members.length >= 2 && h.total > 0 && (
                    <div className="mt-2 pt-2 border-t border-gray-50">
                      {(() => {
                        const m0Spent = h.byMember[members[0].user_id] || 0;
                        const diff = m0Spent - fairShare;
                        if (Math.abs(diff) < 0.01) {
                          return <p className="text-xs text-green-600">Equilibrado</p>;
                        }
                        const owes = diff > 0 ? members[1] : members[0];
                        const receives = diff > 0 ? members[0] : members[1];
                        return (
                          <p className="text-xs text-muted">
                            {owes.full_name.split(" ")[0]} deve R$ {Math.abs(diff).toLocaleString("pt-BR", { minimumFractionDigits: 2 })} para {receives.full_name.split(" ")[0]}
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
              <p className="text-muted text-sm">Nenhuma despesa registrada ainda.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
