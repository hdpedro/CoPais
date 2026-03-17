"use client";

import { useState } from "react";
import { createSwapRequest } from "@/actions/calendar";
import type { CustodyDayInfo } from "@/lib/calendar-utils";

interface SwapRequestModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedDate: string;
  dayInfo: CustodyDayInfo | null;
  groupId: string;
  currentUserId: string;
}

export default function SwapRequestModal({
  isOpen,
  onClose,
  selectedDate,
  dayInfo,
  groupId,
  currentUserId,
}: SwapRequestModalProps) {
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
    if (!proposedDate) {
      setError("Selecione uma data para troca.");
      return;
    }
    setSubmitting(true);
    setError("");

    const formData = new FormData();
    formData.set("groupId", groupId);
    formData.set("originalDate", selectedDate);
    formData.set("proposedDate", proposedDate);
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

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center">
      <div className="bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl p-6 max-h-[80vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-dark">Solicitar Troca</h3>
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
          <p className="text-sm text-muted">Dia selecionado</p>
          <p className="font-semibold text-dark capitalize">{formattedDate}</p>
          {dayInfo && (
            <div className="flex items-center gap-2 mt-1">
              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: dayInfo.color }} />
              <span className="text-sm text-muted">Responsavel: {dayInfo.userName}</span>
            </div>
          )}
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-dark mb-1">
              Data proposta para troca
            </label>
            <input
              type="date"
              value={proposedDate}
              onChange={(e) => setProposedDate(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50"
              min={new Date().toISOString().split("T")[0]}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-dark mb-1">
              Motivo (opcional)
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Ex: Preciso viajar a trabalho nesse dia..."
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
              Cancelar
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="flex-1 px-4 py-3 bg-primary text-white font-semibold rounded-xl hover:bg-primary-dark transition-colors disabled:opacity-50"
            >
              {submitting ? "Enviando..." : "Solicitar"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
