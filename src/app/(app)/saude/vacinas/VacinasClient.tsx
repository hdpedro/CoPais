"use client";

import Link from "next/link";
import { useI18n } from "@/i18n/provider";

interface Child {
  id: string;
  full_name: string;
  birth_date: string;
}

interface ComparisonItem {
  vaccineName: string;
  dose: { label: string; ageLabel: string };
  monthsDiff?: number;
  administeredDate?: string;
}

interface CalendarGroup {
  age: string;
  ageMonths: number;
  vaccines: { name: string; doses: number; status: "taken" | "overdue" | "future"; date?: string }[];
}

interface Props {
  childrenList: Child[];
  selectedChildId: string;
  selectedChild: Child;
  ageDisplay: string;
  takenCount: number;
  overdueCount: number;
  upcomingCount: number;
  futureCount: number;
  overdueItems: ComparisonItem[];
  upcomingItems: ComparisonItem[];
  onTimeItems: ComparisonItem[];
  calendarStatus: CalendarGroup[];
  vaccineRecordsCount: number;
  isReadonly: boolean;
  success?: string;
  error?: string;
}

export default function VacinasClient({
  childrenList,
  selectedChildId,
  selectedChild,
  ageDisplay,
  takenCount,
  overdueCount,
  upcomingCount,
  futureCount,
  overdueItems,
  upcomingItems,
  onTimeItems,
  calendarStatus,
  vaccineRecordsCount,
  isReadonly,
  success,
  error: errorMsg,
}: Props) {
  const { t } = useI18n();

  function formatDate(dateStr: string) {
    return new Date(dateStr + "T12:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" });
  }

  function formatMonthsDiff(months: number): string {
    if (months < 12) return `${months} ${months === 1 ? t("health.month") : t("health.months")}`;
    const years = Math.floor(months / 12);
    const rem = months % 12;
    let str = `${years} ${years !== 1 ? t("health.years") : t("health.year")}`;
    if (rem > 0) str += ` ${t("health.and")} ${rem} ${rem === 1 ? t("health.month") : t("health.months")}`;
    return str;
  }

  if (!childrenList || childrenList.length === 0) {
    return (
      <div className="max-w-lg mx-auto pb-20">
        <div className="flex items-center gap-3 mb-6">
          <Link href="/saude" className="text-muted hover:text-dark" aria-label={t("health.backToHealth")}>
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </Link>
          <h1 className="text-2xl font-bold text-dark">{t("health.vaccination")}</h1>
        </div>
        <div className="bg-white rounded-xl p-8 shadow-sm text-center">
          <p className="text-4xl mb-3" aria-hidden="true">💉</p>
          <p className="text-muted text-sm mb-1">{t("health.noChildRegistered")}</p>
          <p className="text-muted text-xs">{t("health.addChildToManageVaccines")}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto pb-20">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/saude" className="text-muted hover:text-dark" aria-label={t("health.backToHealth")}>
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-dark">{t("health.vaccination")}</h1>
          <p className="text-sm text-muted">{selectedChild.full_name} &middot; {ageDisplay}</p>
        </div>
      </div>

      {success && <div className="bg-green-50 border border-green-200 text-green-700 rounded-lg p-3 mb-4 text-sm">{decodeURIComponent(success)}</div>}
      {errorMsg && <div className="bg-red-50 border border-error/20 text-error rounded-lg p-3 mb-4 text-sm">{decodeURIComponent(errorMsg)}</div>}

      {childrenList.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-1 mb-6 scrollbar-hide">
          {childrenList.map((child) => (
            <Link key={child.id} href={`/saude/vacinas?crianca=${child.id}`} className={`flex-shrink-0 px-4 py-2 rounded-full text-sm font-medium transition-colors ${child.id === selectedChildId ? "bg-primary text-white border-2 border-primary" : "bg-white text-dark border-2 border-gray-200 hover:border-primary/40"}`}>
              {child.full_name.split(" ")[0]}
            </Link>
          ))}
        </div>
      )}

      {/* Summary Stats */}
      <div className="grid grid-cols-4 gap-2 mb-6">
        <div className="bg-green-50 rounded-xl p-3 text-center">
          <p className="text-2xl font-bold text-green-700">{takenCount}</p>
          <p className="text-[10px] font-semibold text-green-600 uppercase tracking-wide">{t("health.onTime")}</p>
        </div>
        <div className="bg-red-50 rounded-xl p-3 text-center">
          <p className="text-2xl font-bold text-red-700">{overdueCount}</p>
          <p className="text-[10px] font-semibold text-red-600 uppercase tracking-wide">{t("health.overdue")}</p>
        </div>
        <div className="bg-amber-50 rounded-xl p-3 text-center">
          <p className="text-2xl font-bold text-amber-700">{upcomingCount}</p>
          <p className="text-[10px] font-semibold text-amber-600 uppercase tracking-wide">{t("health.upcoming")}</p>
        </div>
        <div className="bg-gray-50 rounded-xl p-3 text-center">
          <p className="text-2xl font-bold text-gray-600">{futureCount}</p>
          <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">{t("health.future")}</p>
        </div>
      </div>

      {/* Alert banners */}
      {overdueCount > 0 && takenCount === 0 && (
        <div className="bg-amber-50 border-l-4 border-amber-400 rounded-xl p-4 shadow-sm mb-4">
          <div className="flex items-start gap-3">
            <span className="text-lg mt-0.5" aria-hidden="true">&#x1F4CB;</span>
            <div className="flex-1">
              <p className="text-sm font-semibold text-amber-700">{t("health.noVaccineRegisteredYet")}</p>
              <p className="text-xs text-amber-600 mt-0.5">
                {t("health.registerVaccinesForChild", { name: selectedChild.full_name.split(" ")[0], count: overdueCount })}
              </p>
            </div>
          </div>
        </div>
      )}
      {overdueCount > 0 && takenCount > 0 && (
        <div className="bg-red-50 border-l-4 border-red-400 rounded-xl p-4 shadow-sm mb-4">
          <div className="flex items-start gap-3">
            <span className="text-lg mt-0.5" aria-hidden="true">&#x26A0;&#xFE0F;</span>
            <div className="flex-1">
              <p className="text-sm font-semibold text-red-700">{t("health.overdueVaccinesAlert", { count: overdueCount })}</p>
              <p className="text-xs text-red-600 mt-0.5">{t("health.consultPediatrician")}</p>
            </div>
          </div>
        </div>
      )}

      {/* Overdue */}
      {overdueItems.length > 0 && (
        <section className="mb-4">
          <h2 className="text-xs font-semibold text-red-600 uppercase tracking-wider mb-2 px-1 flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-red-500" aria-hidden="true" />
            {t("health.overdueVaccinesSection")}
          </h2>
          <div className="bg-white rounded-xl shadow-sm overflow-hidden divide-y divide-gray-100">
            {overdueItems.map((item, idx) => (
              <div key={`overdue-${idx}`} className="flex items-center gap-3 px-4 py-3">
                <span className="w-6 h-6 rounded-full bg-red-100 text-red-600 flex items-center justify-center text-xs font-bold flex-shrink-0" aria-label={t("health.overdueLabelShort")}><span aria-hidden="true">!</span></span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-red-700">{item.vaccineName}</p>
                  <p className="text-[11px] text-red-500">{item.dose.label} &middot; {t("health.recommendedAt", { age: item.dose.ageLabel })}</p>
                </div>
                <span className="text-[10px] text-red-500 font-medium flex-shrink-0 text-right">
                  {item.monthsDiff ? formatMonthsDiff(item.monthsDiff) + " " + t("health.monthsAgo", { count: 0 }).replace("0 ", "").replace(t("health.monthsAgo", { count: 0 }).split(" ").pop()!, "").trim() : t("health.overdueLabelShort")}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Upcoming */}
      {upcomingItems.length > 0 && (
        <section className="mb-4">
          <h2 className="text-xs font-semibold text-amber-600 uppercase tracking-wider mb-2 px-1 flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-amber-500" aria-hidden="true" />
            {t("health.upcomingVaccines")}
          </h2>
          <div className="bg-white rounded-xl shadow-sm overflow-hidden divide-y divide-gray-100">
            {upcomingItems.map((item, idx) => (
              <div key={`upcoming-${idx}`} className="flex items-center gap-3 px-4 py-3">
                <span className="w-6 h-6 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center text-xs font-bold flex-shrink-0">
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-amber-700">{item.vaccineName}</p>
                  <p className="text-[11px] text-amber-500">{item.dose.label} &middot; {t("health.recommendedAt", { age: item.dose.ageLabel })}</p>
                </div>
                <span className="text-[10px] text-amber-600 font-medium flex-shrink-0 text-right">
                  {item.monthsDiff === 0 ? t("health.thisMonth") : t("health.inMonths", { count: item.monthsDiff || 0 })}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* On-time */}
      {onTimeItems.length > 0 && (
        <section className="mb-6">
          <h2 className="text-xs font-semibold text-green-600 uppercase tracking-wider mb-2 px-1 flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-green-500" aria-hidden="true" />
            {t("health.onTimeVaccines")}
          </h2>
          <div className="bg-white rounded-xl shadow-sm overflow-hidden divide-y divide-gray-100">
            {onTimeItems.map((item, idx) => (
              <div key={`ontime-${idx}`} className="flex items-center gap-3 px-4 py-3">
                <span className="w-6 h-6 rounded-full bg-green-100 text-green-600 flex items-center justify-center text-xs font-bold flex-shrink-0">
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-dark">{item.vaccineName}</p>
                  <p className="text-[11px] text-muted">{item.dose.label}</p>
                </div>
                {item.administeredDate && <span className="text-[10px] text-green-600 font-medium flex-shrink-0">{formatDate(item.administeredDate)}</span>}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Full Calendar */}
      <section className="mb-6">
        <h2 className="text-sm font-semibold text-dark mb-3 px-1">{t("health.fullVaccineCalendar")}</h2>
        <div className="space-y-4">
          {calendarStatus.map((group) => (
            <div key={group.age} className="bg-white rounded-xl p-4 shadow-sm">
              <h3 className="text-xs font-bold text-dark uppercase tracking-wide mb-3 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-primary" />
                {group.age}
              </h3>
              <div className="space-y-2.5">
                {group.vaccines.map((vaccine, idx) => (
                  <div key={idx} className="flex items-center gap-3">
                    {vaccine.status === "taken" ? (
                      <span className="w-5 h-5 rounded-full bg-green-100 text-green-600 flex items-center justify-center text-xs font-bold flex-shrink-0" aria-label={t("health.applied")}><span aria-hidden="true">&#10003;</span></span>
                    ) : vaccine.status === "overdue" ? (
                      <span className="w-5 h-5 rounded-full bg-red-100 text-red-600 flex items-center justify-center text-xs font-bold flex-shrink-0" aria-label={t("health.overdueLabelShort")}><span aria-hidden="true">!</span></span>
                    ) : (
                      <span className="w-5 h-5 rounded-full bg-gray-100 text-gray-400 flex items-center justify-center text-xs flex-shrink-0" aria-label={t("health.futureLabel")}><span aria-hidden="true">&#x25CB;</span></span>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm ${vaccine.status === "taken" ? "text-dark" : vaccine.status === "overdue" ? "text-red-700 font-medium" : "text-gray-400"}`}>{vaccine.name}</p>
                    </div>
                    {vaccine.status === "taken" && vaccine.date && <span className="text-[10px] text-green-600 font-medium flex-shrink-0">{formatDate(vaccine.date)}</span>}
                    {vaccine.status === "overdue" && <span className="text-[10px] text-red-500 font-medium flex-shrink-0">{t("health.overdueLabelShort")}</span>}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      {vaccineRecordsCount > 0 && (
        <div className="mb-4 px-1">
          <p className="text-[10px] text-muted/70 italic flex items-center gap-1">
            <svg className="w-3 h-3 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            {t("health.vaccineRecordsNotEditable")}
          </p>
        </div>
      )}

      <div className="bg-blue-50 rounded-xl p-3 mb-6">
        <p className="text-[11px] text-blue-600">
          <span className="font-semibold">{t("health.sbpReference").split(":")[0]}:</span> {t("health.sbpReference").split(":").slice(1).join(":")}
        </p>
      </div>

      {!isReadonly && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-10 flex items-center gap-2">
          <Link href={`/saude/vacinas/carteirinha?crianca=${selectedChildId}`} className="inline-flex items-center gap-2 px-4 py-3 bg-white text-[#C07055] text-sm font-semibold rounded-full shadow-lg hover:shadow-xl transition-all border border-[#C07055]">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" /><circle cx="12" cy="13" r="3" stroke="currentColor" strokeWidth={2} /></svg>
            Ler carteirinha
          </Link>
          <Link href="/saude/vacinas/nova" className="inline-flex items-center gap-2 px-5 py-3 bg-accent text-white text-sm font-semibold rounded-full shadow-lg hover:shadow-xl transition-all">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
            {t("health.registerVaccine")}
          </Link>
        </div>
      )}
    </div>
  );
}
