"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { respondToSwapRequest } from "@/actions/calendar";
import { getDisplayName } from "@/lib/constants";
import { useI18n } from "@/i18n/provider";

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
  const { t } = useI18n();
  const router = useRouter();
  const [responding, setResponding] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<{ requestId: string; response: "approved" | "rejected"; requesterName: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (requests.length === 0) return null;

  async function handleRespond(requestId: string, response: "approved" | "rejected") {
    setResponding(requestId);
    setConfirmAction(null);
    setError(null);
    try {
      const formData = new FormData();
      formData.set("requestId", requestId);
      formData.set("response", response);
      const result = await respondToSwapRequest(formData);
      if (result?.error) {
        setError(result.error);
      } else {
        router.refresh();
      }
    } catch {
      setError(t("swapList.errorResponding"));
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

  const statusConfig: Record<string, { label: string; className: string }> = {
    pending: { label: t("swapList.statusPending"), className: "bg-amber-100 text-amber-700" },
    approved: { label: t("swapList.statusApproved"), className: "bg-green-100 text-green-700" },
    rejected: { label: t("swapList.statusRejected"), className: "bg-red-100 text-red-700" },
    cancelled: { label: t("swapList.statusCancelled"), className: "bg-gray-100 text-gray-500" },
  };

  return (
    <div className="bg-white rounded-xl shadow-sm p-4">
      <h3 className="text-base font-semibold text-dark mb-3">{t("swapList.requests")}</h3>
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-3 mb-3 text-sm text-red-600">
          {error}
        </div>
      )}
      <div className="space-y-3">
        {requests.map((req) => {
          const cfg = statusConfig[req.status] || statusConfig.pending;
          const isTarget = req.target_user_id === currentUserId;
          const isPending = req.status === "pending";
          const isDebtSwap = !req.proposed_date && req.reason?.startsWith("[DIVIDA]");
          const isVisit = !req.proposed_date && !isDebtSwap;
          const isRequester = req.requester_id === currentUserId;

          return (
            <div key={req.id} className="border border-gray-100 rounded-xl p-3">
              <div className="flex items-start justify-between mb-2">
                <div>
                  <p className="text-sm font-medium text-dark">
                    {getDisplayName(req.requester?.full_name) || t("swapList.user")}
                  </p>
                  <p className="text-xs text-muted">
                    {isRequester
                      ? (isVisit ? t("swapList.youRequestedVisit") : isDebtSwap ? t("swapList.youRequestedDebt") : t("swapList.youRequestedSwap"))
                      : (isVisit ? t("swapList.requestedVisit") : isDebtSwap ? t("swapList.requestedDebt") : t("swapList.requestedSwap"))
                    }
                  </p>
                </div>
                <div className="flex items-center gap-1.5">
                  {isVisit && (
                    <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">
                      {t("swapList.visit")}
                    </span>
                  )}
                  {isDebtSwap && (
                    <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">
                      {t("swapList.debt")}
                    </span>
                  )}
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${cfg.className}`}>
                    {cfg.label}
                  </span>
                </div>
              </div>

              {isVisit ? (
                <div className="flex items-center gap-2 text-sm">
                  <svg className="w-4 h-4 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  <span className="bg-blue-50 px-2 py-1 rounded text-dark font-medium">
                    {formatDate(req.original_date)}
                  </span>
                </div>
              ) : isDebtSwap ? (
                <div className="flex items-center gap-2 text-sm">
                  <span className="bg-amber-50 px-2 py-1 rounded text-dark font-medium">
                    {formatDate(req.original_date)}
                  </span>
                  <span className="text-xs text-amber-600">{t("swapList.noReturnDate")}</span>
                </div>
              ) : (
                <div className="flex items-center gap-2 text-sm">
                  <span className="bg-gray-100 px-2 py-1 rounded text-dark">
                    {formatDate(req.original_date)}
                  </span>
                  <svg className="w-4 h-4 text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                  </svg>
                  <span className="bg-gray-100 px-2 py-1 rounded text-dark">
                    {formatDate(req.proposed_date!)}
                  </span>
                </div>
              )}

              {req.reason && req.reason.replace(/^\[DIVIDA\]\s*/, "").length > 0 && (
                <p className="text-xs text-muted mt-2 italic">&quot;{req.reason.replace(/^\[DIVIDA\]\s*/, "")}&quot;</p>
              )}

              {isPending && isTarget && (
                <div className="flex gap-2 mt-3">
                  <button
                    onClick={() => setConfirmAction({ requestId: req.id, response: "approved", requesterName: getDisplayName(req.requester?.full_name, true) || t("swapList.user") })}
                    disabled={responding === req.id}
                    className="flex-1 px-3 py-2 bg-green-500 text-white text-sm font-medium rounded-lg hover:bg-green-600 transition-colors disabled:opacity-50"
                  >
                    {responding === req.id ? "..." : t("swapList.accept")}
                  </button>
                  <button
                    onClick={() => setConfirmAction({ requestId: req.id, response: "rejected", requesterName: getDisplayName(req.requester?.full_name, true) || t("swapList.user") })}
                    disabled={responding === req.id}
                    className="flex-1 px-3 py-2 bg-red-500 text-white text-sm font-medium rounded-lg hover:bg-red-600 transition-colors disabled:opacity-50"
                  >
                    {responding === req.id ? "..." : t("swapList.reject")}
                  </button>
                </div>
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
            <h3 className="text-center text-lg font-bold text-[#2C2C2C] mb-1">
              {confirmAction.response === "approved" ? t("swapList.confirmAcceptTitle") : t("swapList.confirmRejectTitle")}
            </h3>
            <p className="text-center text-sm text-[#7A8C8B] mb-5">
              {confirmAction.response === "approved"
                ? t("swapList.confirmAcceptMessage", { name: confirmAction.requesterName })
                : t("swapList.confirmRejectMessage", { name: confirmAction.requesterName })
              }
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmAction(null)}
                className="flex-1 px-4 py-2.5 border border-gray-200 text-[#2C2C2C] font-medium rounded-xl hover:bg-gray-50 transition-colors text-sm"
              >
                {t("common.cancel")}
              </button>
              <button
                onClick={() => handleRespond(confirmAction.requestId, confirmAction.response)}
                className={`flex-1 px-4 py-2.5 text-white font-semibold rounded-xl transition-colors text-sm ${
                  confirmAction.response === "approved"
                    ? "bg-green-500 hover:bg-green-600"
                    : "bg-red-500 hover:bg-red-600"
                }`}
              >
                {confirmAction.response === "approved" ? t("swapList.yesAccept") : t("swapList.yesReject")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
