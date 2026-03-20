"use client";

import { useRef, useState, useTransition } from "react";

interface Props {
  groupId: string;
  children: { id: string; full_name: string }[];
  categories: { value: string; label: string; icon: string }[];
  today: string;
  createExpense: (formData: FormData) => Promise<void>;
}

export default function ExpenseFormClient({ groupId, children, categories, today, createExpense }: Props) {
  const [isPending, startTransition] = useTransition();
  const [submitted, setSubmitted] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  const handleSubmit = (formData: FormData) => {
    if (submitted || isPending) return; // Block double submit
    setSubmitted(true);
    startTransition(async () => {
      try {
        await createExpense(formData);
      } catch {
        // If there's an error, allow retry
        setSubmitted(false);
      }
    });
  };

  const isDisabled = isPending || submitted;

  return (
    <form ref={formRef} action={handleSubmit} className="bg-white rounded-xl p-6 shadow-sm space-y-4">
      <input type="hidden" name="groupId" value={groupId} />

      <div>
        <label className="block text-sm font-medium text-dark mb-1">Descricao</label>
        <input type="text" name="description" required placeholder="Ex: Mensalidade escola"
          disabled={isDisabled}
          className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary disabled:opacity-50 disabled:bg-gray-50" />
      </div>

      <div>
        <label className="block text-sm font-medium text-dark mb-1">Valor (R$)</label>
        <input type="number" name="amount" required step="0.01" min="0.01" placeholder="0.00"
          disabled={isDisabled}
          className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary disabled:opacity-50 disabled:bg-gray-50" />
      </div>

      <div>
        <label className="block text-sm font-medium text-dark mb-1">Categoria</label>
        <select name="category" required disabled={isDisabled}
          className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary disabled:opacity-50 disabled:bg-gray-50">
          {categories.map((cat) => (
            <option key={cat.value} value={cat.value}>{cat.icon} {cat.label}</option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium text-dark mb-1">Crianca (opcional)</label>
        <select name="childId" disabled={isDisabled}
          className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary disabled:opacity-50 disabled:bg-gray-50">
          <option value="">Geral</option>
          {children.map((child) => (
            <option key={child.id} value={child.id}>{child.full_name}</option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium text-dark mb-1">Data</label>
        <input type="date" name="expenseDate" required defaultValue={today}
          disabled={isDisabled}
          className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary disabled:opacity-50 disabled:bg-gray-50" />
      </div>

      <button
        type="submit"
        disabled={isDisabled}
        className="w-full py-3 bg-primary text-white font-semibold rounded-lg hover:bg-primary-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
      >
        {isDisabled ? (
          <>
            <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Registrando...
          </>
        ) : (
          "Registrar Despesa"
        )}
      </button>

      {submitted && isPending && (
        <p className="text-center text-sm text-muted">Aguarde, salvando despesa...</p>
      )}
    </form>
  );
}
