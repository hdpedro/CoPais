"use client";

/**
 * VaccinePendingCard — card de pendência com 3 CTAs.
 *
 * Pendência overdue/due_soon. Sem linguagem alarmista. CTAs:
 *  - "Marquei como tomada" (abre formulário pré-preenchido)
 *  - "Agendar pediatra" (cria appointment vinculado)
 *  - "Adiar" (menu: 7d / 30d / Já agendei)
 *
 * Visual: card arredondado, paleta laranja-suave (nunca vermelho).
 */

import { useState, useMemo } from "react";
import Link from "next/link";
import { useI18n } from "@/i18n/provider";
import {
  markDoseTaken,
  dismissDose,
} from "@/actions/vaccines";
import type { VaccineDoseStatus } from "@/lib/services/vaccines";

interface Props {
  dose: VaccineDoseStatus;
  childId: string;
  childFirstName: string;
  isReadonly: boolean;
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function VaccinePendingCard({ dose, childId, childFirstName, isReadonly }: Props) {
  const { t } = useI18n();
  const [showSnoozeMenu, setShowSnoozeMenu] = useState(false);
  const [showMarkForm, setShowMarkForm] = useState(false);

  // Date.now() não pode rodar diretamente no render (react-hooks/purity).
  // Useamos useMemo com Date.now() congelado no primeiro render — pra próximo
  // dia, a página rerenderiza (server component pai) e recalcula.
  const timeLine = useMemo(() => {
    if (dose.status === "overdue") {
      if (dose.overdueDays === 1) return t("health.vaccineEngine.pendingTimeOverdueOne");
      return t("health.vaccineEngine.pendingTimeOverdue", { count: String(dose.overdueDays ?? 0) });
    }
    if (dose.status === "due_soon") {
      // eslint-disable-next-line react-hooks/purity
      const nowMs = Date.now();
      const daysAhead = Math.max(0, Math.ceil((new Date(dose.dueDate + "T12:00:00").getTime() - nowMs) / 86400000));
      if (daysAhead === 0) return t("health.vaccineEngine.pendingTimeDueToday");
      return t("health.vaccineEngine.pendingTimeDueSoon", { count: String(daysAhead) });
    }
    return "";
  }, [dose.status, dose.overdueDays, dose.dueDate, t]);

  return (
    <div className="relative rounded-2xl bg-gradient-to-br from-amber-50 to-orange-50/40 border border-amber-200/70 p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-white flex items-center justify-center shadow-sm flex-shrink-0">
          <span className="text-lg">💉</span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <p className="text-sm font-semibold text-dark">
              {dose.vaccineName}
            </p>
            {dose.ruleNetwork === "public" ? (
              <span
                title="PNI — Programa Nacional de Imunizações (SUS)"
                className="text-[10px] font-semibold tracking-wide px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700"
              >
                {t("health.vaccineEngine.networkPublicChip")}
              </span>
            ) : dose.ruleNetwork === "private" ? (
              <span
                title="SBIm — Sociedade Brasileira de Imunizações"
                className="text-[10px] font-semibold tracking-wide px-1.5 py-0.5 rounded bg-sky-100 text-sky-700"
              >
                {t("health.vaccineEngine.networkPrivateChip")}
              </span>
            ) : null}
          </div>
          <p className="text-[11px] text-amber-700 mt-0.5">
            {dose.doseLabel}
            {timeLine ? ` · ${timeLine}` : ""}
          </p>
          <p className="text-[10px] text-muted mt-0.5">
            {childFirstName}
          </p>
        </div>
      </div>

      {!isReadonly && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {!showMarkForm ? (
            <>
              <button
                type="button"
                onClick={() => setShowMarkForm(true)}
                className="flex-1 min-w-[120px] text-center text-[12px] font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 py-2 px-3 rounded-lg transition-colors"
              >
                ✓ {t("health.vaccineEngine.ctaMarkAsTaken")}
              </button>
              <Link
                href={`/saude/consultas/nova?crianca=${childId}&vaccineDoseId=${dose.id}&type=vaccine`}
                className="flex-1 min-w-[120px] text-center text-[12px] font-semibold text-primary bg-primary/10 hover:bg-primary/20 py-2 px-3 rounded-lg transition-colors"
              >
                📅 {t("health.vaccineEngine.ctaScheduleAppointment")}
              </Link>
              <button
                type="button"
                onClick={() => setShowSnoozeMenu((s) => !s)}
                className="text-[12px] font-semibold text-muted bg-white hover:bg-gray-50 py-2 px-3 rounded-lg border border-gray-200 transition-colors"
              >
                {t("health.vaccineEngine.ctaSnooze")}
              </button>
            </>
          ) : (
            <form action={markDoseTaken} className="w-full flex items-center gap-2">
              <input type="hidden" name="doseRecommendationId" value={dose.id} />
              <input
                type="date"
                name="administeredDate"
                defaultValue={todayIso()}
                max={todayIso()}
                className="flex-1 text-sm border border-gray-200 rounded-lg px-3 py-2"
                required
              />
              <button
                type="submit"
                className="text-[12px] font-semibold text-white bg-emerald-600 hover:bg-emerald-700 py-2 px-3 rounded-lg"
              >
                {t("health.vaccineEngine.registerSave")}
              </button>
              <button
                type="button"
                onClick={() => setShowMarkForm(false)}
                className="text-[12px] text-muted px-2"
              >
                ✕
              </button>
            </form>
          )}
        </div>
      )}

      {showSnoozeMenu && !isReadonly && (
        <div className="mt-2 grid grid-cols-3 gap-1.5">
          {(["snoozed_7d", "snoozed_30d", "already_scheduled"] as const).map((reason) => (
            <form key={reason} action={dismissDose}>
              <input type="hidden" name="childId" value={childId} />
              <input type="hidden" name="vaccineId" value={dose.vaccineId} />
              <input type="hidden" name="doseNumber" value={String(dose.doseNumber)} />
              <input type="hidden" name="reason" value={reason} />
              <button
                type="submit"
                className="w-full text-[11px] font-medium text-muted hover:text-dark bg-white hover:bg-gray-50 py-2 rounded-lg border border-gray-200"
              >
                {reason === "snoozed_7d"
                  ? t("health.vaccineEngine.ctaSnooze7d")
                  : reason === "snoozed_30d"
                  ? t("health.vaccineEngine.ctaSnooze30d")
                  : t("health.vaccineEngine.ctaAlreadyScheduled")}
              </button>
            </form>
          ))}
        </div>
      )}
    </div>
  );
}
