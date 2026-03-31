"use client";

import Link from "next/link";
import { useI18n } from "@/i18n/provider";
import ConfirmDoseButton from "./ConfirmDoseButton";
import HealthViewTracker from "./HealthViewTracker";
import ViewedByBadge from "./ViewedByBadge";
import HealthTimeline, { type TimelineEvent } from "./HealthTimeline";
import EvolutionQuickAction from "./EvolutionQuickAction";
import ResolveIllnessAction from "./ResolveIllnessAction";

// ─── Types ───

interface ChildData {
  id: string;
  full_name: string;
  birth_date: string;
}

interface IllnessData {
  id: string;
  title: string;
  severity: string | null;
  status: string;
  symptoms: string[] | null;
  hospital_visit: boolean | null;
  hospital_name: string | null;
  start_date: string;
  created_at: string;
  notes: string | null;
  authorName: string | null;
}

interface MedicationData {
  id: string;
  name: string;
  dosage: string;
  frequency: string;
  frequency_hours: number | null;
  start_date: string;
  end_date: string | null;
  reason: string | null;
  created_at: string;
  authorName: string | null;
}

interface AllergyData {
  id: string;
  name: string;
  allergy_type: string;
  severity: string;
  reaction: string | null;
}

interface AppointmentData {
  id: string;
  title: string;
  appointment_type: string | null;
  appointment_date: string;
  location: string | null;
  professionalName: string | null;
  professionalSpecialty: string | null;
  formattedDate: string;
  formattedTime: string;
}

interface PendingReturnData {
  id: string;
  title: string;
  return_date: string;
  return_notes: string | null;
  appointment_type: string | null;
  professionalSpecialty: string | null;
  formattedDate: string;
  daysUntil: number;
  isUrgent: boolean;
}

interface MedDoseInfo {
  formattedTime: string | null;
  overdue: boolean;
  lastBy: string | null;
  lastDoseMinutesAgo: number | null;
  onDemand: boolean;
}

interface MedProgressInfo {
  totalDays: number | null;
  elapsedDays: number;
  percent: number | null;
  continuous: boolean;
}

interface TrendInfo {
  label: string;
  icon: string;
  color: string;
  textColor: string;
}

interface HealthViewData {
  viewed_by: string;
  viewed_at: string;
  record_type: string;
  record_id: string | null;
  profiles: { full_name: string } | null;
}

export interface SaudeClientProps {
  children: ChildData[];
  selectedChildId: string;
  selectedChild: ChildData;
  childFirstName: string;
  isReadonly: boolean;
  userId: string;
  groupId: string;
  successMessage: string | null;
  errorMessage: string | null;

  // Illness data
  activeIllnesses: (IllnessData & {
    daysActive: number;
    trend: TrendInfo;
  })[];
  hasActiveIllness: boolean;

  // Medication data
  medications: (MedicationData & {
    doseInfo: MedDoseInfo | null;
    progress: MedProgressInfo | null;
  })[];
  hasActiveMeds: boolean;
  urgentMedsCount: number;

  // Primary hero data
  primaryIllness: (IllnessData & { daysActive: number; trend: TrendInfo }) | null;
  otherIllnesses: (IllnessData & { daysActive: number; trend: TrendInfo })[];
  primaryMed: (MedicationData & { doseInfo: MedDoseInfo | null; progress: MedProgressInfo | null }) | null;

  // Allergies
  allergies: AllergyData[];
  hasAllergies: boolean;

  // Appointment
  appointment: AppointmentData | null;

  // Pending returns
  pendingReturns: PendingReturnData[];

  // Counts
  illnessCount: number;
  vaccineCount: number;
  growthCount: number;
  appointmentCount: number;
  professionalsCount: number;
  overdueVaccineCount: number;

  // Last update
  lastUpdateRelative: string | null;

  // Health views
  healthViews: HealthViewData[];

  // Timeline
  timeline: TimelineEvent[];
}

// ─── Severity config (static, no translations needed for colors) ───

const sevColors: Record<string, { border: string; bg: string; icon: string }> = {
  grave: { border: "border-red-400", bg: "bg-red-50", icon: "🔴" },
  moderado: { border: "border-amber-400", bg: "bg-amber-50", icon: "🟡" },
  leve: { border: "border-green-400", bg: "bg-green-50", icon: "🟢" },
};

