"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createBalanceOperation } from "@/actions/balance-operations";
import BalanceOperationPicker, { type BalanceOperationType, getOptionConfig } from "./BalanceOperationPicker";

interface Props {
  groupId: string;
  targetUserId: string;
  targetName: string;
  currentBalance: number;
  onClose: () => void;
}

export default function ProposeBalanceAdjustmentSheet({
  groupId,
  targetUserId,
  targetName,
  currentBalance,
  onClose,
}: Props) {
  const router = useRouter();
  const [operationType, setOperationType] = useState<BalanceOperationType>("waive");
  const [days, setDays] = useState(1);
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const config = getOptionConfig(operationType);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.set("groupId", groupId);
      formData.set("operationType", operationType);
      formData.set("targetUserId", targetUserId);
      formData.set("days", String(days));
      if (notes) formData.set("notes", notes);

      const result = await createBalanceOperation(formData);
      if (result?.error) {
        setError(result.error);
      } else {
        onClose();
        router.refresh();
      }
    } catch {
      setError("Erro ao enviar proposta. Tente novamente.");
    } finally {
      setSubmitting(false);
    }
  }

  // In this propose flow, only show operations that don't require a specific swap date
  const excludeTypes: BalanceOperationType[] = ["debit"];

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-white w-full md:w-[560px] md:max-w-[92vw] max-h-[92vh] rounded-t-2xl md:rounded-2xl overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#E8E0D4]">
          <h2 className="text-lg font-bold text-[#0E0C0A]">Propor Ajuste</h2>
          <button onClick={onClose} className="text-[#9A8878] hover:text-[#2C2C2C]" aria-label="Fechar">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-5 space-y-4">
          <p className="text-sm text-[#9A8878]">
            Proposta para <strong className="text-[#2C2C2C]">{targetName}</strong>.
            Saldo atual: {currentBalance > 0 ? `+${currentBalance}` : currentBalance} dia(s).
          </p>

          <BalanceOperationPicker
            value={operationType}
            onChange={setOperationType}
            excludeTypes={excludeTypes}
          />

          {config?.needsDays && (
            <div>
              <label className="block text-xs font-medium text-[#2C2C2C] mb-1">Quantos dias abater?</label>
              <input
                type="number"
                min={1}
                max={30}
                value={days}
                onChange={(e) => setDays(Math.max(1, parseInt(e.target.value) || 1))}
                className="w-full px-3 py-2 border border-[#E8E0D4] rounded-lg text-sm focus:outline-none focus:border-[#C07055]"
              />
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-[#2C2C2C] mb-1">Observacao (opcional)</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Motivo ou contexto..."
              rows={3}
              className="w-full px-3 py-2 border border-[#E8E0D4] rounded-lg text-sm focus:outline-none focus:border-[#C07055] resize-none"
            />
          </div>

          {operationType === "reset_balance" && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
              <p className="text-xs text-amber-800">
                ⚠️ <strong>Atencao:</strong> Zerar saldo reseta todas as pendencias. {targetName} precisa aprovar explicitamente.
              </p>
            </div>
          )}

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-600">
              {error}
            </div>
          )}

          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2.5 text-sm font-medium text-[#2C2C2C] border border-[#E8E0D4] rounded-lg hover:bg-[#F5EFE6]"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="flex-1 px-4 py-2.5 text-sm font-semibold text-white bg-[#C07055] rounded-lg hover:bg-[#A85D47] disabled:opacity-50"
            >
              {submitting ? "Enviando..." : "Enviar proposta"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
