"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { respondToBalanceOperation } from "@/actions/balance-operations";

interface BalanceOperation {
  id: string;
  operation_type: string;
  status: string;
  days: number;
  direction: string;
  related_date: string | null;
  notes: string | null;
  created_at: string;
  proposed_by: string;
  target_user_id: string;
  proposer: { full_name: string } | null;
  target: { full_name: string } | null;
}

interface Props {
  operations: BalanceOperation[];
  currentUserId: string;
}

const TYPE_CONFIG: Record<string, { icon: string; label: string; color: string }> = {
  debit: { icon: "🔁", label: "Debito", color: "amber" },
  credit: { icon: "🔁", label: "Credito", color: "green" },
  waive: { icon: "🤝", label: "Isencao (sem saldo)", color: "blue" },
  gift_day: { icon: "🎁", label: "Doacao de dia", color: "pink" },
  forgive_balance: { icon: "⚖️", label: "Perdao de saldo", color: "green" },
  reset_balance: { icon: "🧹", label: "Zeramento consensual", color: "teal" },
  manual_adjustment: { icon: "🔧", label: "Ajuste manual", color: "gray" },
};

export default function BalanceOperationList({ operations, currentUserId }: Props) {
  const router = useRouter();
  const [responding, setResponding] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (operations.length === 0) return null;

  async function handleRespond(operationId: string, response: "approved" | "rejected") {
    setResponding(operationId);
    setError(null);
    try {
      const formData = new FormData();
      formData.set("operationId", operationId);
      formData.set("response", response);
      const result = await respondToBalanceOperation(formData);
      if (result?.error) {
        setError(result.error);
      } else {
        router.refresh();
      }
    } catch {
      setError("Erro ao responder. Tente novamente.");
    } finally {
      setResponding(null);
    }
  }

  const formatDate = (d: string) =>
    new Date(d + "T12:00:00").toLocaleDateString("pt-BR", {
      day: "numeric",
      month: "short",
      weekday: "short",
    });

  return (
    <div className="bg-white rounded-xl shadow-sm p-4">
      <h3 className="text-base font-semibold text-[#0E0C0A] mb-3">Propostas de Saldo</h3>
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-3 mb-3 text-sm text-red-600">
          {error}
        </div>
      )}
      <div className="space-y-3">
        {operations.map((op) => {
          const config = TYPE_CONFIG[op.operation_type] || { icon: "⚖️", label: op.operation_type, color: "gray" };
          const isTarget = op.target_user_id === currentUserId;
          const isProposer = op.proposed_by === currentUserId;
          const proposerName = op.proposer?.full_name?.split(" ")[0] || "Alguem";
          const targetName = op.target?.full_name?.split(" ")[0] || "Alguem";

          return (
            <div
              key={op.id}
              className="border border-[#E8E0D4] rounded-lg p-3"
            >
              <div className="flex items-start justify-between gap-3 mb-2">
                <div className="flex items-start gap-2 flex-1 min-w-0">
                  <span className="text-lg leading-none">{config.icon}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-[#2C2C2C]">{config.label}</p>
                    <p className="text-xs text-[#9A8878]">
                      {isProposer ? `Voce propôs para ${targetName}` : `${proposerName} propôs para voce`}
                    </p>
                  </div>
                </div>
                <span className="text-[10px] font-medium bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">
                  Pendente
                </span>
              </div>

              {op.days > 1 && (
                <p className="text-xs text-[#2C2C2C] mb-1">
                  <strong>{op.days} dias</strong>
                </p>
              )}

              {op.related_date && (
                <p className="text-xs text-[#9A8878] mb-1">Dia: {formatDate(op.related_date)}</p>
              )}

              {op.notes && (
                <p className="text-xs text-[#2C2C2C] italic mb-2 bg-[#FAFAF8] p-2 rounded">
                  &ldquo;{op.notes}&rdquo;
                </p>
              )}

              {isTarget && (
                <div className="flex gap-2 mt-3">
                  <button
                    onClick={() => handleRespond(op.id, "approved")}
                    disabled={responding === op.id}
                    className="flex-1 bg-[#2E7268] text-white text-sm font-semibold py-2 rounded-lg hover:bg-[#245B53] disabled:opacity-50"
                  >
                    {responding === op.id ? "..." : "Aceitar"}
                  </button>
                  <button
                    onClick={() => handleRespond(op.id, "rejected")}
                    disabled={responding === op.id}
                    className="flex-1 bg-white border border-[#E8E0D4] text-[#2C2C2C] text-sm font-semibold py-2 rounded-lg hover:bg-[#F5EFE6] disabled:opacity-50"
                  >
                    Recusar
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