const allergySevConfig: Record<string, { bg: string; text: string; key: string }> = {
  severe: { bg: "bg-red-100", text: "text-red-700", key: "severityGrave" },
  moderate: { bg: "bg-amber-100", text: "text-amber-700", key: "severityModerate" },
  mild: { bg: "bg-green-100", text: "text-green-700", key: "severityMild" },
};

export default function SaudeClient(props: SaudeClientProps) {
  const { t } = useI18n();

  const {
    children: childrenList,
    selectedChildId,
    selectedChild,
    childFirstName,
    isReadonly,
    userId,
    groupId,
    successMessage,
    errorMessage,
    activeIllnesses,
    hasActiveIllness,
    medications,
    hasActiveMeds,
    urgentMedsCount,
    primaryIllness,
    otherIllnesses,
    primaryMed,
    allergies,
    hasAllergies,
    appointment,
    pendingReturns,
    overdueVaccineCount,
    lastUpdateRelative,
    healthViews,
    timeline,
  } = props;

  const sevLabelMap: Record<string, string> = {
    grave: t("health.severityGrave"),
    moderado: t("health.severityModerate"),
    moderada: t("health.severityModerate"),
    leve: t("health.severityMild"),
  };

  const trendLabelMap: Record<string, string> = {
    "Estável": t("health.stableEvolution"),
    "Melhorando": t("health.improving"),
    "Piorando": t("health.worsening"),
  };

  function renderTrendLabel(trend: TrendInfo) {
    return trendLabelMap[trend.label] || trend.label;
  }

  function renderSeverityLabel(sev: string | null) {
    if (!sev) return sevLabelMap["leve"] || sev;
    return sevLabelMap[sev.toLowerCase()] || sev;
  }

  function renderDaysUntilLabel(daysUntil: number) {
    if (daysUntil <= 0) return t("health.today");
    if (daysUntil === 1) return t("health.tomorrow");
    return `${daysUntil} ${t("health.days")}`;
  }

  // Translate encoded relative time tokens from server
  function translateRelativeTime(encoded: string): string {
    if (encoded === "__now__") return t("health.now");
    if (encoded.startsWith("__min__")) {
      const count = encoded.replace("__min__", "");
      return t("health.minutesAgo", { count });
    }
    if (encoded.startsWith("__hours__")) {
      const count = encoded.replace("__hours__", "");
      return t("health.hoursAgo", { count });
    }
    if (encoded.startsWith("__days__")) {
      const count = encoded.replace("__days__", "");
      return t("health.daysAgo", { count });
    }
    return encoded;
  }

  // ─── No children state ───
  if (childrenList.length === 0) {
    return (
      <div className="max-w-lg mx-auto pb-20">
        <div className="flex items-center gap-3 mb-6">
          <Link href="/dashboard" className="text-muted hover:text-dark">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </Link>
          <h1 className="text-2xl font-bold text-dark">{t("health.title")}</h1>
        </div>
        <div className="bg-white rounded-xl p-8 shadow-sm text-center">
          <p className="text-4xl mb-3">👶</p>
          <p className="text-muted mb-4">{t("health.addChildFirst")}</p>
          {!isReadonly && (
            <Link href="/criancas/nova" className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-white text-sm font-semibold rounded-lg">
              {t("health.addChild")}
            </Link>
          )}
        </div>
      </div>
    );
  }

  // ─── Helper to render a medication row ───
  function renderMedRow(med: typeof medications[number], compact = false) {
    const nd = med.doseInfo;
    if (compact) {
      return (
        <div key={med.id} className="flex items-center gap-2.5 p-2 rounded-lg bg-gray-50/50">
          <span className="text-xs">💊</span>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-dark">{med.name} · {med.dosage}</p>
            {nd && (
              <p className={`text-[10px] ${nd.overdue ? "text-amber-600 font-semibold" : "text-muted"}`}>
                {nd.onDemand
                  ? (nd.lastBy ? t("health.lastDoseBy", { name: nd.lastBy }) : t("health.onDemandUse"))
                  : nd.overdue
                    ? `⚠️ ${t("health.lateDoseWarning")}`
                    : nd.formattedTime ? t("health.nextAt", { time: nd.formattedTime }) : ""}
              </p>
            )}
          </div>
          {!isReadonly && (
            <ConfirmDoseButton
              medicationId={med.id}
              redirectTo={`/saude?crianca=${selectedChildId}`}
              isOverdue={!!nd?.overdue}
              lastDoseMinutesAgo={nd?.lastDoseMinutesAgo ?? null}
              frequencyHours={med.frequency_hours || 8}
              medName={med.name}
            />
          )}
        </div>
      );
    }

    return (
      <div key={med.id} className={`p-3 rounded-xl border ${nd?.overdue ? "border-amber-300 bg-amber-50/50" : "border-gray-100 bg-gray-50/50"}`}>
        <div className="flex items-start gap-2.5">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <Link href={`/saude/medicamentos/${med.id}`} className="text-sm font-semibold text-dark hover:underline">{med.name}</Link>
              {nd?.overdue && (
                <span className="text-[10px] font-bold text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded-full animate-pulse">{t("health.lateLabel")}</span>
              )}
            </div>
            <p className="text-[11px] text-muted">
              {med.dosage} · {med.frequency}
              {med.progress?.continuous && <span className="ml-1 text-blue-500">· {t("health.continuousUse")}</span>}
            </p>
            {nd && (
              <p className={`text-xs mt-1 font-medium ${nd.overdue ? "text-amber-700" : nd.onDemand ? "text-muted" : "text-blue-600"}`}>
                {nd.onDemand
                  ? (nd.lastBy
                    ? `💊 ${t("health.lastDoseBy", { name: nd.lastBy })}`
                    : `💊 ${t("health.onDemandUse")}`)
                  : nd.overdue
                    ? `⏰ ${t("health.shouldHaveBeenAt", { time: nd.formattedTime ?? "" })}`
                    : nd.formattedTime ? `⏰ ${t("health.nextDose", { time: nd.formattedTime })}` : ""}
                {nd.lastBy && !nd.onDemand && <span className="text-muted font-normal"> · {t("health.lastBy", { name: nd.lastBy })}</span>}
              </p>
            )}
          </div>
          {!isReadonly && (
            <ConfirmDoseButton
              medicationId={med.id}
              redirectTo={`/saude?crianca=${selectedChildId}`}
              isOverdue={!!nd?.overdue}
              lastDoseMinutesAgo={nd?.lastDoseMinutesAgo ?? null}
              frequencyHours={med.frequency_hours || 8}
              medName={med.name}
            />
          )}
        </div>
      </div>
    );
  }

  // ─── Hero section renderer ───
  function renderHero() {
    // DOENTE: Focus on the most critical episode
    if (primaryIllness) {
      const sev = sevColors[primaryIllness.severity || "leve"] || sevColors.leve;
      return (
        <div className="rounded-2xl mb-4 shadow-sm border border-red-200 overflow-hidden">
          <div className="bg-gradient-to-r from-red-500 to-red-600 px-4 py-3">
            <div className="flex items-center gap-3">
              <span className="text-2xl">🚨</span>
              <div className="flex-1">
                <h2 className="text-white font-bold text-base">
                  {childFirstName}: {primaryIllness.title}
                </h2>
                <p className="text-red-100 text-xs">
                  {t("health.dayCount", { count: primaryIllness.daysActive })} · {sev.icon} {renderSeverityLabel(primaryIllness.severity)}
                  {primaryIllness.symptoms && primaryIllness.symptoms.length > 0 ? ` · ${primaryIllness.symptoms.slice(0, 2).join(", ")}` : ""}
                </p>
                <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full mt-1 ${primaryIllness.trend.color} ${primaryIllness.trend.textColor}`}>
                  {primaryIllness.trend.icon} {renderTrendLabel(primaryIllness.trend)}
                </span>
              </div>
            </div>
            {primaryIllness.authorName && (
              <p className="text-red-200 text-[10px] mt-1 ml-11">
                {t("health.registeredBy", { name: primaryIllness.authorName })}
              </p>
            )}
          </div>

          <div className="bg-white p-3 space-y-2">
            {primaryMed && (
              <div className={`p-3 rounded-xl border ${primaryMed.doseInfo?.overdue ? "border-amber-300 bg-amber-50/50" : "border-blue-100 bg-blue-50/30"}`}>
                <div className="flex items-start gap-2.5">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm">💊</span>
                      <Link href={`/saude/medicamentos/${primaryMed.id}`} className="text-sm font-semibold text-dark hover:underline">{primaryMed.name}</Link>
                      {primaryMed.doseInfo?.overdue && (
                        <span className="text-[10px] font-bold text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded-full animate-pulse">
                          {t("health.lateLabel")}
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-muted ml-6">
                      {primaryMed.dosage} · {primaryMed.frequency}
                      {primaryMed.progress?.continuous && <span className="ml-1 text-blue-500">· {t("health.continuousUse")}</span>}
                    </p>
                    {primaryMed.doseInfo && (
                      <p className={`text-xs mt-1 font-medium ml-6 ${primaryMed.doseInfo.overdue ? "text-amber-700" : primaryMed.doseInfo.onDemand ? "text-muted" : "text-blue-600"}`}>
                        {primaryMed.doseInfo.onDemand
                          ? (primaryMed.doseInfo.lastBy
                            ? `💊 ${t("health.lastDoseBy", { name: primaryMed.doseInfo.lastBy })}`
                            : `💊 ${t("health.onDemandUse")}`)
                          : primaryMed.doseInfo.overdue
                            ? `⏰ ${t("health.shouldHaveBeenAt", { time: primaryMed.doseInfo.formattedTime ?? "" })}`
                            : primaryMed.doseInfo.formattedTime ? `⏰ ${t("health.nextDose", { time: primaryMed.doseInfo.formattedTime })}` : ""}
                        {primaryMed.doseInfo.lastBy && !primaryMed.doseInfo.onDemand && (
                          <span className="text-muted font-normal"> · {t("health.lastBy", { name: primaryMed.doseInfo.lastBy })}</span>
                        )}
                      </p>
                    )}
                  </div>
                  {!isReadonly && (
                    <ConfirmDoseButton
                      medicationId={primaryMed.id}
                      redirectTo={`/saude?crianca=${selectedChildId}`}
                      isOverdue={!!primaryMed.doseInfo?.overdue}
                      lastDoseMinutesAgo={primaryMed.doseInfo?.lastDoseMinutesAgo ?? null}
                      frequencyHours={primaryMed.frequency_hours || 8}
                      medName={primaryMed.name}
                    />
                  )}
                </div>
              </div>
            )}

            {/* Other medications compact */}
            {medications.length > 1 && medications.filter(m => m.id !== primaryMed?.id).map((med) => renderMedRow(med, true))}

            {/* Action buttons */}
            <div className="flex gap-2 pt-1">
              <Link
                href={`/saude/doencas?crianca=${selectedChildId}`}
                className="flex-1 text-center text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 py-2 rounded-lg transition-colors"
              >
                {t("health.updateState")}
              </Link>
              {primaryMed && (
                <Link
                  href={`/saude/medicamentos/${primaryMed.id}`}
                  className="flex-1 text-center text-xs font-semibold text-primary bg-primary/10 hover:bg-primary/20 py-2 rounded-lg transition-colors"
                >
                  {t("health.viewMedication")}
                </Link>
              )}
              <Link
                href={`/saude/doencas?crianca=${selectedChildId}`}
                className="flex-1 text-center text-xs font-semibold text-muted bg-gray-50 hover:bg-gray-100 py-2 rounded-lg transition-colors"
              >
                {t("health.viewDetails")}
              </Link>
            </div>

            {/* Other collapsed episodes */}
            {otherIllnesses.length > 0 && (
              <Link
                href={`/saude/doencas?crianca=${selectedChildId}`}
                className="block text-center text-[11px] text-muted hover:text-dark pt-1"
              >
                +{t("health.activeConditions", { count: otherIllnesses.length })} ({otherIllnesses.map(e => e.title).join(", ")})
              </Link>
            )}
          </div>
        </div>
      );
    }

    // IN TREATMENT: Focus on medication
    if (hasActiveMeds && primaryMed) {
      return (
        <div className="rounded-2xl mb-4 shadow-sm border border-blue-200 overflow-hidden">
          <div className={`px-4 py-3 flex items-center gap-3 ${
            primaryMed.doseInfo?.overdue
              ? "bg-gradient-to-r from-amber-500 to-orange-500"
              : "bg-gradient-to-r from-blue-500 to-blue-600"
          }`}>
            <span className="text-2xl">💊</span>
            <div className="flex-1">
              <h2 className="text-white font-bold text-sm">
                {primaryMed.doseInfo?.overdue ? t("health.overdueDose") : t("health.inTreatment")}
              </h2>
              <p className="text-white/80 text-xs">
                {primaryMed.name} · {primaryMed.dosage}
                {primaryMed.progress?.continuous
                  ? ` · ${t("health.continuousDay", { count: primaryMed.progress.elapsedDays })}`
                  : primaryMed.progress?.totalDays ? ` · ${t("health.dayCount", { count: primaryMed.progress.elapsedDays })}/${primaryMed.progress.totalDays}` : ""}
              </p>
            </div>
          </div>
          <div className="bg-white p-3 space-y-2">
            {medications.map((med) => renderMedRow(med, false))}
          </div>
        </div>
      );
    }

    // HEALTHY
    return (
      <div className="rounded-2xl p-5 mb-4 shadow-sm bg-gradient-to-br from-green-50 to-emerald-50 border border-green-200">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center text-2xl">
            😊
          </div>
          <div>
            <h2 className="text-base font-bold text-dark">{t("health.childIsWell", { name: childFirstName })}</h2>
            <p className="text-xs text-green-700">{t("health.noPendingToday")}</p>
          </div>
        </div>
        {appointment && (
          <Link
            href={`/saude/consultas?crianca=${selectedChildId}`}
            className="flex items-center gap-2.5 p-2.5 rounded-xl bg-white/80 mt-3"
          >
            <span className="text-sm">📅</span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-dark">{appointment.title}</p>
              <p className="text-[11px] text-muted">
                {appointment.formattedDate}
                {" " + t("health.atTime", { time: appointment.formattedTime })}
                {appointment.professionalName ? ` · Dr(a). ${appointment.professionalName}` : ""}
              </p>
            </div>
            <svg className="w-4 h-4 text-muted flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </Link>
        )}
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto pb-20">
      {/* Header */}
      <div className="flex items-center gap-3 mb-5">
        <Link href="/dashboard" className="text-muted hover:text-dark">
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </Link>
        <div className="flex-1">
          <h1 className="text-xl font-bold text-dark">{t("health.title")}</h1>
          {lastUpdateRelative && (
            <p className="text-[10px] text-muted">
              {t("health.lastUpdate")}: {translateRelativeTime(lastUpdateRelative!)}
            </p>
          )}
        </div>
        <Link
          href={`/saude/export?childId=${selectedChildId}`}
          target="_blank"
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-primary border border-primary/30 rounded-lg hover:bg-primary/5 transition-colors"
          title={t("health.exportHealthReport")}
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <polyline points="6 9 6 2 18 2 18 9" />
            <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
            <rect x="6" y="14" width="12" height="8" />
          </svg>
          PDF
        </Link>
      </div>

      {/* Alerts */}
      {successMessage && (
        <div className="bg-green-50 border border-green-200 text-green-700 rounded-lg p-3 mb-4 text-sm">
          {successMessage}
        </div>
      )}
      {errorMessage && (
        <div className="bg-red-50 border border-error/20 text-error rounded-lg p-3 mb-4 text-sm">
          {errorMessage}
        </div>
      )}

      {/* Child Selector */}
      {childrenList.length > 1 ? (
        <div className="flex gap-2 overflow-x-auto pb-1 mb-5 scrollbar-hide">
          {childrenList.map((child) => {
            const isActive = child.id === selectedChildId;
            return (
              <Link
                key={child.id}
                href={`/saude?crianca=${child.id}`}
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
      ) : (
        <div className="mb-5">
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-primary/10 rounded-full text-sm font-medium text-primary">
            👶 {selectedChild.full_name}
          </span>
        </div>
      )}

      {/* View Tracking */}
      <HealthViewTracker recordType="health_page" childId={selectedChildId} groupId={groupId} />
      {(() => {
        const pageViews = healthViews.filter((v) => v.record_type === "health_page");
        if (pageViews.length === 0) return null;
        return (
          <div className="mb-4 -mt-2">
            <ViewedByBadge views={pageViews as Array<{ viewed_by: string; viewed_at: string; profiles: { full_name: string } | null }>} currentUserId={userId} />
          </div>
        );
      })()}

      {/* Hero */}
      {renderHero()}

      {/* Overdue vaccines warning */}
      {overdueVaccineCount > 0 && (
        <Link
          href={`/saude/vacinas?crianca=${selectedChildId}`}
          className="flex items-center gap-3 p-3 rounded-xl bg-amber-50 border border-amber-200 mb-4 hover:bg-amber-100 transition-colors"
        >
          <div className="w-9 h-9 rounded-lg bg-amber-100 flex items-center justify-center flex-shrink-0">
            <span className="text-base">💉</span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-amber-800">
              {t("health.overdueVaccinesAlert", { count: overdueVaccineCount })}
            </p>
            <p className="text-[11px] text-amber-600">
              {t("health.consultPediatrician")}
            </p>
          </div>
          <svg className="w-4 h-4 text-amber-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </Link>
      )}

      {/* Allergies alert */}
      {hasAllergies && (
        <div className="flex flex-wrap gap-1.5 mb-4">
          {allergies.map((a) => {
            const cfg = allergySevConfig[a.severity] || allergySevConfig.mild;
            return (
              <Link
                key={a.id}
                href={`/saude/alergias?crianca=${selectedChildId}`}
                className={`${cfg.bg} ${cfg.text} px-2.5 py-1 rounded-full text-[11px] font-medium hover:opacity-80 transition-opacity`}
              >
                ⚠️ {a.name}
              </Link>
            );
          })}
        </div>
      )}

      {/* ─── CONTEXT-AWARE SECTIONS ─── */}

      {/* STATE B: SICK — Evolution actions + dedicated meds + symptom diary */}
      {hasActiveIllness && primaryIllness && (
        <>
          {/* Inline evolution quick actions */}
          {!isReadonly && (
            <section className="mb-4 space-y-2">
              <EvolutionQuickAction
                episodeId={primaryIllness.id}
                episodeTitle={primaryIllness.title}
              />
              <ResolveIllnessAction
                episodeId={primaryIllness.id}
                hasActiveMeds={hasActiveMeds}
              />
            </section>
          )}

          {/* Dedicated medications section when sick */}
          {medications.length > 0 && (
            <section className="mb-5">
              <h2 className="text-xs font-semibold text-muted uppercase tracking-wider mb-3 px-1 flex items-center gap-2">
                {t("health.medications")}
                {urgentMedsCount > 0 && (
                  <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full normal-case tracking-normal">
                    {t("health.overdueDoses", { count: urgentMedsCount })}
                  </span>
                )}
              </h2>
              <div className="space-y-2">
                {medications.map((med) => renderMedRow(med, false))}
              </div>
              {!isReadonly && (
                <Link
                  href="/saude/medicamentos/novo"
                  className="block mt-2 text-center text-xs font-semibold text-primary bg-primary/5 hover:bg-primary/10 py-2 rounded-lg transition-colors"
                >
                  + {t("health.addMedication")}
                </Link>
              )}
            </section>
          )}

          {/* Symptom diary quick access when sick */}
          <section className="mb-5">
            <div className="grid grid-cols-2 gap-3">
              <Link
                href={`/saude/sintomas?crianca=${selectedChildId}`}
                className="bg-white rounded-xl p-4 shadow-sm border border-orange-200 hover:border-orange-300 hover:shadow-md transition-all group"
              >
                <div className="w-10 h-10 rounded-xl bg-orange-50 flex items-center justify-center mb-2.5 group-hover:scale-110 transition-transform">
                  <span className="text-lg">📝</span>
                </div>
                <p className="text-sm font-semibold text-dark">{t("health.symptomDiary")}</p>
                <p className="text-[10px] text-muted mt-0.5">{t("health.symptomDiaryDesc")}</p>
              </Link>
              <Link
                href="/saude/consultas/nova"
                className="bg-white rounded-xl p-4 shadow-sm border border-primary/20 hover:border-primary/40 hover:shadow-md transition-all group"
              >
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center mb-2.5 group-hover:scale-110 transition-transform">
                  <span className="text-lg">📅</span>
                </div>
                <p className="text-sm font-semibold text-dark">{t("health.scheduleAppointment")}</p>
                <p className="text-[10px] text-muted mt-0.5">{t("health.newAppointmentOrExam")}</p>
              </Link>
            </div>
          </section>
        </>
      )}

      {/* STATE C: IN TREATMENT (no illness, but has meds) — Focus on medication tracking */}
      {!hasActiveIllness && hasActiveMeds && (
        <section className="mb-5">
          {medications.length > 1 && (
            <>
              <h2 className="text-xs font-semibold text-muted uppercase tracking-wider mb-3 px-1 flex items-center gap-2">
                {t("health.medications")}
                {urgentMedsCount > 0 && (
                  <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full normal-case tracking-normal">
                    {t("health.overdueDoses", { count: urgentMedsCount })}
                  </span>
                )}
              </h2>
              <div className="space-y-2">
                {medications.filter(m => m.id !== primaryMed?.id).map((med) => renderMedRow(med, false))}
              </div>
            </>
          )}
        </section>
      )}

      {/* Appointment when hero shows illness/medication */}
      {(hasActiveIllness || hasActiveMeds) && appointment && (
        <Link
          href={`/saude/consultas?crianca=${selectedChildId}`}
          className="flex items-center gap-2.5 p-3 rounded-xl bg-white shadow-sm border border-gray-100 mb-4"
        >
          <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
            <span className="text-base">📅</span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-dark">{appointment.title}</p>
            <p className="text-[11px] text-muted">
              {appointment.formattedDate}
              {" " + t("health.atTime", { time: appointment.formattedTime })}
              {appointment.professionalName ? ` · Dr(a). ${appointment.professionalName}` : ""}
            </p>
          </div>
          <svg className="w-4 h-4 text-muted flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </Link>
      )}

      {/* Expected Returns */}
      {pendingReturns.length > 0 && (
        <section className="mb-5">
          <h2 className="text-xs font-semibold text-muted uppercase tracking-wider mb-3 px-1">{t("health.expectedReturns")}</h2>
          <div className="bg-white rounded-xl shadow-sm overflow-hidden">
            {pendingReturns.map((apt, i) => (
              <Link
                key={apt.id}
                href="/saude/consultas"
                className={`flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors ${i > 0 ? "border-t border-gray-100" : ""}`}
              >
                <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${apt.isUrgent ? "bg-amber-100" : "bg-blue-50"}`}>
                  <span className="text-base">🔄</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-dark">
                    {apt.professionalSpecialty || apt.title}
                  </p>
                  <p className="text-[11px] text-muted">
                    {apt.formattedDate}
                    {apt.return_notes ? ` — ${apt.return_notes}` : ""}
                  </p>
                </div>
                <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                  apt.isUrgent ? "bg-amber-100 text-amber-700" : "bg-blue-50 text-blue-600"
                }`}>
                  {renderDaysUntilLabel(apt.daysUntil)}
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Quick Actions — shown for healthy state or always as secondary for sick/treatment */}
      {!isReadonly && !hasActiveIllness && (
        <section className="mb-5">
          <h2 className="text-xs font-semibold text-muted uppercase tracking-wider mb-3 px-1">
            {t("health.quickActions")}
          </h2>
          <div className="grid grid-cols-2 gap-3">
            <Link
              href="/saude/doencas/nova"
              className="bg-gradient-to-br from-red-500 to-red-600 rounded-xl p-4 shadow-md hover:shadow-lg hover:scale-[1.02] active:scale-[0.98] transition-all group"
            >
              <div className="w-11 h-11 rounded-xl bg-white/20 flex items-center justify-center mb-2.5 group-hover:scale-110 transition-transform">
                <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
                </svg>
              </div>
              <p className="text-sm font-bold text-white">{t("health.registerProblem")}</p>
              <p className="text-[11px] text-white/70 mt-0.5">{t("health.illnessOrEmergency")}</p>
            </Link>

            <Link
              href="/saude/consultas/nova"
              className="bg-gradient-to-br from-primary to-teal-600 rounded-xl p-4 shadow-md hover:shadow-lg hover:scale-[1.02] active:scale-[0.98] transition-all group"
            >
              <div className="w-11 h-11 rounded-xl bg-white/20 flex items-center justify-center mb-2.5 group-hover:scale-110 transition-transform">
                <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
              <p className="text-sm font-bold text-white">{t("health.scheduleAppointment")}</p>
              <p className="text-[11px] text-white/70 mt-0.5">{t("health.newAppointmentOrExam")}</p>
            </Link>
          </div>
        </section>
      )}

      {/* Recent Activity Timeline */}
      <HealthTimeline events={timeline} childId={selectedChildId} />

      {/* ─── Compact Navigation Menu (Phase 4) ─── */}
      <section className="mb-5">
        <div className="grid grid-cols-5 gap-2">
          {[
            { icon: "💉", label: t("health.vaccines"), href: `/saude/vacinas?crianca=${selectedChildId}`, badge: overdueVaccineCount > 0 ? overdueVaccineCount : null },
            { icon: "📏", label: t("health.growth"), href: `/saude/crescimento?crianca=${selectedChildId}`, badge: null },
            { icon: "🩺", label: t("health.professionals"), href: "/saude/profissionais", badge: null },
            { icon: "📋", label: t("health.history"), href: `/saude/doencas?crianca=${selectedChildId}`, badge: hasActiveIllness ? activeIllnesses.length : null },
            { icon: "📄", label: "PDF", href: `/saude/export?childId=${selectedChildId}`, badge: null },
          ].map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="flex flex-col items-center gap-1 py-3 rounded-xl bg-white shadow-sm border border-gray-100 hover:border-primary/30 hover:shadow-md transition-all relative"
            >
              {item.badge && (
                <span className="absolute -top-1 -right-1 min-w-[16px] h-[16px] px-1 bg-red-500 text-white text-[8px] font-bold rounded-full flex items-center justify-center">
                  {item.badge}
                </span>
              )}
              <span className="text-lg">{item.icon}</span>
              <span className="text-[10px] font-medium text-muted">{item.label}</span>
            </Link>
          ))}
        </div>
      </section>

      {/* Tools — Symptom Diary + Pre-appointment Summary (when not already shown in sick state) */}
      {!hasActiveIllness && (
        <section className="mb-5">
          <h2 className="text-xs font-semibold text-muted uppercase tracking-wider mb-3 px-1">{t("health.tools")}</h2>
          <div className="grid grid-cols-2 gap-3">
            <Link
              href={`/saude/sintomas?crianca=${selectedChildId}`}
              className="bg-white rounded-xl p-4 shadow-sm border border-[#E8E0D4] hover:border-primary/40 hover:shadow-md transition-all group"
            >
              <div className="w-10 h-10 rounded-xl bg-orange-50 flex items-center justify-center mb-2.5 group-hover:scale-110 transition-transform">
                <span className="text-lg">📝</span>
              </div>
              <p className="text-sm font-semibold text-dark">{t("health.symptomDiary")}</p>
              <p className="text-[10px] text-muted mt-0.5">{t("health.symptomDiaryDesc")}</p>
            </Link>
            <Link
              href={`/saude/consultas/resumo?crianca=${selectedChildId}`}
              className="bg-white rounded-xl p-4 shadow-sm border border-[#E8E0D4] hover:border-primary/40 hover:shadow-md transition-all group"
            >
              <div className="w-10 h-10 rounded-xl bg-teal-50 flex items-center justify-center mb-2.5 group-hover:scale-110 transition-transform">
                <span className="text-lg">📋</span>
              </div>
              <p className="text-sm font-semibold text-dark">{t("health.preSummary")}</p>
              <p className="text-[10px] text-muted mt-0.5">{t("health.preSummaryDesc")}</p>
            </Link>
          </div>
        </section>
      )}

      {/* Emergency Card */}
      <section className="mb-5">
        <Link
          href={`/saude/emergencia?crianca=${selectedChildId}`}
          className="flex items-center gap-3 p-4 rounded-xl bg-gradient-to-r from-red-50 to-red-100 border border-red-200 hover:from-red-100 hover:to-red-200 transition-all group"
        >
          <div className="w-11 h-11 rounded-xl bg-red-600 flex items-center justify-center flex-shrink-0 group-hover:scale-110 transition-transform">
            <span className="text-xl text-white">&#9877;&#65039;</span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-red-900">{t("health.emergencyCard")}</p>
            <p className="text-[11px] text-red-700/70">{t("health.emergencyCardDesc")}</p>
          </div>
          <svg className="w-5 h-5 text-red-400 group-hover:translate-x-0.5 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </Link>
      </section>
    </div>
  );
}
