"use client";

import { useState, useEffect, useCallback } from "react";
import { openFile, downloadFile } from "@/lib/files/client";

interface Props {
  expenseId: string;
  url: string;
}

export default function ReceiptViewer({ expenseId, url }: Props) {
  const [open, setOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const isPdf = url.toLowerCase().includes(".pdf");

  // Abre via stream proxy `/api/files/[id]?type=receipt` — rate-limit
  // (download-file 10/min, 50/h) + audit log em usage_events. Em 429
  // mostramos mensagem em vez de tentar a URL antiga (que seria bypass).
  const openExternal = useCallback(async () => {
    if (refreshing) return;
    setRefreshing(true);
    setErrorMsg(null);
    try {
      const result = await openFile(expenseId, "receipt");
      if (!result.ok) {
        if (result.error === "popup_blocked") {
          const dl = await downloadFile(expenseId, "receipt");
          if (!dl.ok) {
            setErrorMsg(
              dl.status === 429
                ? "Muitos downloads. Aguarde um momento."
                : dl.error ?? "Falha ao baixar comprovante.",
            );
          }
        } else {
          setErrorMsg(
            result.status === 429
              ? "Muitos downloads. Aguarde um momento."
              : result.error ?? "Falha ao abrir comprovante.",
          );
        }
      }
    } finally {
      setRefreshing(false);
    }
  }, [expenseId, refreshing]);

  const handleEscape = useCallback((e: KeyboardEvent) => {
    if (e.key === "Escape") setOpen(false);
  }, []);

  useEffect(() => {
    if (open) {
      document.addEventListener("keydown", handleEscape);
      return () => document.removeEventListener("keydown", handleEscape);
    }
  }, [open, handleEscape]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="p-1.5 text-primary hover:bg-primary/10 rounded-lg transition-colors"
        title="Ver comprovante"
      >
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M18.375 12.739l-7.693 7.693a4.5 4.5 0 01-6.364-6.364l10.94-10.94A3 3 0 1119.5 7.372L8.552 18.32m.009-.01l-.01.01m5.699-9.941l-7.81 7.81a1.5 1.5 0 002.112 2.13" />
        </svg>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="relative bg-white rounded-xl max-w-lg w-full max-h-[85vh] overflow-auto shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-gray-100">
              <h3 className="font-semibold text-dark">Comprovante</h3>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => void openExternal()}
                  disabled={refreshing}
                  className="p-2 text-muted hover:text-primary hover:bg-primary/10 rounded-lg transition-colors disabled:opacity-60"
                  title="Abrir em nova aba"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                  </svg>
                </button>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="p-2 text-muted hover:text-error hover:bg-error/10 rounded-lg transition-colors"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            {errorMsg && (
              <div className="px-4 pt-3">
                <p className="text-xs text-red-500">{errorMsg}</p>
              </div>
            )}
            {/* Content */}
            <div className="p-4">
              {isPdf ? (
                <div className="text-center py-8">
                  <svg className="w-16 h-16 text-error mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                  </svg>
                  <p className="text-sm text-muted mb-3">Documento PDF</p>
                  <button
                    type="button"
                    onClick={() => void openExternal()}
                    disabled={refreshing}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary-dark transition-colors disabled:opacity-60"
                  >
                    Abrir PDF
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                    </svg>
                  </button>
                </div>
              ) : (
                // signed URL com TTL curto — next/image cacharia o token,
                // o que conflita com o objetivo do hardening.
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={url}
                  alt="Comprovante"
                  className="w-full rounded-lg"
                />
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
