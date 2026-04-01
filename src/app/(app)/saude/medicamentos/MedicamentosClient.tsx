"use client";

import Link from "next/link";
import { useI18n } from "@/i18n/provider";
import ConfirmDoseButton from "../ConfirmDoseButton";

interface Medication {
  id: string;
  name: string;
  dosage: string | null;
  frequency: string | null;
  frequency_hours: number | null;
  reason: string | null;
  prescribed_by: string | null;
  start_date: string | null;
  end_date: string | null;
  status: string;
  notes: string | null;
  children: { full_name: string }[] | { full_name: string } | null;
}

interface Dose {
  id: string;
  medication_id: string;
  administered_at: string;
  notes: string | null;
  profiles: { full_name: string }[] | { full_name: string } | null;
}

interface Props {
  activeMeds: Medication[];
  historyMeds: Medication[];
  doses: Dose[];
  isReadonly: boolean;
  success?: string;
  error?: string;
  updateStatusAction: (formData: FormData) => Promise<void>;
  progressMap: Record<string, { elapsed: number; totalDays: number; percent: number } | null>;
}

export default function MedicamentosClient({
  activeMeds,
  historyMeds,
  doses,
  isReadonly,
  success,
  error: errorMsg,
  updateStatusAction,
  progressMap,
}: Props) {
  const { t } = useI18n();

  function childName(children: Medication["children"]): string {
    if (!children) return "";
    if (Array.isArray(children)) return children[0]?.full_name ?? "";
    return children.full_name ?? "";
  }

  function dosePerson(profiles: Dose["profiles"]): string {
    if (!profiles) return "—";
    if (Array.isArray(profiles)) return profiles[0]?.full_name ?? "—";
    return profiles.full_name ?? "—";
  }

  function formatDateBR(dateStr: string | null) {
    if (!dateStr) return "—";
    return new Date(dateStr + "T00:00:00").toLocaleDateString("pt-BR");
  }

  function formatDateTimeBR(dateStr: string | null) {
    if (!dateStr) return "—";
    return new Date(dateStr).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
  }

  return (
    <div className="max-w-lg mx-auto pb-20 space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/saude" className="text-[#8E8E93] hover:text-[#2D2D2D]" aria-label={t("health.backToHealth")}>
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </Link>
        <h1 className="text-2xl font-bold text-[#2D2D2D]">{t("health.medications")}</h1>
      </div>

      {success && (
        <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-xl text-sm">
          {decodeURIComponent(success)}
        </div>
      )}
      {errorMsg && (
        <div className="bg-red-50 border border-red-200 text-[#DC4446] px-4 py-3 rounded-xl text-sm">
          {decodeURIComponent(errorMsg)}
        </div>
      )}

      {/* Active Medications */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-[#2D2D2D]">{t("health.activeMedications")}</h2>

        {activeMeds.length === 0 ? (
          <div className="bg-white rounded-xl p-8 shadow-sm text-center">
            <p className="text-4xl mb-3" aria-hidden="true">💊</p>
            <p className="text-[#8E8E93] text-sm mb-1">{t("health.noActiveMedication")}</p>
            <p className="text-[#8E8E93] text-xs">{t("health.addMedicationsToTrack")}</p>
          </div>
        ) : (
          activeMeds.map((med) => {
            const progress = progressMap[med.id] ?? null;
            const medDoses = doses.filter((d) => d.medication_id === med.id).slice(0, 3);

            return (
              <div key={med.id} className="bg-white rounded-xl p-4 shadow-sm border-l-4 border-[#DC4446]">
                <div className="flex items-center justify-between mb-3">
                  <Link href={`/saude/medicamentos/${med.id}`} className="min-w-0 flex-1 hover:opacity-70 transition-opacity">
                    <span className="font-bold text-sm text-[#2D2D2D]">{med.name}</span>
                    <span className="text-xs text-[#8E8E93] ml-2">— {childName(med.children)}</span>
                  </Link>
                  <span className="inline-flex items-center gap-1 text-xs font-medium text-[#DC4446] bg-red-50 px-2 py-0.5 rounded-full">
                    <span className="text-[8px]" aria-hidden="true">●</span> {t("health.active")}
                  </span>
                </div>

                <div className="space-y-1 text-sm text-[#2D2D2D]">
                  {med.dosage && <p><span className="mr-1" aria-hidden="true">💊</span> {t("health.dosage")}: {med.dosage}</p>}
                  {med.frequency && <p><span className="mr-1" aria-hidden="true">⏰</span> {t("health.frequency")}: {med.frequency}</p>}
                  {med.reason && <p><span className="mr-1" aria-hidden="true">📋</span> {t("health.reason")}: {med.reason}</p>}
                  <p>
                    <span className="mr-1" aria-hidden="true">📅</span>
                    {med.end_date
                      ? `${t("health.period")}: ${formatDateBR(med.start_date)} → ${formatDateBR(med.end_date)}`
                      : `${t("health.since")} ${formatDateBR(med.start_date)} · ${t("health.continuousUse")}`}
                  </p>
                  {med.prescribed_by && <p><span className="mr-1" aria-hidden="true">👩‍⚕️</span> {t("health.prescribedBy")}: {med.prescribed_by}</p>}
                </div>

                {progress && (
                  <div className="mt-3">
                    <div className="flex items-center justify-between text-xs text-[#8E8E93] mb-1">
                      <span>{t("health.progress")}</span>
                      <span>{t("health.daysProgress", { elapsed: progress.elapsed, total: progress.totalDays })}</span>
                    </div>
                    <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full bg-[#5B9B8A] rounded-full transition-all" style={{ width: `${progress.percent}%` }} />
                    </div>
                  </div>
                )}

                <div className="mt-3 pt-3 border-t border-gray-100">
                  <div className="flex items-center justify-between mb-1.5">
                    <p className="text-xs font-medium text-[#8E8E93]">{t("health.recentDoses")}</p>
                    {medDoses.length > 0 && (
                      <Link href={`/saude/medicamentos/${med.id}`} className="text-[10px] font-medium text-[#5B9B8A] hover:underline">
                        {t("health.viewFullHistory")}
                      </Link>
                    )}
                  </div>
                  {medDoses.length > 0 ? (
                    <div className="space-y-1">
                      {medDoses.map((dose) => (
                        <div key={dose.id} className="flex items-center justify-between text-xs text-[#2D2D2D]">
                          <span>{formatDateTimeBR(dose.administered_at)}</span>
                          <span className="text-[#8E8E93]">por {dosePerson(dose.profiles)}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-[#8E8E93] italic">{t("health.noDoseYet")}</p>
                  )}
                </div>

                {!isReadonly && (() => {
                  const lastDose = medDoses[0];
                  const lastDoseMinutesAgo = lastDose
                    ? Math.floor((Date.now() - new Date(lastDose.administered_at).getTime()) / (1000 * 60))
                    : null;
                  const freqHours = med.frequency_hours || 8;
                  const isOverdue = lastDoseMinutesAgo !== null && lastDoseMinutesAgo > freqHours * 60;

                  return (
                    <div className="mt-3 pt-3 border-t border-gray-100 flex items-center gap-2">
                      <div className="flex-1">
                        <ConfirmDoseButton
                          medicationId={med.id}
                          redirectTo="/saude/medicamentos"
                          isOverdue={isOverdue}
                          lastDoseMinutesAgo={lastDoseMinutesAgo}
                          frequencyHours={freqHours}
                          medName={med.name}
                        />
                      </div>
                      <form action={updateStatusAction}>
                        <input type="hidden" name="medicationId" value={med.id} />
                        <input type="hidden" name="status" value="completed" />
                        <button type="submit" className="px-3 py-2 text-xs text-[#8E8E93] hover:text-[#2D2D2D] transition-colors">
                          {t("health.completeTreatment")}
                        </button>
                      </form>
                    </div>
                  );
                })()}
              </div>
            );
          })
        )}
      </section>

      {/* History */}
      {historyMeds.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-[#2D2D2D]">{t("health.history")}</h2>
          {historyMeds.map((med) => (
            <Link key={med.id} href={`/saude/medicamentos/${med.id}`} className="block bg-white rounded-xl p-4 shadow-sm hover:shadow-md transition-shadow">
              <div className="flex items-center justify-between">
                <div>
                  <span className="font-medium text-sm text-[#2D2D2D]">{med.name}</span>
                  <span className="text-xs text-[#8E8E93] ml-2">— {childName(med.children)}</span>
                </div>
                {med.status === "completed" ? (
                  <span className="inline-flex items-center gap-1 text-xs font-medium text-green-600 bg-green-50 px-2 py-0.5 rounded-full">
                    <span aria-hidden="true">✓</span> {t("health.completed")}
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-xs font-medium text-[#8E8E93] bg-gray-100 px-2 py-0.5 rounded-full">
                    {t("health.cancelled")}
                  </span>
                )}
              </div>
              <div className="mt-2 text-xs text-[#8E8E93] space-y-0.5">
                {med.dosage && <p><span aria-hidden="true">💊</span> {med.dosage}</p>}
                <p>📅 {med.end_date ? `${formatDateBR(med.start_date)} → ${formatDateBR(med.end_date)}` : `${t("health.since")} ${formatDateBR(med.start_date)}`}</p>
              </div>
            </Link>
          ))}
        </section>
      )}

      {/* Add Button */}
      {!isReadonly && (
        <Link href="/saude/medicamentos/novo" className="block w-full py-3 bg-accent text-white text-sm font-semibold rounded-xl text-center hover:bg-accent/90 transition-colors shadow-sm">
          + {t("health.addMedication")}
        </Link>
      )}
    </div>
  );
}
