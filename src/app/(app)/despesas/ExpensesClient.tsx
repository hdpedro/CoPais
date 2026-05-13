"use client";

import { useState, useMemo, useEffect, useTransition } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useI18n } from "@/i18n/provider";
import { EXPENSE_CATEGORIES } from "@/lib/constants";
import { trackEvent, EVENTS } from "@/lib/analytics";
import {
  updateExpenseStatus,
  markExpenseRead,
  requestCancelExpense,
  respondToCancelRequest,
  reopenApproval,
} from "@/actions/expenses";
import RejectExpenseButton from "./RejectExpenseButton";
import DeleteExpenseButton from "./DeleteExpenseButton";
import ReceiptViewer from "./ReceiptViewer";
import ExpenseEditModal from "./ExpenseEditModal";
import ExpenseHistoryPanel from "./ExpenseHistoryPanel";

/* ─── Types ─────────────────────────────────────────────── */

export interface SerializedExpense {
  id: string;
  description: string;
  amount: number;
  category: string;
  status: string;
  priority: "info" | "important" | "urgent";
  expense_date: string;
  paid_by: string;
  receipt_url: string | null;
  rejection_reason: string | null;
  approved_by: string | null;
  approved_at: string | null;
  rejected_by: string | null;
  rejected_at: string | null;
  cancel_requested_by: string | null;
  cancel_requested_at: string | null;
  cancel_reason: string | null;
  cancelled_by: string | null;
  cancelled_at: string | null;
  edited_at: string | null;
  edit_count: number;
  child_id: string | null;
  paid_by_name: string;
  child_name: string | null;
}

interface ReadReceipt {
  expense_id: string;
  user_id: string;
  read_at: string;
}

interface MemberInfo {
  user_id: string;
  name: string;
}

interface ChildOption {
  id: string;
  full_name: string;
}

interface ExpensesClientProps {
  expenses: SerializedExpense[];
  reads: ReadReceipt[];
  members: MemberInfo[];
  childrenList: ChildOption[];
  total: number;
  pending: number;
  rejected: number;
  isReadonly: boolean;
  currentUserId: string;
  successMessage?: string;
  errorMessage?: string;
}

type StatusFilter = "all" | "pending" | "approved" | "rejected" | "cancelled";

/* ─── Helpers ───────────────────────────────────────────── */

const PRIORITY_META: Record<
  "info" | "important" | "urgent",
  { chipBg: string; chipText: string; border: string; rank: number }
> = {
  info: { chipBg: "bg-gray-100", chipText: "text-gray-600", border: "border-transparent", rank: 0 },
  important: { chipBg: "bg-amber-100", chipText: "text-amber-800", border: "border-amber-300", rank: 1 },
  urgent: { chipBg: "bg-red-100", chipText: "text-red-700", border: "border-red-400", rank: 2 },
};

function formatReadAt(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMin = Math.floor((now.getTime() - d.getTime()) / 60000);
  if (diffMin < 1) return "agora";
  if (diffMin < 60) return `há ${diffMin}min`;
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
}

function monthKey(isoDate: string): string {
  return isoDate.slice(0, 7); // "YYYY-MM"
}

function monthLabel(key: string): string {
  const [y, m] = key.split("-").map(Number);
  const months = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
  const now = new Date();
  const isCurrent = y === now.getFullYear() && m === now.getMonth() + 1;
  if (isCurrent) return "Este mês";
  return `${months[m - 1]}/${y}`;
}

/* ─── Component ─────────────────────────────────────────── */

