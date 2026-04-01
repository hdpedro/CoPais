"use client";

import Link from "next/link";
import { useI18n } from "@/i18n/provider";
import ConfirmDoseButton from "../../ConfirmDoseButton";

interface MedicationInfo {
  id: string;
  name: string;
  dosage: string | null;
  frequency: string | null;
  frequency_hours: number | null;
  start_date: string;
  end_date: string | null;
  notes: string | null;
  reason: string | null;
  prescribed_by: string | null;
  status: string;
  children: { full_name: string } | null;
}

interface DoseInfo {
  id: string;
  administered_at: string;
  administered_by: string;
  notes: string | null;
  profiles: { full_name: string | null } | null;
}

interface Props {
  medication: MedicationInfo;
  allDoses: DoseInfo[];
  progress: { elapsed: number; totalDays: number } | null;
  totalDoses: number;
  avgIntervalFormatted: string;
  personEntries: [string, number][];
  dosesByDay: Record<string, DoseInfo[]>;
  dayKeys: string[];
  timeSincePrevMap: Record<string, string>;
  isReadonly: boolean;
  isContinuous: boolean;
  daysSinceStart: number;
  lastDoseMinutesAgo: number | null;
  freqHours: number;
  isOverdue: boolean;
  estimatedNextDose: string | null;
}

