"use client";

import { useState } from "react";
import { respondToEventRequest } from "@/actions/events";
import { useI18n } from "@/i18n/provider";

interface EventRequest {
  id: string;
  event_id: string;
  action_type: string;
  proposed_changes: Record<string, unknown> | null;
  original_snapshot: Record<string, unknown>;
  reason: string | null;
  status: string;
  created_at: string;
  requester_id: string;
  affected_user_ids: string[];
  requester: { full_name: string; avatar_url: string | null } | null;
}

interface EventRequestListProps {
  requests: EventRequest[];
  currentUserId: string;
}

export default function EventRequestList({ requests, currentUserId }: EventRequestListProps) {
  useI18n();
  const [responding, setResponding] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<{
    requestId: string;
    response: "approved" | "rejected";
    eventTitle: string;
  } | null>(null);

  if (requests.length === 0) return null;

  async function handleRespond(requestId: string, response: "approved" | "rejected") {
    setResponding(requestId);
    setConfirmAction(null);
    setError(null);
    try {
      const formData = new FormData();
      formData.set("requestId", requestId);
      formData.set("response", response);
      const result = await respondToEventRequest(formData);
      if (result?.error) {
        setError(result.error);
      }
    } catch {
      setError("Erro ao responder solicitacao.");
    } finally {
      setResponding(null);
    }
  }

  const actionLabels: Record<string, string> = {
    edit: "Editar",
    cancel: "Cancelar",
    reschedule: "Reagendar",
    delete: "Excluir",
  };

  const actionIcons: Record<string, string> = {
    edit: "✏️",
    cancel: "❌",
    reschedule: "📅",
    delete: "🗑️",
  };

  const formatDate = (d: string) =>
    new Date(d + "T12:00:00").toLocaleDateString("pt-BR", {
      day: "numeric",
      month: "short",
      weekday: "short",
    });

  return (
    <div className="bg-white rounded-xl shadow-sm p-4">
      <h3 className="text-base font-semibold text-dark mb-3">
        Solicitacoes de Eventos
      </h3>
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-3 mb-3 text-sm text-red-600">
          {error}
        </div>
      )}
      <div className="space-y-3">
        {requests.map((req) => {
          const isAffected = (req.affected_user_ids || []).includes(currentUserId);
          const isPending = req.status === "pending";
          const snapshot = req.original_snapshot || {};
          const changes = req.proposed_changes || {};
          const eventTitle = (snapshot.title as string) || "Evento";
          const requesterName = req.requester?.full_name?.split(" ")[0] || "Alguem";

          return (
            <div key={req.id} className="border border-gray-100 rounded-xl p-3">
              {/* Header */}
              <div className="flex items-start justify-between mb-2">
                <div>
                  <p className="text-sm font-medium text-dark">
                    {requesterName}
                  </p>
                  <p className="text-xs text-muted">
                    {actionIcons[req.action_type]} Quer {actionLabels[req.action_type]?.toLowerCase()} &quot;{eventTitle}&quot;
                  </p>
                </div>
                <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">
                  Pendente
                </span>
              </div>

              {/* Diff visual */}
              {req.action_type === "edit" && changes && Object.keys(changes).length > 0 && (
                <DiffBlock changes={changes} snapshot={snapshot} formatDate={formatDate} />
              )}

              {req.action_type === "cancel" && (
                <div className="bg-amber-50 rounded-lg p-2 mb-2">
                  <p className="text-xs text-amber-700">
                    Evento sera cancelado: &quot;{eventTitle}&quot; em {formatDate(snapshot.event_date as string)}
                  </p>
                </div>
              )}

              {req.action_type === "delete" && (
                <div className="bg-red-50 rounded-lg p-2 mb-2">
                  <p className="text-xs text-red-600">
                    Evento sera excluido permanentemente: &quot;{eventTitle}&quot;
                  </p>
                </div>
              )}

              {/* Reason */}
              {req.reason && (
                <p className="text-xs text-muted mt-1 italic">&quot;{req.reason}&quot;</p>
              )}

              {/* Action buttons */}
              {isPending && isAffected && (
                <div className="flex gap-2 mt-3">
                  <button
                    onClick={() => setConfirmAction({ requestId: req.id, response: "approved", eventTitle })}
                    disabled={responding === req.id}
                    className="flex-1 px-3 py-2 bg-green-500 text-white text-sm font-medium rounded-lg hover:bg-green-600 transition-colors disabled:opacity-50"
                  >
                    {responding === req.id ? "..." : "Aprovar"}
                  </button>
                  <button
                    onClick={() => setConfirmAction({ requestId: req.id, response: "rejected", eventTitle })}
                    disabled={responding === req.id}
                    className="flex-1 px-3 py-2 bg-red-500 text-white text-sm font-medium rounded-lg hover:bg-red-600 transition-colors disabled:opacity-50"
                  >
                    {responding === req.id ? "..." : "Recusar"}
                  </button>
                </div>
              )}

              {isPending && !isAffected && req.requester_id === currentUserId && (
                <p className="text-xs text-muted mt-2 text-center">
                  Aguardando aprovacao...
                </p>
              )}
            </div>
          );
        })}
      </div>

      {/* Confirmation Modal */}
      {confirmAction && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setConfirmAction(null)}>
          <div className="bg-white rounded-2xl max-w-sm w-full p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className={`w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-3 ${
              confirmAction.response === "approved" ? "bg-green-100" : "bg-red-100"
            }`}>
              {confirmAction.response === "approved" ? (
                <svg className="w-6 h-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              ) : (
                <svg className="w-6 h-6 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              )}
            </div>
            <h3 className="text-center text-lg font-bold text-dark mb-1">
              {confirmAction.response === "approved" ? "Aprovar alteracao?" : "Recusar alteracao?"}
            </h3>
            <p className="text-center text-sm text-muted mb-5">
              {confirmAction.response === "approved"
                ? `A alteracao em "${confirmAction.eventTitle}" sera aplicada.`
                : `A alteracao em "${confirmAction.eventTitle}" sera descartada.`
              }
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmAction(null)}
                className="flex-1 px-4 py-2.5 border border-gray-200 text-dark font-medium rounded-xl hover:bg-gray-50 transition-colors text-sm"
              >
                Voltar
              </button>
              <button
                onClick={() => handleRespond(confirmAction.requestId, confirmAction.response)}
                className={`flex-1 px-4 py-2.5 text-white font-semibold rounded-xl transition-colors text-sm ${
                  confirmAction.response === "approved"
                    ? "bg-green-500 hover:bg-green-600"
                    : "bg-red-500 hover:bg-red-600"
                }`}
              >
                {confirmAction.response === "approved" ? "Sim, aprovar" : "Sim, recusar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Diff block comparing original vs proposed changes
function DiffBlock({
  changes,
  snapshot,
  formatDate,
}: {
  changes: Record<string, unknown>;
  snapshot: Record<string, unknown>;
  formatDate: (d: string) => string;
}) {
  const diffs: Array<{ label: string; oldVal: string; newVal: string }> = [];

  if (changes.title && String(changes.title) !== String(snapshot.title || "")) {
    diffs.push({ label: "Titulo", oldVal: String(snapshot.title || ""), newVal: String(changes.title) });
  }
  if (changes.event_date && String(changes.event_date) !== String(snapshot.event_date || "")) {
    diffs.push({ label: "Data", oldVal: formatDate(String(snapshot.event_date)), newVal: formatDate(String(changes.event_date)) });
  }
  if (changes.event_time !== undefined && String(changes.event_time || "") !== String(snapshot.event_time || "")) {
    diffs.push({ label: "Horario", oldVal: String(snapshot.event_time || "sem horario"), newVal: String(changes.event_time || "sem horario") });
  }
  if (changes.location !== undefined && String(changes.location || "") !== String(snapshot.location || "")) {
    diffs.push({ label: "Local", oldVal: String(snapshot.location || "sem local"), newVal: String(changes.location || "sem local") });
  }
  if (changes.description !== undefined && String(changes.description || "") !== String(snapshot.description || "")) {
    diffs.push({ label: "Descricao", oldVal: String(snapshot.description || "sem descricao"), newVal: String(changes.description || "sem descricao") });
  }

  if (diffs.length === 0) return null;

  return (
    <div className="bg-gray-50 rounded-lg p-3 mb-2 space-y-1.5">
      {diffs.map((d) => (
        <DiffLine key={d.label} label={d.label} oldVal={d.oldVal} newVal={d.newVal} />
      ))}
    </div>
  );
}

// Diff line component for visual comparison
function DiffLine({ label, oldVal, newVal }: { label: string; oldVal: string; newVal: string }) {
  return (
    <div className="text-xs">
      <span className="font-medium text-dark/70">{label}:</span>
      <div className="flex flex-col gap-0.5 mt-0.5 ml-2">
        <span className="text-red-500 line-through">- {oldVal}</span>
        <span className="text-green-600">+ {newVal}</span>
      </div>
    </div>
  );
}
