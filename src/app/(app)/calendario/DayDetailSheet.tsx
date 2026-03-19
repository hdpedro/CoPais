"use client";

import { useState } from "react";
import { createSwapRequest } from "@/actions/calendar";
import type { CustodyDayInfo } from "@/lib/calendar-utils";

interface DayDetailSheetProps {
  isOpen: boolean;
  onClose: () => void;
  dateKey: string;
  dayInfo: CustodyDayInfo | null;
  groupId: string;
  currentUserId: string;
  isParent: boolean;
  pendingSwapForDay?: boolean;
}

export default function DayDetailSheet({
  isOpen,
  onClose,
  dateKey,
  dayInfo,
  groupId,
  currentUserId,
  isParent,
  pendingSwapForDay = false,
}: DayDetailSheetProps) {
  const [showSwapForm, setShowSwapForm] = useState(false);
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  if (!isOpen || !dateKey) return null;

  const formattedDate = new Date(dateKey + "T12:00:00").toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  const isOtherParentDay = dayInfo && dayInfo.userId !== currentUserId;
  const isFutureDate = dateKey >= new Date().toISOString().split("T")[0];
  const canRequestSwap = isOtherParentDay && isFutureDate && !pendingSwapForDay;

  function handleClose() {
    setShowSwapForm(false);
    setReason("");
    setError("");
    setSuccess(false);
    onClose();
  }

  async function handleSwapSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError("");

    const formData = new FormData();
    formData.set("groupId", groupId);
    formData.set("originalDate", dateKey);
    formData.set("reason", reason);
    formData.set("targetUserId", dayInfo?.userId || "");

    const result = await createSwapRequest(formData);
    setSubmitting(false);

    if (result?.error) {
      setError(result.error);
    } else {
      setSuccess(true);
      setTimeout(() => {
        handleClose();
        window.location.reload();
      }, 1500);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center" onClick={handleClose}>
      <div
        className="bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl max-h-[80vh] overflow-y-auto animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Drag handle */}
        <div className="flex justify-center pt-3 pb-1 sm:hidden">
          <div className="w-10 h-1 bg-gray-300 rounded-full" />
        </div>

        <div className="p-5">
          {/* Header */}
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold text-dark capitalize">{formattedDate}</h3>
            <button
              onClick={handleClose}
              className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <svg className="w-5 h-5 text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Day Info */}
          {dayInfo ? (
            <div className="rounded-xl p-4 mb-4" style={{ backgroundColor: dayInfo.color + "15" }}>
              <div className="flex items-center gap-3">
                <div
                  className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-lg"
                  style={{ backgroundColor: dayInfo.color }}
                >
                  {dayInfo.userName.charAt(0).toUpperCase()}
                </div>
                <div>
                  <p className="text-sm text-muted">Responsavel</p>
                  <p className="font-semibold text-dark">{dayInfo.userName}</p>
                  {dayInfo.userId === currentUserId && (
                    <span className="text-xs text-primary font-medium">Voce</span>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-gray-50 rounded-xl p-4 mb-4">
              <p className="text-sm text-muted">Nenhuma guarda atribuida para este dia.</p>
            </div>
          )}

          {/* Pending swap indicator */}
          {pendingSwapForDay && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-4">
              <div className="flex items-center gap-2">
                <svg className="w-4 h-4 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p className="text-sm text-amber-700 font-medium">Troca pendente para este dia</p>
              </div>
            </div>
          )}

          {/* Success message */}
          {success && (
            <div className="bg-green-50 border border-green-200 rounded-xl p-4 mb-4">
              <div className="flex items-center gap-2">
                <svg className="w-5 h-5 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <p className="text-sm text-green-700 font-medium">Solicitacao enviada com sucesso!</p>
              </div>
            </div>
          )}

          {/* Swap Form */}
          {showSwapForm && !success ? (
            <form onSubmit={handleSwapSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-dark mb-1">
                  Observacao (opcional)
                </label>
                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Ex: Preciso viajar a trabalho nesse dia..."
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none text-sm"
                  autoFocus
                />
              </div>

              {error && (
                <p className="text-sm text-error bg-error/10 px-3 py-2 rounded-lg">{error}</p>
              )}

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setShowSwapForm(false)}
                  className="flex-1 px-4 py-3 border border-gray-200 text-dark font-medium rounded-xl hover:bg-gray-50 transition-colors"
                >
                  Voltar
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex-1 px-4 py-3 bg-primary text-white font-semibold rounded-xl hover:bg-primary-dark transition-colors disabled:opacity-50"
                >
                  {submitting ? "Enviando..." : "Solicitar Troca"}
                </button>
              </div>
            </form>
          ) : !success ? (
            /* Action Buttons */
            <div className="space-y-2">
              {canRequestSwap && (
                <button
                  onClick={() => setShowSwapForm(true)}
                  className="w-full flex items-center gap-3 px-4 py-3.5 bg-primary/5 border border-primary/20 rounded-xl hover:bg-primary/10 transition-colors"
                >
                  <div className="w-9 h-9 bg-primary/10 rounded-full flex items-center justify-center">
                    <svg className="w-5 h-5 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                    </svg>
                  </div>
                  <div className="text-left">
                    <p className="text-sm font-semibold text-primary">Trocar Dia</p>
                    <p className="text-xs text-muted">Solicitar troca com {dayInfo?.userName.split(" ")[0]}</p>
                  </div>
                </button>
              )}

              {!isParent && isOtherParentDay && isFutureDate && (
                <button
                  onClick={() => setShowSwapForm(true)}
                  className="w-full flex items-center gap-3 px-4 py-3.5 bg-blue-50 border border-blue-200 rounded-xl hover:bg-blue-100 transition-colors"
                >
                  <div className="w-9 h-9 bg-blue-100 rounded-full flex items-center justify-center">
                    <svg className="w-5 h-5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                  </div>
                  <div className="text-left">
                    <p className="text-sm font-semibold text-blue-600">Solicitar Visita</p>
                    <p className="text-xs text-muted">Pedir para visitar neste dia</p>
                  </div>
                </button>
              )}

              {!canRequestSwap && !pendingSwapForDay && dayInfo && dayInfo.userId === currentUserId && (
                <div className="text-center py-2">
                  <p className="text-xs text-muted">Este dia ja esta com voce</p>
                </div>
              )}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
