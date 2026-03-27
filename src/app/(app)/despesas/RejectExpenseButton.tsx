"use client";

import { useState, useTransition } from "react";
import { updateExpenseStatus } from "@/actions/expenses";
import { useI18n } from "@/i18n/provider";

interface Props {
  expenseId: string;
}

export default function RejectExpenseButton({ expenseId }: Props) {
  const { t } = useI18n();
  const [showReason, setShowReason] = useState(false);
  const [reason, setReason] = useState("");
  const [isPending, startTransition] = useTransition();

  if (!showReason) {
    return (
      <button
        type="button"
        onClick={() => setShowReason(true)}
        className="w-full py-2 text-sm font-medium text-error bg-error/10 rounded-lg hover:bg-error/20 transition-colors"
      >
        {t("expenseForm.reject")}
      </button>
    );
  }

  const handleSubmit = () => {
    const formData = new FormData();
    formData.set("expenseId", expenseId);
    formData.set("status", "rejected");
    formData.set("rejectionReason", reason);
    startTransition(async () => {
      await updateExpenseStatus(formData);
    });
  };

  return (
    <div className="space-y-2">
      <textarea
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder={t("expenseForm.rejectionReasonPlaceholder")}
        disabled={isPending}
        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-error/50 focus:border-error disabled:opacity-50 resize-none"
        rows={2}
      />
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setShowReason(false)}
          disabled={isPending}
          className="flex-1 py-2 text-sm font-medium text-muted bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors disabled:opacity-50"
        >
          {t("common.cancel")}
        </button>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={isPending}
          className="flex-1 py-2 text-sm font-medium text-white bg-error rounded-lg hover:bg-error/90 transition-colors disabled:opacity-50 flex items-center justify-center gap-1"
        >
          {isPending ? (
            <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          ) : null}
          {t("expenseForm.confirmRejection")}
        </button>
      </div>
    </div>
  );
}
