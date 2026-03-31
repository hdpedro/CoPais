"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { resolveIllnessQuick } from "@/actions/health";
import { useI18n } from "@/i18n/provider";

interface ResolveIllnessActionProps {
  episodeId: string;
  hasActiveMeds: boolean;
}

export default function ResolveIllnessAction({ episodeId, hasActiveMeds }: ResolveIllnessActionProps) {
  const { t } = useI18n();
  const router = useRouter();
  const [showConfirm, setShowConfirm] = useState(false);
  const [finishMeds, setFinishMeds] = useState(true);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleResolve() {
    const formData = new FormData();
    formData.set("episodeId", episodeId);
    formData.set("finishMeds", finishMeds ? "true" : "false");

    startTransition(async () => {
      const result = await resolveIllnessQuick(formData);
      if (result.success) {
        setShowConfirm(false);
        router.refresh();
      } else {
        setError(result.error || "Erro ao resolver doença");
      }
    });
  }

  if (showConfirm) {
    return (
      <div className="p-3 rounded-xl bg-white border border-gray-200 space-y-3">
        <p className="text-sm font-medium text-dark">
          {t("health.resolve.confirmMessage")}
        </p>
        {hasActiveMeds && (
          <label className="flex items-center gap-2 text-sm text-muted cursor-pointer">
            <input
              type="checkbox"
              checked={finishMeds}
              onChange={(e) => setFinishMeds(e.target.checked)}
              className="rounded border-gray-300 text-primary focus:ring-primary"
            />
            {t("health.resolve.finishMedsQuestion")}
          </label>
        )}
        {error && (
          <p className="text-xs text-error">{error}</p>
        )}
        <div className="flex gap-2">
          <button
            onClick={handleResolve}
            disabled={isPending}
            className="flex-1 text-sm font-semibold text-white bg-green-500 hover:bg-green-600 py-2 rounded-lg transition-colors disabled:opacity-50"
          >
            {isPending ? t("health.resolve.saving") : t("health.resolve.yesResolved")}
          </button>
          <button
            onClick={() => setShowConfirm(false)}
            className="px-4 text-sm text-muted hover:text-dark py-2 rounded-lg bg-gray-50"
          >
            {t("health.resolve.cancel")}
          </button>
        </div>
      </div>
    );
  }

  return (
    <button
      onClick={() => setShowConfirm(true)}
      className="w-full flex items-center justify-center gap-1.5 text-sm font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 py-2.5 rounded-xl transition-colors"
    >
      ✅ {t("health.resolve.markResolved")}
    </button>
  );
}
