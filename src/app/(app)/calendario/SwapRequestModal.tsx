"use client";

import { useState } from "react";
import { createSwapRequest } from "@/actions/calendar";
import { getBrazilToday, type CustodyDayInfo } from "@/lib/calendar-utils";
import { useI18n } from "@/i18n/provider";

interface SwapRequestModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedDate: string;
  dayInfo: CustodyDayInfo | null;
  groupId: string;
  currentUserId: string;
  isVisitRequest?: boolean;
}

export default function SwapRequestModal({
  isOpen,
  onClose,
  selectedDate,
  dayInfo,
  groupId,
  currentUserId,
  isVisitRequest = false,
}: SwapRequestModalProps) {
  const { t } = useI18n();
  const [proposedDate, setProposedDate] = useState("");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  if (!isOpen) return null;

  const formattedDate = new Date(selectedDate + "T12:00:00").toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    // proposedDate is optional — if empty, the swap counts as a debt day for the requester
    setSubmitting(true);
    setError("");

    const formData = new FormData();
    formData.set("groupId", groupId);
    formData.set("originalDate", selectedDate);
    if (!isVisitRequest && proposedDate) {
      formData.set("proposedDate", proposedDate);
    }
    formData.set("reason", reason);
    formData.set("targetUserId", dayInfo?.userId || "");

    const result = await createSwapRequest(formData);
    setSubmitting(false);

    if (result?.error) {
      setError(result.error);
    } else {
      setProposedDate("");
      setReason("");
      onClose();
    }
  }

  const title = isVisitRequest ? t("swapModal.requestVisit") : t("swapModal.requestSwap");
  const submitLabel = isVisitRequest ? t("swapModal.requestVisit") : t("swapModal.requestSwap");

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center">
      <div className="bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl p-6 max-h-[80vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-dark">{title}</h3>
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-100 rounded-lg"
          >
            <svg className="w-5 h-5 text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Current day info */}
        <div className="bg-gray-50 rounded-xl p-4 mb-4">
          <p className="text-sm text-muted">{t("swapModal.selectedDay")}</p>
          <p className="font-semibold text-dark capitalize">{formattedDate}</p>
          {dayInfo && (
            <div className="flex items-center gap-2 mt-1">
              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: dayInfo.color }} />
              <span className="text-sm text-muted">{t("swapModal.responsible")}: {dayInfo.userName}</span>
            </div>
          )}
        </div>

        {isVisitRequest && (
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 mb-4">
            <p className="text-sm text-blue-700">
              {t("swapModal.visitExplanation")}
            </p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {!isVisitRequest && (
            <div>
              <label className="block text-sm font-medium text-dark mb-1">
                {t("swapModal.dayYouOffer")}
              </label>
              <input
                type="date"
                value={proposedDate}
                onChange={(e) => setProposedDate(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50"
                min={getBrazilToday()}
              />
              {!proposedDate && (
                <p className="text-xs text-amber-600 mt-1.5 flex items-center gap-1">
                  <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  {t("swapModal.noSwapDateDebt")}
                </p>
              )}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-dark mb-1">
              {isVisitRequest ? t("swapModal.visitReason") : t("swapModal.reasonOptional")}
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={isVisitRequest
                ? t("swapModal.visitReasonPlaceholder")
                : t("swapModal.swapReasonPlaceholder")
              }
              rows={3}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none"
            />
          </div>

          {error && (
            <p className="text-sm text-error bg-error/10 px-3 py-2 rounded-lg">{error}</p>
          )}

          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-3 border border-gray-200 text-dark font-medium rounded-xl hover:bg-gray-50 transition-colors"
            >
              {t("common.cancel")}
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="flex-1 px-4 py-3 bg-primary text-white font-semibold rounded-xl hover:bg-primary-dark transition-colors disabled:opacity-50"
            >
              {submitting ? t("swapModal.sending") : submitLabel}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
