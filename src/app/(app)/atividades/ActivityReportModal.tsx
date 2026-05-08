"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { submitActivityReport } from "@/actions/activities";
import { useI18n } from "@/i18n/provider";

interface ActivityReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  activityId: string;
  activityName: string;
  childName: string;
  occurrenceDate: string;
  timeStart?: string | null;
}

const MOOD_OPTIONS = [
  { value: "happy", emoji: "\u{1F60A}" },
  { value: "neutral", emoji: "\u{1F610}" },
  { value: "sad", emoji: "\u{1F622}" },
  { value: "anxious", emoji: "\u{1F630}" },
  { value: "tired", emoji: "\u{1F634}" },
] as const;

export default function ActivityReportModal({
  isOpen,
  onClose,
  activityId,
  activityName,
  childName,
  occurrenceDate,
  timeStart,
}: ActivityReportModalProps) {
  const router = useRouter();
  const { t } = useI18n();
  const [status, setStatus] = useState<"completed" | "missed" | "cancelled">("completed");
  const [notes, setNotes] = useState("");
  const [childMood, setChildMood] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  // Reset ALL fields when modal opens for a new activity. This is the
  // documented "reset on prop change" pattern; the cleaner alternative
  // is to remount via `key={activityId + occurrenceDate}` in the parent —
  // tracked as follow-up. The synchronous setState block is intentional
  // and gated on isOpen flipping to true.
  useEffect(() => {
    if (isOpen) {
      /* eslint-disable react-hooks/set-state-in-effect */
      setStatus("completed");
      setNotes("");
      setChildMood("");
      setError("");
      setSubmitting(false);
      /* eslint-enable react-hooks/set-state-in-effect */
    }
  }, [isOpen, activityId, occurrenceDate]);

  if (!isOpen) return null;

  const formattedDate = new Date(occurrenceDate + "T12:00:00").toLocaleDateString("pt-BR", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSubmitting(true);

    try {
      const formData = new FormData();
      formData.set("activityId", activityId);
      formData.set("occurrenceDate", occurrenceDate);
      formData.set("status", status);
      if (notes.trim()) formData.set("notes", notes.trim());
      if (childMood) formData.set("childMood", childMood);

      const result = await submitActivityReport(formData);

      if (result?.error) {
        setError(result.error);
      } else {
        onClose();
        router.refresh();
      }
    } catch {
      setError("Erro ao enviar relatorio.");
    } finally {
      setSubmitting(false);
    }
  }

  function handleClose() {
    setStatus("completed");
    setNotes("");
    setChildMood("");
    setError("");
    onClose();
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-[60] flex items-end sm:items-center justify-center" role="dialog" aria-modal="true" aria-label={t("activityReport.title")} onClick={handleClose} onKeyDown={(e) => { if (e.key === "Escape") handleClose(); }}>
      <div
        className="bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl max-h-[85vh] overflow-y-auto animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Drag handle */}
        <div className="flex justify-center pt-3 pb-1 sm:hidden">
          <div className="w-10 h-1 bg-gray-300 rounded-full" />
        </div>

        <div className="p-5">
          {/* Header */}
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold text-[#2C2C2C]">{t("activityReport.title")}</h3>
            <button
              onClick={handleClose}
              className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <svg className="w-5 h-5 text-[#7A8C8B]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Activity info */}
          <div className="bg-gray-50 rounded-xl p-3 mb-4">
            <p className="text-sm font-semibold text-[#2C2C2C]">{activityName}</p>
            <p className="text-xs text-[#7A8C8B]">
              {childName} &middot; {formattedDate}
              {timeStart && ` &middot; ${timeStart.slice(0, 5)}`}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Status selector */}
            <div>
              <label className="block text-sm font-medium text-[#2C2C2C] mb-2">{t("activityReport.title")}</label>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => setStatus("completed")}
                  className={`px-3 py-2.5 rounded-xl text-xs font-medium transition-colors border text-center ${
                    status === "completed"
                      ? "bg-green-50 border-green-300 text-green-700"
                      : "bg-white border-gray-200 text-[#7A8C8B] hover:bg-gray-50"
                  }`}
                >
                  <span className="text-base block mb-0.5">{"\u2705"}</span>
                  {t("activityReport.activityCompleted")}
                </button>
                <button
                  type="button"
                  onClick={() => setStatus("missed")}
                  className={`px-3 py-2.5 rounded-xl text-xs font-medium transition-colors border text-center ${
                    status === "missed"
                      ? "bg-red-50 border-red-300 text-red-700"
                      : "bg-white border-gray-200 text-[#7A8C8B] hover:bg-gray-50"
                  }`}
                >
                  <span className="text-base block mb-0.5">{"\u274C"}</span>
                  {t("activityReport.activityMissed")}
                </button>
                <button
                  type="button"
                  onClick={() => setStatus("cancelled")}
                  className={`px-3 py-2.5 rounded-xl text-xs font-medium transition-colors border text-center ${
                    status === "cancelled"
                      ? "bg-orange-50 border-orange-300 text-orange-700"
                      : "bg-white border-gray-200 text-[#7A8C8B] hover:bg-gray-50"
                  }`}
                >
                  <span className="text-base block mb-0.5">{"\u{1F6AB}"}</span>
                  {t("activityReport.activityCancelled")}
                </button>
              </div>
            </div>

            {/* Child mood selector */}
            <div>
              <label className="block text-sm font-medium text-[#2C2C2C] mb-2">{t("activityReport.childMoodLabel")}</label>
              <div className="flex gap-2">
                {MOOD_OPTIONS.map((mood) => (
                  <button
                    key={mood.value}
                    type="button"
                    onClick={() => setChildMood(childMood === mood.value ? "" : mood.value)}
                    className={`flex-1 flex flex-col items-center gap-0.5 py-2 rounded-xl transition-colors border ${
                      childMood === mood.value
                        ? "bg-[#D4735A]/10 border-[#D4735A]/30"
                        : "bg-white border-gray-200 hover:bg-gray-50"
                    }`}
                  >
                    <span className="text-xl">{mood.emoji}</span>
                    <span className="text-[9px] text-[#7A8C8B]">{t(`activityReport.mood_${mood.value}`)}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Notes */}
            <div>
              <label className="block text-sm font-medium text-[#2C2C2C] mb-1">
                {t("activityReport.howWasIt")} <span className="text-[#7A8C8B] font-normal">({t("common.optional")})</span>
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder={t("activityReport.notesPlaceholder")}
                rows={3}
                className="w-full px-3 py-2 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#D4735A]/50 resize-none text-sm text-[#2C2C2C] placeholder:text-[#7A8C8B]"
              />
            </div>

            {error && (
              <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>
            )}

            <div className="flex gap-3">
              <button
                type="button"
                onClick={handleClose}
                className="flex-1 px-4 py-3 border border-gray-200 text-[#2C2C2C] font-medium rounded-xl hover:bg-gray-50 transition-colors"
              >
                {t("common.cancel")}
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="flex-1 px-4 py-3 bg-[#D4735A] text-white font-semibold rounded-xl hover:bg-[#D4623E] transition-colors disabled:opacity-50"
              >
                {submitting ? t("activityReport.submitting") : t("activityReport.submit")}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
