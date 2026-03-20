"use client";

import { useRef, useState, useTransition, useMemo } from "react";

interface Props {
  groupId: string;
  children: { id: string; full_name: string }[];
  categories: { value: string; label: string; icon: string }[];
  today: string;
  createExpense: (formData: FormData) => Promise<void>;
  members: { user_id: string; full_name: string }[];
  currentUserId: string;
}

type SplitMode = "equal" | "custom" | "solo";

export default function ExpenseFormClient({ groupId, children, categories, today, createExpense, members, currentUserId }: Props) {
  const [isPending, startTransition] = useTransition();
  const [submitted, setSubmitted] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const [splitMode, setSplitMode] = useState<SplitMode>("equal");
  const [customPercent, setCustomPercent] = useState(50);

  const otherMember = members.find((m) => m.user_id !== currentUserId);

  const splitRatioJson = useMemo(() => {
    if (members.length < 2 || !otherMember) return null;
    if (splitMode === "equal") {
      return JSON.stringify({ [currentUserId]: 50, [otherMember.user_id]: 50 });
    }
    if (splitMode === "solo") {
      return JSON.stringify({ [currentUserId]: 100, [otherMember.user_id]: 0 });
    }
    // custom
    return JSON.stringify({ [currentUserId]: customPercent, [otherMember.user_id]: 100 - customPercent });
  }, [splitMode, customPercent, members, currentUserId, otherMember]);

  const handleSubmit = (formData: FormData) => {
    if (submitted || isPending) return;
    setSubmitted(true);
    startTransition(async () => {
      try {
        await createExpense(formData);
      } catch {
        setSubmitted(false);
      }
    });
  };

  const isDisabled = isPending || submitted;

  return (
    <form ref={formRef} action={handleSubmit} className="bg-white rounded-xl p-6 shadow-sm space-y-4">
      <input type="hidden" name="groupId" value={groupId} />
      {splitRatioJson && <input type="hidden" name="splitRatio" value={splitRatioJson} />}

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

      {/* Split ratio selector */}
      {members.length >= 2 && otherMember && (
        <div>
          <label className="block text-sm font-medium text-dark mb-2">Divisao da despesa</label>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={isDisabled}
              onClick={() => setSplitMode("equal")}
              className={`flex-1 py-2 px-3 text-sm font-medium rounded-lg border transition-colors ${
                splitMode === "equal"
                  ? "bg-primary/10 border-primary text-primary"
                  : "border-gray-200 text-muted hover:bg-gray-50"
              } disabled:opacity-50`}
            >
              50/50
            </button>
            <button
              type="button"
              disabled={isDisabled}
              onClick={() => setSplitMode("custom")}
              className={`flex-1 py-2 px-3 text-sm font-medium rounded-lg border transition-colors ${
                splitMode === "custom"
                  ? "bg-primary/10 border-primary text-primary"
                  : "border-gray-200 text-muted hover:bg-gray-50"
              } disabled:opacity-50`}
            >
              Personalizado
            </button>
            <button
              type="button"
              disabled={isDisabled}
              onClick={() => setSplitMode("solo")}
              className={`flex-1 py-2 px-3 text-sm font-medium rounded-lg border transition-colors ${
                splitMode === "solo"
                  ? "bg-primary/10 border-primary text-primary"
                  : "border-gray-200 text-muted hover:bg-gray-50"
              } disabled:opacity-50`}
            >
              100% meu
            </button>
          </div>

          {splitMode === "custom" && (
            <div className="mt-3 space-y-2">
              <input
                type="range"
                min="10"
                max="90"
                step="5"
                value={customPercent}
                onChange={(e) => setCustomPercent(Number(e.target.value))}
                disabled={isDisabled}
                className="w-full accent-primary"
              />
              <div className="flex justify-between text-xs">
                <span className="text-primary font-medium">
                  Voce: {customPercent}%
                </span>
                <span className="text-muted font-medium">
                  {otherMember.full_name.split(" ")[0]}: {100 - customPercent}%
                </span>
              </div>
            </div>
          )}

          {splitMode === "solo" && (
            <p className="mt-2 text-xs text-muted">
              Esta despesa nao sera dividida com {otherMember.full_name.split(" ")[0]}.
            </p>
          )}
        </div>
      )}

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
