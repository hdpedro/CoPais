"use client";

import type { ParentColorMap } from "@/lib/calendar-utils";

interface BalanceOperationSummary {
  id: string;
  operation_type: string;
  status: string;
  days: number;
  notes: string | null;
  created_at: string;
  responded_at: string | null;
  proposed_by: string;
  target_user_id: string;
  proposer: { full_name: string } | null;
  target: { full_name: string } | null;
}

interface Props {
  operations: BalanceOperationSummary[];
  parentColors: ParentColorMap;
  rawBalanceByUser: Record<string, number>;
  onClose: () => void;
}

const TYPE_CONFIG: Record<string, { icon: string; label: string }> = {
  debit: { icon: "🔁", label: "Debito" },
  credit: { icon: "🔁", label: "Credito" },
  waive: { icon: "🤝", label: "Isencao" },
  gift_day: { icon: "🎁", label: "Doacao" },
  forgive_balance: { icon: "⚖️", label: "Perdao de saldo" },
  reset_balance: { icon: "🧹", label: "Zeramento" },
  manual_adjustment: { icon: "🔧", label: "Ajuste manual" },
};

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  pending: { label: "Pendente", className: "bg-amber-100 text-amber-700" },
  approved: { label: "Aprovada", className: "bg-green-100 text-green-700" },
  rejected: { label: "Recusada", className: "bg-red-100 text-red-600" },
  cancelled: { label: "Cancelada", className: "bg-gray-100 text-gray-500" },
};

export default function BalanceHistorySheet({ operations, onClose }: Props) {
  const formatDateTime = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString("pt-BR", {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  // Sort newest first
  const sorted = [...operations].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-white w-full md:w-[560px] md:max-w-[92vw] max-h-[88vh] rounded-t-2xl md:rounded-2xl overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#E8E0D4]">
          <h2 className="text-lg font-bold text-[#0E0C0A]">Historico de Operacoes</h2>
          <button
            onClick={onClose}
            className="text-[#9A8878] hover:text-[#2C2C2C]"
            aria-label="Fechar"
          >
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5">
          {sorted.length === 0 ? (
            <div className="text-center py-12 text-sm text-[#9A8878]">
              <p className="text-4xl mb-3">📋</p>
              <p>Nenhuma operacao registrada ainda.</p>
            </div>
          ) : (
            <ul className="space-y-3">
              {sorted.map((op) => {
                const type = TYPE_CONFIG[op.operation_type] || { icon: "⚖️", label: op.operation_type };
                const status = STATUS_CONFIG[op.status] || STATUS_CONFIG.pending;
                const proposerName = op.proposer?.full_name?.split(" ")[0] || "Alguem";
                const targetName = op.target?.full_name?.split(" ")[0] || "Alguem";

                return (
                  <li key={op.id} className="border border-[#E8E0D4] rounded-lg p-3">
                    <div className="flex items-start gap-3">
                      <span className="text-xl leading-none mt-0.5">{type.icon}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <span className="text-sm font-semibold text-[#2C2C2C]">{type.label}</span>
                          <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${status.className}`}>
                            {status.label}
                          </span>
                        </div>
                        <p className="text-xs text-[#9A8878] mb-1">
                          {proposerName} → {targetName}
                          {op.days > 1 && <span className="ml-1 font-medium text-[#2C2C2C]">· {op.days} dias</span>}
                        </p>
                        {op.notes && (
                          <p className="text-xs text-[#2C2C2C] italic mt-1 bg-[#FAFAF8] p-2 rounded">
                            &ldquo;{op.notes}&rdquo;
                          </p>
                        )}
                        <p className="text-[10px] text-[#9A8878] mt-2">
                          Proposto em {formatDateTime(op.created_at)}
                          {op.responded_at && ` · Respondido em ${formatDateTime(op.responded_at)}`}
                        </p>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
