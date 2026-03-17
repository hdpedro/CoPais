"use client";

import { useState } from "react";
import { getOrCreateCalendarToken } from "@/actions/calendar";

interface CalendarExportButtonProps {
  groupId: string;
}

export default function CalendarExportButton({ groupId }: CalendarExportButtonProps) {
  const [showModal, setShowModal] = useState(false);
  const [calUrl, setCalUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  async function handleExport() {
    setLoading(true);
    const result = await getOrCreateCalendarToken(groupId);
    setLoading(false);

    if (result.token) {
      const baseUrl = window.location.origin;
      setCalUrl(`${baseUrl}/api/calendar/${result.token}`);
      setShowModal(true);
    }
  }

  function handleCopy() {
    navigator.clipboard.writeText(calUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <>
      <button
        onClick={handleExport}
        disabled={loading}
        className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-white border border-gray-200 rounded-xl text-dark font-medium hover:bg-gray-50 transition-colors shadow-sm"
      >
        <svg className="w-5 h-5 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
        {loading ? "Gerando..." : "Sincronizar com Celular"}
      </button>

      {showModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center">
          <div className="bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-dark">Sincronizar Calendario</h3>
              <button onClick={() => setShowModal(false)} className="p-1 hover:bg-gray-100 rounded-lg">
                <svg className="w-5 h-5 text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* URL */}
            <div className="bg-gray-50 rounded-lg p-3 mb-4">
              <p className="text-xs text-muted mb-1">URL de assinatura:</p>
              <div className="flex items-center gap-2">
                <code className="text-xs text-dark flex-1 break-all">{calUrl}</code>
                <button
                  onClick={handleCopy}
                  className="flex-shrink-0 px-3 py-1 bg-primary text-white text-xs font-medium rounded-lg"
                >
                  {copied ? "Copiado!" : "Copiar"}
                </button>
              </div>
            </div>

            {/* Instructions */}
            <div className="space-y-4">
              <div>
                <h4 className="text-sm font-semibold text-dark flex items-center gap-2">
                  <span>🍎</span> iPhone
                </h4>
                <ol className="text-xs text-muted mt-1 space-y-1 list-decimal list-inside">
                  <li>Abra <strong>Ajustes</strong> → <strong>Calendario</strong> → <strong>Contas</strong></li>
                  <li>Toque em <strong>Adicionar Conta</strong> → <strong>Outro</strong></li>
                  <li>Toque em <strong>Assinar Calendario</strong></li>
                  <li>Cole a URL acima e salve</li>
                </ol>
              </div>

              <div>
                <h4 className="text-sm font-semibold text-dark flex items-center gap-2">
                  <span>🤖</span> Android
                </h4>
                <ol className="text-xs text-muted mt-1 space-y-1 list-decimal list-inside">
                  <li>Abra o <strong>Google Calendar</strong> no computador</li>
                  <li>Clique em <strong>+</strong> ao lado de &quot;Outros calendarios&quot;</li>
                  <li>Selecione <strong>Por URL</strong></li>
                  <li>Cole a URL acima e adicione</li>
                </ol>
              </div>
            </div>

            <button
              onClick={() => setShowModal(false)}
              className="w-full mt-4 px-4 py-3 bg-primary text-white font-semibold rounded-xl hover:bg-primary-dark transition-colors"
            >
              Entendi
            </button>
          </div>
        </div>
      )}
    </>
  );
}
