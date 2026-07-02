"use client";

/* Card de propostas PERMANENTES de rotina (N4 — OK-do-outro).
 * A proposta nasce do Kindar Brain ("a partir de agora segunda quem leva
 * é o pai"); quem NÃO propôs vê Aceitar/Recusar — aceitar materializa o
 * padrão semanal. Espelho visual do EventRequestList. */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { respondToSlotProposal } from "@/actions/care-routine";

export interface SlotProposalView {
  id: string;
  description: string;
  proposerName: string;
  proposedByMe: boolean;
}

export default function SlotProposalList({ proposals }: { proposals: SlotProposalView[] }) {
  const router = useRouter();
  const [responding, setResponding] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (proposals.length === 0) return null;

  async function handleRespond(proposalId: string, decision: "accepted" | "declined") {
    setResponding(proposalId);
    setError(null);
    try {
      const formData = new FormData();
      formData.set("proposalId", proposalId);
      formData.set("decision", decision);
      const result = await respondToSlotProposal(formData);
      if (result?.error) {
        setError(result.error);
      } else {
        router.refresh();
      }
    } catch {
      setError("Erro ao responder a proposta.");
    } finally {
      setResponding(null);
    }
  }

  return (
    <div className="bg-white rounded-xl shadow-sm p-4">
      <h3 className="text-base font-semibold text-dark mb-1">Propostas de rotina</h3>
      <p className="text-xs text-muted mb-3">
        Mudança fixa só vale com o OK do outro responsável.
      </p>
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-3 mb-3 text-sm text-red-600">
          {error}
        </div>
      )}
      <div className="space-y-3">
        {proposals.map((p) => (
          <div key={p.id} className="border border-gray-100 rounded-xl p-3">
            <div className="flex items-start justify-between mb-2">
              <div>
                <p className="text-sm font-medium text-dark">{p.proposerName} propôs</p>
                <p className="text-xs text-muted">🔁 Mudança fixa: {p.description}</p>
              </div>
              <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">
                Pendente
              </span>
            </div>
            {p.proposedByMe ? (
              <p className="text-xs text-muted">Aguardando o OK do outro responsável.</p>
            ) : (
              <div className="flex gap-2">
                <button
                  onClick={() => handleRespond(p.id, "accepted")}
                  disabled={responding === p.id}
                  className="flex-1 px-3 py-2 bg-green-600 text-white text-sm font-medium rounded-xl hover:bg-green-700 transition-colors disabled:opacity-50"
                >
                  {responding === p.id ? "Enviando…" : "Aceitar"}
                </button>
                <button
                  onClick={() => handleRespond(p.id, "declined")}
                  disabled={responding === p.id}
                  className="flex-1 px-3 py-2 border border-gray-200 text-dark text-sm font-medium rounded-xl hover:bg-gray-50 transition-colors disabled:opacity-50"
                >
                  Recusar
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
