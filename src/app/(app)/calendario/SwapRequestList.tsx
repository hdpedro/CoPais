"use client";

import { useState } from "react";
import { respondToSwapRequest } from "@/actions/calendar";

interface SwapRequest {
  id: string;
  original_date: string;
  proposed_date: string | null;
  reason: string | null;
  status: string;
  created_at: string;
  requester: { full_name: string } | null;
  target: { full_name: string } | null;
  requester_id: string;
  target_user_id: string;
}

interface SwapRequestListProps {
  requests: SwapRequest[];
  currentUserId: string;
}

export default function SwapRequestList({ requests, currentUserId }: SwapRequestListProps) {
  const [responding, setResponding] = useState<string | null>(null);

  if (requests.length === 0) return null;

  async function handleRespond(requestId: string, response: "approved" | "rejected") {
    setResponding(requestId);
    const formData = new FormData();
    formData.set("requestId", requestId);
    formData.set("response", response);
    await respondToSwapRequest(formData);
    setResponding(null);
  }

  const formatDate = (d: string) =>
    new Date(d + "T12:00:00").toLocaleDateString("pt-BR", {
      day: "numeric",
      month: "short",
      weekday: "short",
    });

  const statusConfig: Record<string, { label: string; className: string }> = {
    pending: { label: "Pendente", className: "bg-amber-100 text-amber-700" },
    approved: { label: "Aprovada", className: "bg-green-100 text-green-700" },
    rejected: { label: "Recusada", className: "bg-red-100 text-red-700" },
    cancelled: { label: "Cancelada", className: "bg-gray-100 text-gray-500" },
  };

  return (
    <div className="bg-white rounded-xl shadow-sm p-4">
      <h3 className="text-base font-semibold text-dark mb-3">Solicitacoes de Troca</h3>
      <div className="space-y-3">
        {requests.map((req) => {
          const cfg = statusConfig[req.status] || statusConfig.pending;
          const isTarget = req.target_user_id === currentUserId;
          const isPending = req.status === "pending";

          return (
            <div key={req.id} className="border border-gray-100 rounded-xl p-3">
              <div className="flex items-start justify-between mb-2">
                <div>
                  <p className="text-sm font-medium text-dark">
                    {req.requester?.full_name || "Usuario"}
                  </p>
                  <p className="text-xs text-muted">
                    {req.requester_id === currentUserId ? "Voce solicitou" : "Solicitou troca"}
                  </p>
                </div>
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${cfg.className}`}>
                  {cfg.label}
                </span>
              </div>

              <div className="flex items-center gap-2 text-sm">
                <span className="bg-gray-100 px-2 py-1 rounded text-dark">
                  {formatDate(req.original_date)}
                </span>
                <svg className="w-4 h-4 text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                </svg>
                <span className="bg-gray-100 px-2 py-1 rounded text-dark">
                  {req.proposed_date ? formatDate(req.proposed_date) : "—"}
                </span>
              </div>

              {req.reason && (
                <p className="text-xs text-muted mt-2 italic">&quot;{req.reason}&quot;</p>
              )}

              {isPending && isTarget && (
                <div className="flex gap-2 mt-3">
                  <button
                    onClick={() => handleRespond(req.id, "approved")}
                    disabled={responding === req.id}
                    className="flex-1 px-3 py-2 bg-green-500 text-white text-sm font-medium rounded-lg hover:bg-green-600 transition-colors disabled:opacity-50"
                  >
                    Aceitar
                  </button>
                  <button
                    onClick={() => handleRespond(req.id, "rejected")}
                    disabled={responding === req.id}
                    className="flex-1 px-3 py-2 bg-red-500 text-white text-sm font-medium rounded-lg hover:bg-red-600 transition-colors disabled:opacity-50"
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
