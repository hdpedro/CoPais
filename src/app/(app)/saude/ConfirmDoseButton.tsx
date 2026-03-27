"use client";

import { useState, useTransition } from "react";
import { logMedicationDose } from "@/actions/health";
import { useI18n } from "@/i18n/provider";

interface ConfirmDoseButtonProps {
  medicationId: string;
  redirectTo: string;
  isOverdue: boolean;
  lastDoseMinutesAgo: number | null; // null = no doses yet
  frequencyHours: number;
  medName: string;
}

export default function ConfirmDoseButton({
  medicationId,
  redirectTo,
  isOverdue,
  lastDoseMinutesAgo,
  frequencyHours,
  medName,
}: ConfirmDoseButtonProps) {
  const { t } = useI18n();
  const [showWarning, setShowWarning] = useState(false);
  const [isPending, startTransition] = useTransition();

  const tooSoon = lastDoseMinutesAgo !== null && lastDoseMinutesAgo < frequencyHours * 30; // less than half the interval
  const veryRecent = lastDoseMinutesAgo !== null && lastDoseMinutesAgo < 60; // less than 1 hour

  function handleClick() {
    if (tooSoon) {
      setShowWarning(true);
      return;
    }
    submitDose();
  }

  function submitDose() {
    const formData = new FormData();
    formData.set("medicationId", medicationId);
    formData.set("redirectTo", redirectTo);
    startTransition(() => {
      logMedicationDose(formData);
    });
  }

  function formatMinutes(min: number) {
    if (min < 60) return `${Math.round(min)} min`;
    const h = Math.floor(min / 60);
    const m = Math.round(min % 60);
    return m > 0 ? `${h}h${m}min` : `${h}h`;
  }

  if (showWarning) {
    return (
      <div className="mt-2 p-3 bg-red-50 border border-red-200 rounded-xl animate-[fadeIn_200ms_ease-out]">
        <div className="flex items-start gap-2 mb-2">
          <span className="text-lg">{"\u26A0\uFE0F"}</span>
          <div>
            <p className="text-xs font-bold text-red-800">{t("health.confirmDose.warning")}</p>
            <p className="text-[11px] text-red-700 mt-0.5">
              {veryRecent
                ? t("health.confirmDose.veryRecentDose", { medName, time: formatMinutes(lastDoseMinutesAgo!) })
                : t("health.confirmDose.recentDose", { time: formatMinutes(lastDoseMinutesAgo!), hours: String(frequencyHours) })}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowWarning(false)}
            className="flex-1 px-3 py-1.5 text-xs font-semibold bg-white border border-gray-200 rounded-lg text-dark hover:bg-gray-50"
          >
            {t("common.cancel")}
          </button>
          <button
            onClick={submitDose}
            disabled={isPending}
            className="flex-1 px-3 py-1.5 text-xs font-semibold bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
          >
            {isPending ? t("health.confirmDose.registering") : t("health.confirmDose.confirmAnyway")}
          </button>
        </div>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={isPending}
      className={`flex-shrink-0 px-3 py-2 rounded-lg text-xs font-bold transition-colors disabled:opacity-50 ${
        isOverdue
          ? "bg-amber-500 text-white hover:bg-amber-600"
          : "bg-primary/10 text-primary hover:bg-primary/20"
      }`}
    >
      {isPending ? "..." : t("health.confirmDose.confirmDose")}
    </button>
  );
}
