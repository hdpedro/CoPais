"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useI18n } from "@/i18n/provider";
import { trackEvent, EVENTS } from "@/lib/analytics";
import VaccineHero from "@/components/saude/VaccineHero";
import VaccinePendingCard from "@/components/saude/VaccinePendingCard";
import VaccineTimeline from "@/components/saude/VaccineTimeline";
import VaccineCalendarSettings from "@/components/saude/VaccineCalendarSettings";
import PostVaccineChecklistModal from "@/components/saude/PostVaccineChecklistModal";
import type { CalendarPreference, VaccineStatusResult } from "@/lib/services/vaccines";

interface ChildItem {
  id: string;
  full_name: string;
  birth_date: string | null;
  calendarPreference: CalendarPreference;
}

interface HistoryRecord {
  id: string;
  vaccine_name: string;
  dose_label: string | null;
  dose_number: number | null;
  administered_date: string;
  location: string | null;
  batch_number: string | null;
}

interface Props {
  childrenList: ChildItem[];
  selectedChildId: string;
  selectedChild: ChildItem | null;
  status: VaccineStatusResult | null;
  recentRecords: HistoryRecord[];
  nextAppointment: { id: string; title: string; appointment_date: string; related_vaccine_dose_id: string | null } | null;
  isReadonly: boolean;
  duplicate: { vaccineName: string; doseNumber: number | null } | null;
  postVaccineRecordId: string | null;
  postVaccineDone: boolean;
  successMessage: string | null;
  errorMessage: string | null;
}

function formatBrDate(iso: string): string {
  return iso.split("-").reverse().join("/");
}

