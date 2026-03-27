"use client";

import { useState, useRef } from "react";
import { useI18n } from "@/i18n/provider";

interface ResolveButtonProps {
  episodeId: string;
  today: string;
  action: (formData: FormData) => Promise<void>;
}

export default function ResolveButton({ episodeId, today, action }: ResolveButtonProps) {
  const { t } = useI18n();
  const [confirming, setConfirming] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  if (confirming) {
    return (
      <div className="px-4 py-3 bg-green-50/80 space-y-2">
        <p className="text-xs text-green-800 font-medium text-center">
          {t("health.resolveButton.confirmMessage")}
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setConfirming(false)}
            className="flex-1 text-xs font-semibold text-gray-600 bg-white border border-gray-200 hover:bg-gray-50 py-2 rounded-lg transition-colors"
          >
            {t("common.cancel")}
          </button>
          <button
            type="button"
            onClick={() => formRef.current?.requestSubmit()}
            className="flex-1 text-xs font-semibold text-white bg-green-600 hover:bg-green-700 py-2 rounded-lg transition-colors"
          >
            {t("health.resolveButton.yesRecovered")}
          </button>
        </div>
        <form ref={formRef} action={action} className="hidden">
          <input type="hidden" name="episodeId" value={episodeId} />
          <input type="hidden" name="status" value="resolved" />
          <input type="hidden" name="endDate" value={today} />
        </form>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setConfirming(true)}
      className="w-full text-center text-xs font-semibold text-green-700 bg-green-50/50 hover:bg-green-50 py-2.5 transition-colors flex items-center justify-center gap-1.5"
    >
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
      </svg>
      {t("health.resolveButton.markRecovered")}
    </button>
  );
}