export default function ExpensesClient({
  expenses,
  reads,
  members,
  childrenList,
  total,
  pending,
  rejected,
  isReadonly,
  currentUserId,
  successMessage,
  errorMessage,
}: ExpensesClientProps) {
  const { t } = useI18n();
  const searchParams = useSearchParams();
  const highlightId = searchParams.get("highlight");
  const [isPending, startTransition] = useTransition();

  const [filter, setFilter] = useState<StatusFilter>("all");
  const [expandedId, setExpandedId] = useState<string | null>(highlightId);
  const [optimisticReads, setOptimisticReads] = useState<Set<string>>(new Set());

  // Edit modal state
  const [editingExpense, setEditingExpense] = useState<SerializedExpense | null>(null);

  // Cancel/Reopen modal state
  const [cancelingExpense, setCancelingExpense] = useState<SerializedExpense | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [reopeningExpense, setReopeningExpense] = useState<SerializedExpense | null>(null);
  const [reopenReason, setReopenReason] = useState("");
  const [respondingCancel, setRespondingCancel] = useState<SerializedExpense | null>(null);
  const [respondCancelApproved, setRespondCancelApproved] = useState<boolean | null>(null);
  const [respondCancelReason, setRespondCancelReason] = useState("");

  // Index reads by expense_id for O(1) lookup.
  const readsByExpenseId = useMemo(() => {
    const map = new Map<string, ReadReceipt[]>();
    for (const r of reads) {
      const arr = map.get(r.expense_id) || [];
      arr.push(r);
      map.set(r.expense_id, arr);
    }
    return map;
  }, [reads]);

  const memberById = useMemo(() => {
    const map = new Map<string, string>();
    for (const m of members) map.set(m.user_id, m.name);
    return map;
  }, [members]);

  function isUnread(e: SerializedExpense): boolean {
    if (optimisticReads.has(e.id)) return false;
    const arr = readsByExpenseId.get(e.id) || [];
    return !arr.some((r) => r.user_id === currentUserId);
  }

  function coparentReaders(e: SerializedExpense): ReadReceipt[] {
    const arr = readsByExpenseId.get(e.id) || [];
    return arr.filter((r) => r.user_id !== currentUserId);
  }

  // Open/expand card. Marks as read on first open. NEVER on scroll/mount.
  function handleOpenCard(e: SerializedExpense) {
    const wasExpanded = expandedId === e.id;
    setExpandedId(wasExpanded ? null : e.id);
    if (wasExpanded) return;
    if (isUnread(e)) {
      setOptimisticReads((prev) => new Set(prev).add(e.id));
      void markExpenseRead(e.id);
    }
  }

  // Deep link from push → auto-mark read.
  // Single-shot per highlightId — runs once when arriving via ?highlight=.
  useEffect(() => {
    if (!highlightId) return;
    trackEvent(EVENTS.NOTIFICATION_OPENED, { record_type: "expense", record_id: highlightId });
    const target = expenses.find((e) => e.id === highlightId);
    if (target && isUnread(target)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setOptimisticReads((prev) => new Set(prev).add(highlightId));
      void markExpenseRead(highlightId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [highlightId]);

  // Snapshot unread count for dashboard funnel metric.
  const unreadCount = useMemo(
    () => expenses.filter((e) => e.status !== "cancelled" && e.status !== "rejected" && isUnread(e)).length,
    [expenses, optimisticReads, readsByExpenseId],  // eslint-disable-line react-hooks/exhaustive-deps
  );
  useEffect(() => {
    trackEvent(EVENTS.UNREAD_COUNT, { record_type: "expense", count: unreadCount });
  }, [unreadCount]);

  /* ─── Filtered + sorted list, grouped by month ─────────── */

  // Filter by status, then sort: unread DESC → priority DESC → date DESC.
  const visibleExpenses = useMemo(() => {
    const base = expenses.filter((e) => {
      if (filter === "all") return e.status !== "cancelled"; // cancelled fica em aba própria
      if (filter === "cancelled") return e.status === "cancelled" || e.status === "cancel_pending";
      return e.status === filter;
    });
    return [...base].sort((a, b) => {
      const ua = isUnread(a) ? 1 : 0;
      const ub = isUnread(b) ? 1 : 0;
      if (ua !== ub) return ub - ua;
      const pa = PRIORITY_META[a.priority]?.rank ?? 0;
      const pb = PRIORITY_META[b.priority]?.rank ?? 0;
      if (pa !== pb) return pb - pa;
      return b.expense_date.localeCompare(a.expense_date);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expenses, filter, optimisticReads, readsByExpenseId]);

  // Group by month (YYYY-MM).
  const groupedByMonth = useMemo(() => {
    const groups: Array<{ key: string; label: string; items: SerializedExpense[]; total: number }> = [];
    const map = new Map<string, SerializedExpense[]>();
    for (const e of visibleExpenses) {
      const k = monthKey(e.expense_date);
      const arr = map.get(k) || [];
      arr.push(e);
      map.set(k, arr);
    }
    // Map iteration preserves insertion order — visibleExpenses já vem ordenada
    // por data DESC, então o primeiro mês é o mais recente.
    for (const [k, items] of map) {
      const monthTotal = items
        .filter((e) => e.status === "approved" || e.status === "pending")
        .reduce((s, e) => s + e.amount, 0);
      groups.push({ key: k, label: monthLabel(k), items, total: monthTotal });
    }
    return groups;
  }, [visibleExpenses]);

  /* ─── Action handlers ──────────────────────────────────── */

  function openCancelModal(e: SerializedExpense) {
    setCancelingExpense(e);
    setCancelReason("");
  }

  function openReopenModal(e: SerializedExpense) {
    setReopeningExpense(e);
    setReopenReason("");
  }

  function openRespondCancelModal(e: SerializedExpense) {
    setRespondingCancel(e);
    setRespondCancelApproved(null);
    setRespondCancelReason("");
  }

  function handleSubmitCancel() {
    if (!cancelingExpense) return;
    if (!cancelReason.trim()) return;
    const expenseId = cancelingExpense.id;
    const reason = cancelReason.trim();
    startTransition(async () => {
      const fd = new FormData();
      fd.append("expenseId", expenseId);
      fd.append("reason", reason);
      const result = await requestCancelExpense(fd);
      if (result.success) {
        setCancelingExpense(null);
      } else {
        alert(result.error || "Falha ao cancelar.");
      }
    });
  }

  function handleSubmitReopen() {
    if (!reopeningExpense) return;
    if (!reopenReason.trim()) return;
    const expenseId = reopeningExpense.id;
    const reason = reopenReason.trim();
    startTransition(async () => {
      const fd = new FormData();
      fd.append("expenseId", expenseId);
      fd.append("reason", reason);
      const result = await reopenApproval(fd);
      if (result.success) {
        setReopeningExpense(null);
      } else {
        alert(result.error || "Falha ao reabrir.");
      }
    });
  }

  function handleSubmitRespondCancel() {
    if (!respondingCancel || respondCancelApproved === null) return;
    const expenseId = respondingCancel.id;
    const approved = respondCancelApproved;
    const reason = respondCancelReason.trim();
    startTransition(async () => {
      const fd = new FormData();
      fd.append("expenseId", expenseId);
      fd.append("approved", approved ? "true" : "false");
      if (reason) fd.append("reason", reason);
      const result = await respondToCancelRequest(fd);
      if (result.success) {
        setRespondingCancel(null);
      } else {
        alert(result.error || "Falha ao responder.");
      }
    });
  }

  /* ─── Render ────────────────────────────────────────────── */

  return (
    <div className="space-y-6 pb-20">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-bold text-dark">{t("expenses.title")}</h1>
          {unreadCount > 0 && (
            <span
              className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-[#C07055] text-white text-[11px] font-bold leading-none"
              aria-label={`${unreadCount} ${unreadCount === 1 ? "nova" : "novas"}`}
            >
              {unreadCount}
            </span>
          )}
        </div>
        {!isReadonly && (
          <Link
            href="/despesas/nova"
            className="px-4 py-2 bg-primary text-white text-sm font-semibold rounded-lg hover:bg-primary-dark transition-colors"
          >
            {t("expensesPage.newButton")}
          </Link>
        )}
      </div>

      {/* Success message */}
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

      {/* Summary cards */}
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

      {/* Filter chips */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {(
          [
            { v: "all", label: "Tudo" },
            { v: "pending", label: "Pendentes" },
            { v: "approved", label: "Aprovadas" },
            { v: "rejected", label: "Rejeitadas" },
            { v: "cancelled", label: "Canceladas" },
          ] as const
        ).map((f) => (
          <button
            key={f.v}
            type="button"
            onClick={() => setFilter(f.v)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
              filter === f.v
                ? "bg-[#2E7268] text-white"
                : "bg-white text-dark border border-gray-200 hover:border-[#2E7268]/40"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Grouped list by month */}
      {groupedByMonth.length > 0 ? (
        <div className="space-y-6">
          {groupedByMonth.map((group) => (
            <div key={group.key} className="space-y-2">
              <div className="flex items-center justify-between px-1">
                <p className="text-[11px] font-bold text-muted uppercase tracking-wider">{group.label}</p>
                <p className="text-[11px] text-muted">
                  Total: <span className="font-semibold text-dark">R$ {group.total.toFixed(2)}</span>
                </p>
              </div>
              {group.items.map((expense) => (
                <ExpenseCard
                  key={expense.id}
                  expense={expense}
                  isOwnExpense={expense.paid_by === currentUserId}
                  isReadonly={isReadonly}
                  unread={isUnread(expense)}
                  expanded={expandedId === expense.id}
                  highlighted={highlightId === expense.id}
                  readers={coparentReaders(expense)}
                  memberById={memberById}
                  isPending={isPending}
                  onOpenCard={handleOpenCard}
                  onEdit={() => setEditingExpense(expense)}
                  onCancel={() => openCancelModal(expense)}
                  onReopen={() => openReopenModal(expense)}
                  onRespondCancel={() => openRespondCancelModal(expense)}
                />
              ))}
            </div>
          ))}
        </div>
      ) : (
        <div className="bg-white rounded-xl p-8 shadow-sm text-center">
          <p className="text-muted">{t("expensesPage.noExpenses")}</p>
          {!isReadonly && (
            <Link href="/despesas/nova" className="text-primary font-medium mt-2 inline-block">
              {t("expensesPage.addExpense")}
            </Link>
          )}
        </div>
      )}

      {/* ─── Modals ─── */}
      {editingExpense && (
        <ExpenseEditModal
          expense={editingExpense}
          childrenList={childrenList}
          onClose={() => setEditingExpense(null)}
        />
      )}

      {cancelingExpense && (
        <SimpleReasonModal
          title={
            cancelingExpense.status === "approved"
              ? "Pedir cancelamento"
              : "Cancelar despesa"
          }
          description={
            cancelingExpense.status === "approved"
              ? `Esta despesa já foi aprovada por ${memberById.get(cancelingExpense.approved_by || "") || "o coparente"}. Vai precisar da concordância dele pra cancelar.`
              : "Esta ação cancela a despesa. Audit trail preserva o registro."
          }
          submitLabel="Confirmar"
          submitting={isPending}
          reason={cancelReason}
          onReason={setCancelReason}
          onSubmit={handleSubmitCancel}
          onClose={() => setCancelingExpense(null)}
          required
        />
      )}

      {reopeningExpense && (
        <SimpleReasonModal
          title="Reabrir aprovação"
          description="A despesa volta a 'pendente' e o criador pode editar antes de você aprovar de novo. Disponível por 24h após a aprovação."
          submitLabel="Reabrir"
          submitting={isPending}
          reason={reopenReason}
          onReason={setReopenReason}
          onSubmit={handleSubmitReopen}
          onClose={() => setReopeningExpense(null)}
          required
        />
      )}

      {respondingCancel && (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center bg-black/40 p-0 sm:p-4">
          <div className="bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl shadow-2xl p-5 space-y-4">
            <div className="flex justify-between items-start">
              <div>
                <h3 className="text-lg font-bold text-dark">Responder pedido de cancelamento</h3>
                <p className="text-xs text-muted mt-1">
                  {memberById.get(respondingCancel.paid_by) || "Coparente"} quer cancelar:{" "}
                  <strong>{respondingCancel.description}</strong> · R$ {respondingCancel.amount.toFixed(2)}
                </p>
              </div>
              <button type="button" onClick={() => setRespondingCancel(null)} className="text-muted hover:text-dark text-xl leading-none">
                ×
              </button>
            </div>

            {respondingCancel.cancel_reason && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                <p className="text-[11px] font-semibold text-amber-700 uppercase">Motivo</p>
                <p className="text-sm text-amber-900 mt-1">{respondingCancel.cancel_reason}</p>
              </div>
            )}

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setRespondCancelApproved(true)}
                className={`px-3 py-2 rounded-lg border text-sm font-medium ${
                  respondCancelApproved === true
                    ? "border-[#2E7268] bg-[#2E7268]/10 text-[#2E7268]"
                    : "border-gray-200 text-gray-600"
                }`}
              >
                ✅ Concordo (cancelar)
              </button>
              <button
                type="button"
                onClick={() => setRespondCancelApproved(false)}
                className={`px-3 py-2 rounded-lg border text-sm font-medium ${
                  respondCancelApproved === false
                    ? "border-red-400 bg-red-50 text-red-700"
                    : "border-gray-200 text-gray-600"
                }`}
              >
                ❌ Não concordo (manter)
              </button>
            </div>

            {respondCancelApproved === false && (
              <div>
                <label className="text-xs text-muted">Motivo (opcional)</label>
                <textarea
                  value={respondCancelReason}
                  onChange={(e) => setRespondCancelReason(e.target.value)}
                  rows={2}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
                  placeholder="Por que você não concorda?"
                />
              </div>
            )}

            <button
              type="button"
              onClick={handleSubmitRespondCancel}
              disabled={isPending || respondCancelApproved === null}
              className="w-full py-2.5 bg-primary text-white text-sm font-semibold rounded-lg disabled:opacity-50"
            >
              {isPending ? "Enviando..." : "Enviar resposta"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── ExpenseCard ─────────────────────────────────────────── */

function ExpenseCard({
  expense,
  isOwnExpense,
  isReadonly,
  unread,
  expanded,
  highlighted,
  readers,
  memberById,
  isPending,
  onOpenCard,
  onEdit,
  onCancel,
  onReopen,
  onRespondCancel,
}: {
  expense: SerializedExpense;
  isOwnExpense: boolean;
  isReadonly: boolean;
  unread: boolean;
  expanded: boolean;
  highlighted: boolean;
  readers: ReadReceipt[];
  memberById: Map<string, string>;
  isPending: boolean;
  onOpenCard: (e: SerializedExpense) => void;
  onEdit: () => void;
  onCancel: () => void;
  onReopen: () => void;
  onRespondCancel: () => void;
}) {
  const { t } = useI18n();
  const cat = EXPENSE_CATEGORIES.find((c) => c.value === expense.category);
  const priorityMeta = PRIORITY_META[expense.priority];

  // Within 24h reopen window for original approver. Snapshot the mount
  // time once (lazy initializer = pure) — react-hooks/purity proibe
  // Date.now() em render. Server-side é a fonte da verdade; esse check
  // só esconde o botão pra UX, reopen >24h falha no service.
  const [mountTime] = useState(() => Date.now());
  const canReopen =
    expense.status === "approved" &&
    expense.approved_by &&
    expense.approved_at &&
    mountTime - new Date(expense.approved_at).getTime() < 24 * 60 * 60 * 1000;

  const statusLabels: Record<string, string> = {
    pending: "Pendente",
    approved: "Aprovada",
    rejected: "Rejeitada",
    cancelled: "Cancelada",
    cancel_pending: "Cancelamento pendente",
  };
  const statusColors: Record<string, string> = {
    pending: "bg-amber-100 text-amber-700",
    approved: "bg-emerald-100 text-emerald-700",
    rejected: "bg-red-100 text-red-700",
    cancelled: "bg-gray-200 text-gray-600",
    cancel_pending: "bg-amber-100 text-amber-700",
  };

  return (
    <div
      onClick={() => onOpenCard(expense)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpenCard(expense);
        }
      }}
      className={[
        "rounded-xl p-4 shadow-sm transition-all cursor-pointer border-l-4 outline-none",
        unread ? "bg-[#FFF8F4]" : "bg-white",
        unread ? "border-[#C07055]" : priorityMeta.border,
        expense.status === "cancelled" ? "opacity-60" : "",
        highlighted ? "ring-2 ring-[#C07055] ring-offset-2" : "",
        "hover:shadow-md focus-visible:ring-2 focus-visible:ring-[#2E7268]",
      ].join(" ")}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <span className="text-xl flex-shrink-0">{cat?.icon || "📦"}</span>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className={`font-medium text-dark text-sm ${expense.status === "cancelled" ? "line-through" : ""}`}>
                {expense.description}
              </p>
              {unread && (
                <span className="text-[10px] font-bold text-white bg-[#C07055] px-1.5 py-0.5 rounded-full">Novo</span>
              )}
              {expense.priority !== "info" && (
                <span
                  className={`text-[10px] font-bold ${priorityMeta.chipBg} ${priorityMeta.chipText} px-1.5 py-0.5 rounded-full uppercase tracking-wide`}
                >
                  {expense.priority === "urgent" ? "Urgente" : "Importante"}
                </span>
              )}
              {expense.edit_count > 0 && (
                <span className="text-[10px] font-medium text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded-full">
                  editada
                </span>
              )}
            </div>
            <p className="text-xs text-muted">
              {expense.paid_by_name} · {new Date(expense.expense_date + "T12:00:00").toLocaleDateString("pt-BR")}
              {expense.child_name ? ` · ${expense.child_name}` : ""}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {expense.receipt_url && (
            <span onClick={(e) => e.stopPropagation()}>
              <ReceiptViewer expenseId={expense.id} url={expense.receipt_url} />
            </span>
          )}
          <div className="text-right">
            <p className="font-semibold text-dark">R$ {expense.amount.toFixed(2)}</p>
            <span className={`text-xs px-2 py-0.5 rounded-full ${statusColors[expense.status] || statusColors.pending}`}>
              {statusLabels[expense.status] || expense.status}
            </span>
          </div>
        </div>
      </div>

      {/* Quick state info — always visible */}
      {expense.status === "rejected" && expense.rejection_reason && (
        <div className="mt-2 px-3 py-2 bg-error/5 rounded-lg">
          <p className="text-xs text-error font-medium">{t("expensesPage.reason")}: {expense.rejection_reason}</p>
        </div>
      )}
      {expense.status === "approved" && expense.approved_by && expense.approved_at && (
        <p className="text-[11px] text-emerald-700 mt-2">
          Aprovada por {memberById.get(expense.approved_by) || "coparente"} · {formatReadAt(expense.approved_at)}
        </p>
      )}
      {expense.status === "cancel_pending" && expense.cancel_requested_by && (
        <div className="mt-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg">
          <p className="text-xs font-medium text-amber-800">
            {memberById.get(expense.cancel_requested_by) || "Coparente"} pediu cancelamento
          </p>
          {expense.cancel_reason && (
            <p className="text-xs text-amber-700 mt-0.5">Motivo: {expense.cancel_reason}</p>
          )}
        </div>
      )}

      {/* Quick actions for pending — visible without expanding */}
      {!isReadonly && !isOwnExpense && expense.status === "pending" && (
        <div className="flex gap-2 mt-3 pt-3 border-t border-gray-100" onClick={(e) => e.stopPropagation()}>
          <form action={updateExpenseStatus} className="flex-1">
            <input type="hidden" name="expenseId" value={expense.id} />
            <input type="hidden" name="status" value="approved" />
            <button
              type="submit"
              className="w-full py-2 text-sm font-medium text-success bg-success/10 rounded-lg hover:bg-success/20"
            >
              {t("expensesPage.approve")}
            </button>
          </form>
          <div className="flex-1">
            <RejectExpenseButton expenseId={expense.id} />
          </div>
        </div>
      )}

      {/* Cancel response buttons — visible when other party requested cancel */}
      {!isReadonly && !isOwnExpense && expense.status === "cancel_pending" && (
        <div className="mt-3 pt-3 border-t border-amber-100" onClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            onClick={onRespondCancel}
            disabled={isPending}
            className="w-full py-2 text-sm font-medium bg-amber-500 text-white rounded-lg hover:bg-amber-600 transition-colors disabled:opacity-50"
          >
            Responder pedido de cancelamento
          </button>
        </div>
      )}

      {/* Expanded section — actions + audit trail + visto-por */}
      {expanded && (
        <div className="mt-3 pt-3 border-t border-gray-100 space-y-3" onClick={(e) => e.stopPropagation()}>
          {/* Actions by role */}
          {!isReadonly && isOwnExpense && (
            <div className="flex flex-wrap gap-2">
              {/* Edit: pending, rejected, or approved (will revert to pending) */}
              {(expense.status === "pending" ||
                expense.status === "rejected" ||
                expense.status === "approved") && (
                <button
                  type="button"
                  onClick={onEdit}
                  className="text-[12px] font-medium text-[#2E7268] bg-[#2E7268]/10 px-3 py-1.5 rounded-lg hover:bg-[#2E7268]/20"
                >
                  ✏️ Editar
                  {expense.status === "approved" && (
                    <span className="ml-1 text-[10px] text-amber-700">(reverte aprovação)</span>
                  )}
                </button>
              )}
              {/* Cancel: pending / rejected / approved */}
              {(expense.status === "pending" ||
                expense.status === "rejected" ||
                expense.status === "approved") && (
                <button
                  type="button"
                  onClick={onCancel}
                  className="text-[12px] font-medium text-amber-700 bg-amber-50 px-3 py-1.5 rounded-lg hover:bg-amber-100"
                >
                  🚫 Cancelar
                </button>
              )}
              {/* Delete: pending or rejected only */}
              {(expense.status === "pending" || expense.status === "rejected") && (
                <DeleteExpenseButton expenseId={expense.id} />
              )}
            </div>
          )}
          {/* Reopen — only original approver, within 24h */}
          {!isReadonly && canReopen && expense.approved_by === expense.paid_by && null}
          {!isReadonly && canReopen && expense.approved_by !== expense.paid_by && (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={onReopen}
                className="text-[12px] font-medium text-[#C07055] bg-[#C07055]/10 px-3 py-1.5 rounded-lg hover:bg-[#C07055]/20"
              >
                🔄 Reabrir aprovação <span className="text-[10px] opacity-75">(24h)</span>
              </button>
            </div>
          )}

          {/* Read receipts */}
          {readers.length > 0 && (
            <div className="flex flex-wrap gap-x-3 gap-y-0.5">
              {readers.map((r) => (
                <span key={r.user_id} className="text-[11px] text-[#2E7268]">
                  ✓ Visto por {memberById.get(r.user_id) || "coparente"} · {formatReadAt(r.read_at)}
                </span>
              ))}
            </div>
          )}

          {/* Audit trail panel */}
          <ExpenseHistoryPanel expenseId={expense.id} memberById={memberById} />
        </div>
      )}
    </div>
  );
}

/* ─── SimpleReasonModal — reusable bottom sheet for cancel/reopen ─── */

function SimpleReasonModal({
  title,
  description,
  submitLabel,
  submitting,
  reason,
  onReason,
  onSubmit,
  onClose,
  required,
}: {
  title: string;
  description: string;
  submitLabel: string;
  submitting: boolean;
  reason: string;
  onReason: (r: string) => void;
  onSubmit: () => void;
  onClose: () => void;
  required?: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center bg-black/40 p-0 sm:p-4" onClick={onClose}>
      <div
        className="bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl shadow-2xl p-5 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-start">
          <h3 className="text-lg font-bold text-dark">{title}</h3>
          <button type="button" onClick={onClose} className="text-muted hover:text-dark text-xl leading-none">
            ×
          </button>
        </div>
        <p className="text-sm text-muted">{description}</p>
        <div>
          <label className="text-xs text-muted">Motivo {required ? "(obrigatório)" : "(opcional)"}</label>
          <textarea
            value={reason}
            onChange={(e) => onReason(e.target.value)}
            rows={3}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
            placeholder="Explique brevemente"
          />
        </div>
        <button
          type="button"
          onClick={onSubmit}
          disabled={submitting || (required && !reason.trim())}
          className="w-full py-2.5 bg-primary text-white text-sm font-semibold rounded-lg disabled:opacity-50"
        >
          {submitting ? "Enviando..." : submitLabel}
        </button>
      </div>
    </div>
  );
}
