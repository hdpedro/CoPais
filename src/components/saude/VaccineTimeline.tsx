"use client";

/**
 * VaccineTimeline — visualização tipo Apple Health da carteirinha vacinal.
 *
 * Mostra todas as doses (passadas + futuras) agrupadas por idade. Cada ponto
 * tem cor consistente com o status:
 *   taken        → verde
 *   due_soon     → laranja-suave (chamada de ação calma)
 *   overdue      → laranja-suave (mesmo tom — sem alarmismo)
 *   upcoming     → azul claro
 *   future       → cinza neutro
 *   historical_gap → cinza-tracejado
 *   out_of_window → cinza translúcido
 *
 * Tap em uma dose mostra detalhes inline (expansion). Sem juízo clínico
 * — só "tomada em DD/MM" ou "prevista" / "pode estar faltando".
 */

import { useState } from "react";
import Link from "next/link";
import { useI18n } from "@/i18n/provider";
import type { TimelineGroup, VaccineDoseStatus, VaccineStatus } from "@/lib/services/vaccines";

interface Props {
  timeline: TimelineGroup[];
}

const STATUS_DOT: Record<VaccineStatus, string> = {
  taken: "bg-emerald-500 border-emerald-600",
  due_soon: "bg-amber-300 border-amber-400",
  overdue: "bg-amber-400 border-amber-500",
  upcoming: "bg-sky-300 border-sky-400",
  future: "bg-gray-200 border-gray-300",
  historical_gap: "bg-gray-100 border-dashed border-gray-300",
  out_of_window: "bg-gray-100 border-gray-200 opacity-60",
};

const STATUS_LINE: Record<VaccineStatus, string> = {
  taken: "text-emerald-700",
  due_soon: "text-amber-700",
  overdue: "text-amber-700",
  upcoming: "text-sky-700",
  future: "text-gray-500",
  historical_gap: "text-gray-500 italic",
  out_of_window: "text-gray-400",
};

function formatBrDate(iso: string): string {
  return iso.split("-").reverse().join("/");
}

export default function VaccineTimeline({ timeline }: Props) {
  const { t } = useI18n();
  const [expanded, setExpanded] = useState<string | null>(null);

  if (timeline.length === 0) {
    return (
      <div className="text-center py-8 text-sm text-muted">
        {t("health.vaccineEngine.timelineEmpty")}
      </div>
    );
  }

  function statusLabel(d: VaccineDoseStatus): string {
    if (d.status === "taken" && d.takenDate) {
      return t("health.vaccineEngine.doseTakenOn", { date: formatBrDate(d.takenDate) });
    }
    if (d.status === "future") return t("health.vaccineEngine.doseFuture");
    if (d.status === "historical_gap") return t("health.vaccineEngine.doseHistoricalGap");
    if (d.status === "out_of_window") return t("health.vaccineEngine.doseOutOfWindow");
    if (d.status === "upcoming") return `${t("health.vaccineEngine.doseFuture")} · ${formatBrDate(d.dueDate)}`;
    return formatBrDate(d.dueDate);
  }

  return (
    <ol className="relative border-l border-gray-200 ml-3 space-y-5">
      {timeline.map((group) => (
        <li key={group.ageBucket} className="pl-5">
          <div className="absolute -left-[7px] mt-1 w-3.5 h-3.5 rounded-full bg-white border-2 border-primary/60" />
          <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted mb-2">
            {t(`health.vaccineEngine.ageBucket_${group.ageBucket}`)}
          </h3>
          <ul className="space-y-1.5">
            {group.doses.map((dose) => {
              const isOpen = expanded === dose.id;
              // Doses 'taken' tem registro associado — clique abre detalhe.
              // Doses pendentes (overdue/due_soon/upcoming) abrem expand inline.
              if (dose.status === "taken" && dose.takenRecordId) {
                return (
                  <li key={dose.id}>
                    <Link
                      href={`/saude/vacinas/${dose.takenRecordId}`}
                      className="flex items-start gap-2.5 py-2 px-3 rounded-lg hover:bg-gray-50 transition-colors"
                    >
                      <span className={`w-3 h-3 rounded-full mt-1.5 border ${STATUS_DOT[dose.status]} flex-shrink-0`} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <p className="text-sm font-medium text-dark truncate">
                            {dose.vaccineName}
                            {dose.doseLabel ? <span className="text-muted font-normal"> · {dose.doseLabel}</span> : null}
                          </p>
                          {dose.ruleNetwork === "public" ? (
                            <span className="text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700">
                              PNI
                            </span>
                          ) : dose.ruleNetwork === "private" ? (
                            <span className="text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-sky-50 text-sky-700">
                              SBIm
                            </span>
                          ) : null}
                        </div>
                        <p className={`text-[11px] mt-0.5 ${STATUS_LINE[dose.status]}`}>
                          {statusLabel(dose)}
                        </p>
                      </div>
                      <svg
                        className="w-3.5 h-3.5 text-muted/50 flex-shrink-0 mt-1.5"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </Link>
                  </li>
                );
              }
              return (
                <li key={dose.id}>
                  <button
                    type="button"
                    onClick={() => setExpanded(isOpen ? null : dose.id)}
                    className="w-full text-left flex items-start gap-2.5 py-2 px-3 rounded-lg hover:bg-gray-50 transition-colors"
                    aria-expanded={isOpen}
                  >
                    <span className={`w-3 h-3 rounded-full mt-1.5 border ${STATUS_DOT[dose.status]} flex-shrink-0`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <p className="text-sm font-medium text-dark truncate">
                          {dose.vaccineName}
                          {dose.doseLabel ? <span className="text-muted font-normal"> · {dose.doseLabel}</span> : null}
                        </p>
                        {dose.ruleNetwork === "public" ? (
                          <span className="text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700">
                            PNI
                          </span>
                        ) : dose.ruleNetwork === "private" ? (
                          <span className="text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-sky-50 text-sky-700">
                            SBIm
                          </span>
                        ) : null}
                      </div>
                      <p className={`text-[11px] mt-0.5 ${STATUS_LINE[dose.status]}`}>
                        {statusLabel(dose)}
                      </p>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        </li>
      ))}
    </ol>
  );
}
