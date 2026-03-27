"use client";

import { useState } from "react";
import { getOrCreateCalendarToken } from "@/actions/calendar";
import { useI18n } from "@/i18n/provider";

interface CalendarExportButtonProps {
  groupId: string;
}

export default function CalendarExportButton({ groupId }: CalendarExportButtonProps) {
  const { t } = useI18n();
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
        {loading ? t("calendar.syncGenerating") : t("calendar.syncButton")}
      </button>

      {showModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center">
          <div className="bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-dark">{t("calendar.syncTitle")}</h3>
              <button onClick={() => setShowModal(false)} className="p-1 hover:bg-gray-100 rounded-lg">
                <svg className="w-5 h-5 text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <p className="text-xs text-muted mb-3">{t("calendar.syncDescription")}</p>

            {/* One-click subscribe button (uses webcal:// protocol) */}
            <a
              href={calUrl.replace("https://", "webcal://").replace("http://", "webcal://")}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-primary text-white font-semibold rounded-xl hover:bg-primary/90 transition-colors mb-3"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              {t("calendar.syncOneClick") || "Adicionar ao meu calendário"}
            </a>
            <p className="text-[10px] text-muted text-center mb-4">{t("calendar.syncOneClickHint") || "Funciona com Apple Calendar, Google Calendar e Outlook"}</p>

            {/* Manual URL */}
            <details className="mb-4">
              <summary className="text-xs font-medium text-muted cursor-pointer hover:text-dark">{t("calendar.syncManual") || "Configuração manual"}</summary>
              <div className="bg-gray-50 rounded-lg p-3 mt-2">
                <p className="text-xs text-muted mb-1">{t("calendar.syncUrl")}:</p>
                <div className="flex items-center gap-2">
                  <code className="text-xs text-dark flex-1 break-all">{calUrl}</code>
                  <button
                    onClick={handleCopy}
                    className="flex-shrink-0 px-3 py-1 bg-primary text-white text-xs font-medium rounded-lg"
                  >
                    {copied ? t("calendar.syncCopied") : t("common.export")}
                  </button>
                </div>
              </div>

              <div className="space-y-3 mt-3">
                <div>
                  <h4 className="text-sm font-semibold text-dark flex items-center gap-2">🍎 iPhone / iPad</h4>
                  <ol className="text-xs text-muted mt-1 space-y-1 list-decimal list-inside">
                    <li>Toque no botão acima &quot;Adicionar ao meu calendário&quot;</li>
                    <li>O iOS vai perguntar &quot;Deseja assinar este calendário?&quot;</li>
                    <li>Toque em &quot;Assinar&quot;</li>
                  </ol>
                  <p className="text-[10px] text-muted mt-1 italic">Alternativa: Ajustes → Calendário → Contas → Adicionar Conta → Calendário Assinado → Cole a URL</p>
                </div>
                <div>
                  <h4 className="text-sm font-semibold text-dark flex items-center gap-2">🤖 Android / Google</h4>
                  <ol className="text-xs text-muted mt-1 space-y-1 list-decimal list-inside">
                    <li>Abra calendar.google.com no navegador</li>
                    <li>Clique em + ao lado de &quot;Outros calendários&quot;</li>
                    <li>Selecione &quot;Por URL&quot;</li>
                    <li>Cole a URL acima e adicione</li>
                  </ol>
                </div>
              </div>
            </details>

            <button
              onClick={() => setShowModal(false)}
              className="w-full mt-4 px-4 py-3 bg-primary text-white font-semibold rounded-xl hover:bg-primary-dark transition-colors"
            >
              {t("calendar.syncUnderstood")}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
