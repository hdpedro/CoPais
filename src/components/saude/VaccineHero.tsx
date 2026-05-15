"use client";

/**
 * VaccineHero — card primário com statusLabel CALMO.
 *
 * Mostra label qualitativo grande ("Em dia" / "1 reforço pendente").
 * Tap revela cobertura % e hint de Ajustes em segunda camada.
 *
 * Sem alarmismo, paleta Apple Health-like:
 *   - Em dia → verde aconchegante
 *   - 1+ pendente → laranja-suave
 *   - Complete histórico/empty → cinza neutro
 */

import { useState } from "react";
import { useI18n } from "@/i18n/provider";
import type { VaccineStatusResult } from "@/lib/services/vaccines";

interface Props {
  status: VaccineStatusResult;
  childFirstName: string;
}

function formatBrDate(iso: string): string {
  return iso.split("-").reverse().join("/");
}

function daysUntil(iso: string): number {
  const d = new Date(iso + "T12:00:00").getTime();
  return Math.ceil((d - Date.now()) / 86400000);
}

export default function VaccineHero({ status, childFirstName }: Props) {
  const { t } = useI18n();
  const [expanded, setExpanded] = useState(false);

  const totalPending = status.totals.overdue + status.totals.dueSoon;
  const onTrack = totalPending === 0 && (status.totals.taken > 0 || status.totals.upcoming > 0);
  const onlyHistGap = totalPending === 0 && status.totals.taken === 0 && status.totals.historicalGap > 0;

  const palette = onlyHistGap
    ? "from-gray-50 to-gray-100/50 border-gray-200 text-gray-800"
    : onTrack
    ? "from-emerald-50 to-emerald-100/40 border-emerald-200 text-emerald-900"
    : totalPending > 0
    ? "from-amber-50 to-orange-50/40 border-amber-200 text-amber-900"
    : "from-gray-50 to-gray-100/50 border-gray-200 text-gray-800";

  let nextLine: string | null = null;
  if (status.nextDue) {
    const d = daysUntil(status.nextDue.dueDate);
    if (d <= 0) {
      // due_date já passou (dentro tolerância ou overdue) — mensagem calma "hoje"
      nextLine = t("health.vaccineEngine.nextDueToday", { name: status.nextDue.vaccineName });
    } else if (d === 1) {
      nextLine = t("health.vaccineEngine.nextDueTomorrow", { name: status.nextDue.vaccineName });
    } else if (d < 60) {
      nextLine = t("health.vaccineEngine.nextDueInDays", { name: status.nextDue.vaccineName, count: String(d) });
    } else {
      nextLine = t("health.vaccineEngine.nextDueLine", { name: status.nextDue.vaccineName, date: formatBrDate(status.nextDue.dueDate) });
    }
  }

  return (
    <button
      type="button"
      onClick={() => setExpanded((v) => !v)}
      className={`w-full text-left rounded-2xl bg-gradient-to-br ${palette} border p-5 transition-all shadow-sm hover:shadow-md`}
      aria-expanded={expanded}
    >
      <div className="flex items-start gap-4">
        <div className="w-14 h-14 rounded-2xl bg-white/80 flex items-center justify-center text-3xl flex-shrink-0">
          {onTrack ? "🛡️" : totalPending > 0 ? "💉" : "📋"}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[11px] uppercase tracking-wider font-semibold opacity-70">
            {t("health.vaccineEngine.preventiveCareTitle")} · {childFirstName}
          </p>
          <p className="text-xl font-bold mt-0.5 leading-snug">
            {status.statusLabel}
          </p>
          {nextLine ? (
            <p className="text-[12px] mt-1 opacity-80">
              {t("health.vaccineEngine.nextDue")}: {nextLine}
            </p>
          ) : null}
          {expanded ? (
            <div className="mt-3 pt-3 border-t border-current/10 space-y-1">
              <p className="text-[12px] opacity-90">
                {t("health.vaccineEngine.coverageDetail", { pct: String(status.coveragePct) })}
              </p>
              <p className="text-[11px] opacity-60">
                {t("health.vaccineEngine.coverageHint")}
              </p>
            </div>
          ) : null}
        </div>
        <svg
          aria-hidden
          className={`w-4 h-4 opacity-50 mt-2 flex-shrink-0 transition-transform ${expanded ? "rotate-90" : ""}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
      </div>
    </button>
  );
}