export default function VacinasClient(props: Props) {
  const { t } = useI18n();
  const {
    childrenList,
    selectedChildId,
    selectedChild,
    status,
    recentRecords,
    nextAppointment,
    isReadonly,
    duplicate,
    postVaccineRecordId,
    postVaccineDone,
    successMessage,
    errorMessage,
  } = props;

  const [showSettings, setShowSettings] = useState(false);

  const childFirstName = selectedChild?.full_name.split(" ")[0] || "";

  // Telemetria — evento de visualização (validação dos 4 gates da Fase 2)
  useEffect(() => {
    if (status && selectedChild) {
      trackEvent(EVENTS.VACCINE_STATUS_VIEWED, {
        coverage_pct: status.coveragePct,
        overdue_count: status.totals.overdue,
        due_soon_count: status.totals.dueSoon,
        historical_gap_count: status.totals.historicalGap,
        calendar_preference: selectedChild.calendarPreference,
      });
    }
  }, [status, selectedChild]);

  // ─── Empty / no-children state ───
  if (childrenList.length === 0) {
    return (
      <div className="max-w-lg mx-auto pb-20">
        <Header showSettings={false} onSettings={() => {}} />
        <div className="bg-white rounded-2xl p-8 text-center shadow-sm">
          <p className="text-4xl mb-3">👶</p>
          <p className="text-muted mb-4">{t("health.addChildFirst")}</p>
          {!isReadonly && (
            <Link
              href="/criancas/nova"
              className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-white text-sm font-semibold rounded-lg"
            >
              {t("health.addChild")}
            </Link>
          )}
        </div>
      </div>
    );
  }

  // Child without birth_date — motor needs birth_date
  if (selectedChild && !selectedChild.birth_date) {
    return (
      <div className="max-w-lg mx-auto pb-20">
        <Header showSettings={false} onSettings={() => {}} />
        <ChildSelector list={childrenList} selectedId={selectedChildId} />
        <div className="bg-white rounded-2xl p-8 text-center shadow-sm mt-4">
          <p className="text-4xl mb-3">📅</p>
          <p className="text-sm text-dark font-semibold mb-2">
            {t("health.vaccineEngine.statusEmpty")}
          </p>
          <p className="text-xs text-muted">
            Adicione a data de nascimento de {selectedChild.full_name.split(" ")[0]} no perfil
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto pb-24">
      <Header
        showSettings={showSettings}
        onSettings={() => setShowSettings((v) => !v)}
      />

      {/* Alerts */}
      {successMessage && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-lg p-3 mb-4 text-sm">
          {successMessage}
        </div>
      )}
      {errorMessage && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 mb-4 text-sm">
          {errorMessage}
        </div>
      )}
      {duplicate && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-2xl p-4 mb-4 text-sm">
          <p className="font-semibold">{t("health.vaccineEngine.duplicateModalTitle")}</p>
          <p className="text-xs text-amber-700 mt-1">
            {t("health.vaccineEngine.duplicateModalBody", {
              vaccineName: duplicate.vaccineName,
              doseNumber: String(duplicate.doseNumber ?? "?"),
            })}
          </p>
          <p className="text-xs text-amber-700 mt-2">
            Se for outra dose, registre novamente marcando explicitamente como nova.
          </p>
        </div>
      )}

      {/* Child selector */}
      <ChildSelector list={childrenList} selectedId={selectedChildId} />

      {/* Settings panel (collapsible) */}
      {showSettings && selectedChild ? (
        <div className="mb-4">
          <VaccineCalendarSettings
            childId={selectedChild.id}
            current={selectedChild.calendarPreference}
            isReadonly={isReadonly}
          />
        </div>
      ) : null}

      {/* Hero */}
      {status && selectedChild ? (
        <div className="mb-4">
          <VaccineHero status={status} childFirstName={childFirstName} />
        </div>
      ) : null}

      {/* Historical gap banner */}
      {status && status.totals.historicalGap > 0 && selectedChild ? (
        <div className="mb-4 rounded-2xl bg-gray-50 border border-gray-200 p-4">
          <div className="flex items-start gap-3">
            <span className="text-xl mt-0.5">📋</span>
            <div className="flex-1">
              <p className="text-sm text-dark">{t("health.vaccineEngine.historicalGapBanner")}</p>
              <p className="text-xs text-muted mt-1">
                {t("health.vaccineEngine.historicalGapCount", {
                  count: String(status.totals.historicalGap),
                })}
              </p>
              {!isReadonly && (
                <div className="mt-3 flex gap-2">
                  <Link
                    href={`/saude/vacinas/nova?crianca=${selectedChild.id}`}
                    className="text-xs font-semibold text-primary bg-primary/10 hover:bg-primary/20 px-3 py-2 rounded-lg"
                  >
                    {t("health.vaccineEngine.addHistoricalRecord")}
                  </Link>
                  <Link
                    href={`/saude/vacinas/carteirinha?crianca=${selectedChild.id}`}
                    className="text-xs font-semibold text-muted bg-white border border-gray-200 hover:bg-gray-50 px-3 py-2 rounded-lg"
                  >
                    📷 {t("health.vaccineEngine.historyCta")}
                  </Link>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {/* Next appointment with vaccine linked */}
      {nextAppointment && nextAppointment.related_vaccine_dose_id ? (
        <Link
          href={`/saude/consultas?crianca=${selectedChildId}`}
          className="flex items-center gap-3 p-3 mb-4 rounded-2xl bg-primary/5 border border-primary/20 hover:bg-primary/10 transition-colors"
        >
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <span>📅</span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-dark">{nextAppointment.title}</p>
            <p className="text-[11px] text-muted">
              {formatBrDate(nextAppointment.appointment_date.slice(0, 10))} ·{" "}
              {t("health.vaccineEngine.appointmentCreatedFromPending")}
            </p>
          </div>
        </Link>
      ) : null}

      {/* Pending section */}
      {status && selectedChild ? (
        <section className="mb-5">
          <h2 className="text-xs font-semibold text-muted uppercase tracking-wider mb-3 px-1">
            {t("health.vaccineEngine.pendingSectionTitle")}
          </h2>
          {[...status.overdue, ...status.dueSoon].length === 0 ? (
            <div className="rounded-2xl bg-emerald-50/50 border border-emerald-100 p-4 text-sm text-emerald-800 text-center">
              {t("health.vaccineEngine.pendingSectionEmpty")} 🛡️
            </div>
          ) : (
            <div className="space-y-2.5">
              {[...status.overdue, ...status.dueSoon].map((dose) => (
                <VaccinePendingCard
                  key={dose.id}
                  dose={dose}
                  childId={selectedChild.id}
                  childFirstName={childFirstName}
                  isReadonly={isReadonly}
                />
              ))}
            </div>
          )}
        </section>
      ) : null}

      {/* CTA group — Registrar / Importar */}
      {!isReadonly && selectedChild ? (
        <section className="mb-5 grid grid-cols-2 gap-3">
          <Link
            href={`/saude/vacinas/nova?crianca=${selectedChild.id}`}
            className="bg-gradient-to-br from-primary to-teal-600 rounded-2xl p-4 shadow-md hover:shadow-lg hover:scale-[1.01] active:scale-[0.99] transition-all"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center text-xl">+</div>
              <div className="text-left">
                <p className="text-sm font-bold text-white">{t("health.vaccineEngine.registerCta")}</p>
                <p className="text-[11px] text-white/70 mt-0.5">{t("health.vaccineEngine.registerTitle")}</p>
              </div>
            </div>
          </Link>
          <Link
            href={`/saude/vacinas/carteirinha?crianca=${selectedChild.id}`}
            className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 hover:border-primary/40 hover:shadow-md transition-all"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-xl">📷</div>
              <div className="text-left">
                <p className="text-sm font-bold text-dark">{t("health.vaccineEngine.historyCta")}</p>
                <p className="text-[11px] text-muted mt-0.5">{t("health.vaccineEngine.historyHint")}</p>
              </div>
            </div>
          </Link>
        </section>
      ) : null}

      {/* Timeline */}
      {status && status.timelineByAge.length > 0 ? (
        <section className="mb-6">
          <h2 className="text-xs font-semibold text-muted uppercase tracking-wider mb-3 px-1">
            {t("health.vaccineEngine.timelineTitle")}
          </h2>
          <div className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm">
            <VaccineTimeline timeline={status.timelineByAge} />
          </div>
        </section>
      ) : null}

      {/* History */}
      {recentRecords.length > 0 ? (
        <section className="mb-5">
          <h2 className="text-xs font-semibold text-muted uppercase tracking-wider mb-3 px-1">
            {t("health.vaccineEngine.historyTitle")}
          </h2>
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            {recentRecords.map((r, i) => (
              <div
                key={r.id}
                className={`flex items-center gap-3 px-4 py-3 ${i > 0 ? "border-t border-gray-100" : ""}`}
              >
                <span className="text-base">💉</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-dark truncate">{r.vaccine_name}</p>
                  <p className="text-[11px] text-muted">
                    {formatBrDate(r.administered_date)}
                    {r.dose_label ? ` · ${r.dose_label}` : ""}
                    {r.location ? ` · ${r.location}` : ""}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {/* Voltar pra Saúde */}
      <Link
        href="/saude"
        className="block text-center text-xs text-muted py-3"
      >
        ← {t("health.backToHealth")}
      </Link>

      {/* Modal pós-vacina (opt-in 48h reminder) */}
      {postVaccineRecordId && !postVaccineDone ? (
        <PostVaccineChecklistModal
          vaccineRecordId={postVaccineRecordId}
          childFirstName={childFirstName}
        />
      ) : null}
      {postVaccineDone ? (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 bg-emerald-600 text-white text-sm px-4 py-2 rounded-full shadow-lg z-50">
          ✓ Lembrete de 48h criado no calendário
        </div>
      ) : null}
    </div>
  );
}

function Header({
  showSettings,
  onSettings,
}: {
  showSettings: boolean;
  onSettings: () => void;
}) {
  const { t } = useI18n();
  return (
    <div className="flex items-center gap-3 mb-5">
      <Link href="/saude" className="text-muted hover:text-dark" aria-label={t("health.backToHealth")}>
        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
      </Link>
      <div className="flex-1">
        <h1 className="text-xl font-bold text-dark">{t("health.vaccineEngine.preventiveCareTitle")}</h1>
        <p className="text-[10px] text-muted">{t("health.vaccineEngine.preventiveCareSubtitle")}</p>
      </div>
      <button
        type="button"
        onClick={onSettings}
        className={`p-2 rounded-lg transition-colors ${showSettings ? "bg-primary/10 text-primary" : "text-muted hover:text-dark"}`}
        aria-label={t("health.vaccineEngine.settingsTitle")}
        aria-pressed={showSettings}
      >
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      </button>
    </div>
  );
}

function ChildSelector({ list, selectedId }: { list: ChildItem[]; selectedId: string }) {
  if (list.length <= 1) {
    return null;
  }
  return (
    <div className="flex gap-2 overflow-x-auto pb-1 mb-5 scrollbar-hide">
      {list.map((child) => {
        const isActive = child.id === selectedId;
        return (
          <Link
            key={child.id}
            href={`/saude/vacinas?crianca=${child.id}`}
            className={`flex-shrink-0 px-4 py-2 rounded-full text-sm font-medium transition-colors ${
              isActive
                ? "bg-primary text-white shadow-sm"
                : "bg-white text-dark border border-gray-200 hover:border-primary/40"
            }`}
          >
            {child.full_name.split(" ")[0]}
          </Link>
        );
      })}
    </div>
  );
}
