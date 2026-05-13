"use client";

/**
 * Modal de edição de despesa. Suporta:
 *   - Edit livre quando status é 'pending' ou 'rejected'
 *   - Edit de 'approved' com aviso: aprovação será revertida
 *
 * Submete via action `editExpense` — service valida tudo server-side.
 */

import { useState, useTransition } from "react";
import { editExpense } from "@/actions/expenses";
import { EXPENSE_CATEGORIES } from "@/lib/constants";
import type { SerializedExpense } from "./ExpensesClient";

interface ExpenseEditModalProps {
  expense: SerializedExpense;
  childrenList: Array<{ id: string; full_name: string }>;
  onClose: () => void;
}

export default function ExpenseEditModal({ expense, childrenList, onClose }: ExpenseEditModalProps) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [description, setDescription] = useState(expense.description);
  const [amount, setAmount] = useState(expense.amount.toString());
  const [category, setCategory] = useState(expense.category);
  const [expenseDate, setExpenseDate] = useState(expense.expense_date);
  const [childId, setChildId] = useState<string | null>(expense.child_id);
  const [priority, setPriority] = useState<"info" | "important" | "urgent">(expense.priority);

  const willRevertApproval = expense.status === "approved";

  function handleSubmit() {
    const amt = parseFloat(amount);
    if (!description.trim()) {
      setError("Descrição obrigatória.");
      return;
    }
    if (!Number.isFinite(amt) || amt <= 0) {
      setError("Valor inválido.");
      return;
    }
    setError(null);

    const fd = new FormData();
    fd.append("expenseId", expense.id);
    fd.append("description", description.trim());
    fd.append("amount", String(amt));
    fd.append("category", category);
    fd.append("expenseDate", expenseDate);
    fd.append("childId", childId ?? "");
    fd.append("priority", priority);

    startTransition(async () => {
      const result = await editExpense(fd);
      if (result.success) {
        onClose();
      } else {
        setError(result.error || "Falha ao salvar edição.");
      }
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center sm:items-center bg-black/40 p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        className="bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl shadow-2xl p-5 space-y-3 max-h-[92vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-start">
          <h3 className="text-lg font-bold text-dark">Editar despesa</h3>
          <button type="button" onClick={onClose} className="text-muted hover:text-dark text-xl leading-none">
            ×
          </button>
        </div>

        {willRevertApproval && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
            <p className="text-xs font-semibold text-amber-800">
              ⚠️ Esta despesa já foi aprovada
            </p>
            <p className="text-xs text-amber-700 mt-1">
              Qualquer mudança vai REVERTER a aprovação. O coparente precisará reaprovar.
            </p>
          </div>
        )}

        <div>
          <label className="block text-xs font-medium text-dark mb-1">Descrição</label>
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={200}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#2E7268]/30"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-dark mb-1">Valor</label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#2E7268]/30"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-dark mb-1">Data</label>
            <input
              type="date"
              value={expenseDate}
              onChange={(e) => setExpenseDate(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#2E7268]/30"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-dark mb-1">Categoria</label>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#2E7268]/30"
          >
            {EXPENSE_CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.icon} {c.label}
              </option>
            ))}
          </select>
        </div>

        {childrenList.length > 0 && (
          <div>
            <label className="block text-xs font-medium text-dark mb-1">Criança (opcional)</label>
            <select
              value={childId ?? ""}
              onChange={(e) => setChildId(e.target.value || null)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#2E7268]/30"
            >
              <option value="">— Nenhuma —</option>
              {childrenList.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.full_name}
                </option>
              ))}
            </select>
          </div>
        )}

        <div>
          <label className="block text-xs font-medium text-dark mb-1">Prioridade</label>
          <div className="grid grid-cols-3 gap-2" role="radiogroup">
            {(["info", "important", "urgent"] as const).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setPriority(p)}
                className={`px-2 py-2 rounded-lg border text-xs font-medium ${
                  priority === p
                    ? "border-[#2E7268] bg-[#2E7268]/10 text-[#2E7268]"
                    : "border-gray-200 text-gray-600"
                }`}
              >
                {p === "info" ? "Info" : p === "important" ? "Importante" : "Urgente"}
              </button>
            ))}
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-2">
            <p className="text-xs text-red-700">{error}</p>
          </div>
        )}

        <button
          type="button"
          onClick={handleSubmit}
          disabled={isPending}
          className="w-full py-2.5 bg-primary text-white text-sm font-semibold rounded-lg disabled:opacity-50"
        >
          {isPending ? "Salvando..." : "Salvar"}
        </button>
      </div>
    </div>
  );
}
