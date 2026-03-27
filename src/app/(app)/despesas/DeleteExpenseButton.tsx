"use client";

import { useState, useTransition } from "react";
import { deleteExpense } from "@/actions/expenses";
import { useI18n } from "@/i18n/provider";

interface Props {
  expenseId: string;
}

export default function DeleteExpenseButton({ expenseId }: Props) {
  const { t } = useI18n();
  const [confirming, setConfirming] = useState(false);
  const [isPending, startTransition] = useTransition();

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="w-full py-2 text-sm font-medium text-error bg-error/5 rounded-lg hover:bg-error/10 transition-colors flex items-center justify-center gap-2"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
        </svg>
        {t("expenseForm.deleteExpense")}
      </button>
    );
  }

  const handleDelete = () => {
    const formData = new FormData();
    formData.set("expenseId", expenseId);
    startTransition(async () => {
      await deleteExpense(formData);
    });
  };

  return (
    <div className="flex gap-2">
      <button
        type="button"
        onClick={() => setConfirming(false)}
        disabled={isPending}
        className="flex-1 py-2 text-sm font-medium text-muted bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors disabled:opacity-50"
      >
        {t("common.cancel")}
      </button>
      <button
        type="button"
        onClick={handleDelete}
        disabled={isPending}
        className="flex-1 py-2 text-sm font-medium text-white bg-error rounded-lg hover:bg-error/90 transition-colors disabled:opacity-50 flex items-center justify-center gap-1"
      >
        {isPending ? (
          <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        ) : null}
        {t("expenseForm.confirmDelete")}
      </button>
    </div>
  );
}