export default function MedicationDetailClient({
  medication,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  allDoses,
  progress,
  totalDoses,
  avgIntervalFormatted,
  personEntries,
  dosesByDay,
  dayKeys,
  timeSincePrevMap,
  isReadonly,
  isContinuous,
  daysSinceStart,
  lastDoseMinutesAgo,
  freqHours,
  isOverdue,
  estimatedNextDose,
}: Props) {
  const { t } = useI18n();

  function formatDateBR(dateStr: string | null) {
    if (!dateStr) return "—";
    return new Date(dateStr + "T00:00:00").toLocaleDateString("pt-BR");
  }

  function formatTimeBR(dateStr: string) {
    return new Date(dateStr).toLocaleString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  }

  const personColors = ["#5B9B8A", "#E8913A", "#DC4446", "#6366F1", "#8B5CF6"];

  return (
    <div className="max-w-lg mx-auto pb-20 space-y-5">
      <div className="flex items-center gap-3">
        <Link href="/saude/medicamentos" className="w-9 h-9 flex items-center justify-center rounded-full bg-white shadow-sm text-[#8E8E93] hover:bg-gray-50 transition-colors">←</Link>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-bold text-[#2D2D2D] truncate">{medication.name}</h1>
          <p className="text-xs text-[#8E8E93]">{medication.children?.full_name}</p>
        </div>
        <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${medication.status === "active" ? "text-[#DC4446] bg-red-50" : medication.status === "completed" ? "text-green-600 bg-green-50" : "text-[#8E8E93] bg-gray-100"}`}>
          <span className="text-[8px]">●</span>
          {medication.status === "active" ? t("health.active") : medication.status === "completed" ? t("health.completed") : t("health.cancelled")}
        </span>
      </div>

      <div className="bg-white rounded-xl p-4 shadow-sm space-y-2">
        {medication.dosage && (
          <div className="flex items-center gap-2 text-sm text-[#2D2D2D]">
            <span>💊</span><span className="text-[#8E8E93] min-w-[80px]">{t("health.dosage")}</span><span className="font-medium">{medication.dosage}</span>
          </div>
        )}
        {medication.frequency && (
          <div className="flex items-center gap-2 text-sm text-[#2D2D2D]">
            <span>⏰</span><span className="text-[#8E8E93] min-w-[80px]">{t("health.frequencyLabel")}</span><span className="font-medium">{medication.frequency}</span>
          </div>
        )}
        {medication.reason && (
          <div className="flex items-center gap-2 text-sm text-[#2D2D2D]">
            <span>📋</span><span className="text-[#8E8E93] min-w-[80px]">{t("health.reasonLabel")}</span><span className="font-medium">{medication.reason}</span>
          </div>
        )}
        <div className="flex items-center gap-2 text-sm text-[#2D2D2D]">
          <span>📅</span><span className="text-[#8E8E93] min-w-[80px]">{t("health.periodLabel")}</span>
          <span className="font-medium">
            {isContinuous
              ? `${t("health.since")} ${formatDateBR(medication.start_date)} · ${t("health.continuousDay", { count: daysSinceStart })}`
              : `${formatDateBR(medication.start_date)} → ${formatDateBR(medication.end_date)}`}
          </span>
        </div>
        {medication.prescribed_by && (
          <div className="flex items-center gap-2 text-sm text-[#2D2D2D]">
            <span>👩‍⚕️</span><span className="text-[#8E8E93] min-w-[80px]">{t("health.prescribedLabel")}</span><span className="font-medium">{medication.prescribed_by}</span>
          </div>
        )}
      </div>

      {/* Dose Action Card */}
      {medication.status === "active" && (
        <div className={`bg-white rounded-xl p-4 shadow-sm border ${isOverdue ? "border-amber-300 bg-amber-50/30" : "border-gray-100"}`}>
          <div className="flex items-center justify-between mb-2">
            <div>
              {estimatedNextDose && (
                <p className={`text-sm font-medium ${isOverdue ? "text-amber-700" : "text-[#5B9B8A]"}`}>
                  {isOverdue ? `⏰ ${t("health.shouldHaveBeenAt", { time: estimatedNextDose })}` : `⏰ ${t("health.nextDose", { time: estimatedNextDose })}`}
                </p>
              )}
              {!estimatedNextDose && totalDoses === 0 && (
                <p className="text-sm text-[#8E8E93]">{t("health.noDoseYet")}</p>
              )}
            </div>
          </div>
          {!isReadonly && (
            <ConfirmDoseButton
              medicationId={medication.id}
              redirectTo={`/saude/medicamentos/${medication.id}`}
              isOverdue={isOverdue}
              lastDoseMinutesAgo={lastDoseMinutesAgo}
              frequencyHours={freqHours}
              medName={medication.name}
            />
          )}
        </div>
      )}

      {progress ? (
        <div className="bg-white rounded-xl p-4 shadow-sm">
          <div className="flex items-center justify-between text-xs text-[#8E8E93] mb-2">
            <span className="font-medium">{t("health.treatmentProgress")}</span>
            <span>{t("health.dayOf", { elapsed: progress.elapsed, total: progress.totalDays })}</span>
          </div>
          <div className="w-full h-3 bg-gray-100 rounded-full overflow-hidden">
            <div className="h-full bg-[#5B9B8A] rounded-full transition-all" style={{ width: `${Math.min(100, (progress.elapsed / progress.totalDays) * 100)}%` }} />
          </div>
          <div className="flex justify-between mt-1 text-[10px] text-[#8E8E93]">
            <span>{formatDateBR(medication.start_date)}</span>
            <span>{formatDateBR(medication.end_date)}</span>
          </div>
        </div>
      ) : isContinuous && (
        <div className="bg-blue-50 rounded-xl p-4 border border-blue-100">
          <div className="flex items-center gap-2">
            <span className="text-blue-500 text-sm">♾️</span>
            <div>
              <p className="text-sm font-medium text-blue-700">{t("health.continuousUse")}</p>
              <p className="text-[11px] text-blue-500">{t("health.continuousDay", { count: daysSinceStart })}</p>
            </div>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl p-4 shadow-sm space-y-4">
        <h2 className="text-sm font-semibold text-[#2D2D2D]">{t("health.statistics")}</h2>
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-gray-50 rounded-lg p-3 text-center">
            <p className="text-2xl font-bold text-[#5B9B8A]">{totalDoses}</p>
            <p className="text-[10px] text-[#8E8E93] mt-0.5">{t("health.dosesRegistered")}</p>
          </div>
          <div className="bg-gray-50 rounded-lg p-3 text-center">
            <p className="text-2xl font-bold text-[#E8913A]">{avgIntervalFormatted}</p>
            <p className="text-[10px] text-[#8E8E93] mt-0.5">{t("health.averageInterval")}</p>
          </div>
        </div>

        {personEntries.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-medium text-[#8E8E93]">{t("health.dosesByCaregiver")}</p>
            {personEntries.map(([name, count], idx) => {
              const pct = totalDoses > 0 ? Math.round((count / totalDoses) * 100) : 0;
              const color = personColors[idx % personColors.length];
              return (
                <div key={name} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-[#2D2D2D] font-medium">{name}</span>
                    <span className="text-[#8E8E93]">{count} ({pct}%)</span>
                  </div>
                  <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: color }} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-[#2D2D2D]">{t("health.doseHistory")}</h2>
        {dayKeys.length === 0 ? (
          <div className="bg-white rounded-xl p-6 shadow-sm text-center">
            <p className="text-[#8E8E93] text-sm">{t("health.noDoseRegistered")}</p>
          </div>
        ) : (
          dayKeys.map((dayKey) => {
            const dayDoses = dosesByDay[dayKey];
            return (
              <div key={dayKey} className="bg-white rounded-xl shadow-sm overflow-hidden">
                <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-100">
                  <span className="text-xs font-semibold text-[#2D2D2D]">📅 {dayKey}</span>
                  <span className="text-[10px] text-[#8E8E93] ml-2">{dayDoses.length} {dayDoses.length !== 1 ? t("health.doses") : t("health.dose")}</span>
                </div>
                <div className="divide-y divide-gray-50">
                  {dayDoses.map((dose) => {
                    const adminName = dose.profiles?.full_name ?? "—";
                    const sincePrev = timeSincePrevMap[dose.id] ?? "—";
                    return (
                      <div key={dose.id} className="px-4 py-3 flex items-center gap-3">
                        <span className="text-base">💊</span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-[#2D2D2D]">{formatTimeBR(dose.administered_at)}</span>
                            <span className="text-xs text-[#8E8E93]">— {adminName}</span>
                          </div>
                          {sincePrev !== "—" && (
                            <p className="text-[10px] text-[#8E8E93] mt-0.5">{t("health.sincePreviousDose", { time: sincePrev })}</p>
                          )}
                          {dose.notes && <p className="text-[10px] text-[#8E8E93] mt-0.5 italic">{dose.notes}</p>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
