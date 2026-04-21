"use client";

import { useState } from "react";
import type { ParentColorMap } from "@/lib/calendar-utils";
import BalanceHistorySheet from "./BalanceHistorySheet";
import ProposeBalanceAdjustmentSheet from "./ProposeBalanceAdjustmentSheet";

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

interface SwapBalanceCardProps {
  balanceByUser: Record<string, number>;
  rawBalanceByUser: Record<string, number>;
  totalSwapDays: number;
  parentColors: ParentColorMap;
  friendlyConcessions: number;
  lastAgreementDate: string | null;
  pendingOperations: number;
  currentUserId: string;
  groupId: string;
  operations: BalanceOperationSummary[];
}

export default function SwapBalanceCard({
  balanceByUser,
  rawBalanceByUser,
  totalSwapDays,
  parentColors,
  friendlyConcessions,
  lastAgreementDate,
  pendingOperations,
  currentUserId,
  groupId,
  operations,
}: SwapBalanceCardProps) {
  const [historyOpen, setHistoryOpen] = useState(false);
  const [proposeOpen, setProposeOpen] = useState(false);

  const entries = Object.entries(balanceByUser)
    .filter(([id]) => parentColors[id])
    .sort((a, b) => b[1] - a[1]);

  const isBalanced = entries.every(([, val]) => val === 0);
  const hasActivity = totalSwapDays > 0 || operations.length > 0;

  if (!hasActivity) return null;

  const debtor = entries.find(([, val]) => val < 0);
  const creditor = entries.find(([, val]) => val > 0);

  const statusColor = pendingOperations > 0
    ? "amber"
    : isBalanced
      ? "green"
      : "red";

  const statusLabel = pendingOperations > 0
    ? `${pendingOperations} proposta(s) aguardando`
    : isBalanced
      ? "Sem pendências"
      : debtor && creditor
        ? `${parentColors[debtor[0]]?.name} deve ${Math.abs(debtor[1])} dia(s)`
        : "Saldo ajustado";

  const statusIcon = pendingOperations > 0 ? "🟡" : isBalanced ? "🟢" : "🔴";

  // Get target for proposing (the other parent)
  const otherParents = Object.keys(parentColors).filter((id) => id !== currentUserId);
  const targetUserId = otherParents[0];

  const formatAgreementDate = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString("pt-BR", { day: "numeric", month: "short" });
  };

  return (
    <>
      <div className="bg-white rounded-xl shadow-sm p-4">
        {/* Status indicator */}
        <div className="flex items-center gap-2 mb-3">
          <span className="text-lg leading-none">{statusIcon}</span>
          <div className="flex-1">
            <h3 className="text-base font-semibold text-[#0E0C0A]">Saldo de dias</h3>
            <p className={`text-xs font-medium ${
              statusColor === "green" ? "text-green-600" :
              statusColor === "amber" ? "text-amber-600" :
              "text-red-500"
            }`}>
              {statusLabel}
            </p>
          </div>
        </div>

        {/* Per-parent balance */}
        {!isBalanced && (
          <div className="space-y-1.5 mb-3 pb-3 border-b border-[#F5EFE6]">
            {entries.map(([userId, balance]) => {
              const parent = parentColors[userId];
              if (!parent) return null;
              const isPositive = balance > 0;
              const isNeutral = balance === 0;
              return (
                <div key={userId} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: parent.color }} />
                    <span className="text-sm text-[#2C2C2C]">{parent.name}</span>
                  </div>
                  <span className={`text-sm font-semibold ${
                    isNeutral ? "text-gray-500" : isPositive ? "text-green-600" : "text-red-500"
                  }`}>
                    {isPositive ? "+" : ""}{balance} {Math.abs(balance) === 1 ? "dia" : "dias"}
                  </span>
                </div>
              );
            })}
          </div>
        )}

        {/* Meta info */}
        <div className="space-y-1 mb-4 text-xs text-[#9A8878]">
          {lastAgreementDate && (
            <p className="flex items-center gap-1.5">
              <span>🤝</span>
              Último acordo: {formatAgreementDate(lastAgreementDate)}
            </p>
          )}
          {friendlyConcessions > 0 && (
            <p className="flex items-center gap-1.5">
              <span>📅</span>
              {friendlyConcessions} concess{friendlyConcessions === 1 ? "ão" : "ões"} amigáv{friendlyConcessions === 1 ? "el" : "eis"} este mês
            </p>
          )}
        </div>

        {/* Actions */}
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setHistoryOpen(true)}
            className="flex-1 min-w-[100px] px-3 py-2 text-xs font-medium text-[#C07055] border border-[#E8E0D4] rounded-lg hover:bg-[#F5EFE6]"
          >
            Ver histórico
          </button>
          {targetUserId && (
            <button
              onClick={() => setProposeOpen(true)}
              className="flex-1 min-w-[100px] px-3 py-2 text-xs font-semibold text-white bg-[#C07055] rounded-lg hover:bg-[#A85D47]"
            >
              Propor ajuste
            </button>
          )}
        </div>
      </div>

      {historyOpen && (
        <BalanceHistorySheet
          operations={operations}
          parentColors={parentColors}
          rawBalanceByUser={rawBalanceByUser}
          onClose={() => setHistoryOpen(false)}
        />
      )}

      {proposeOpen && targetUserId && (
        <ProposeBalanceAdjustmentSheet
          groupId={groupId}
          targetUserId={targetUserId}
          targetName={parentColors[targetUserId]?.name || "Outro responsável"}
          currentBalance={balanceByUser[currentUserId] || 0}
          onClose={() => setProposeOpen(false)}
        />
      )}
    </>
  );
}
