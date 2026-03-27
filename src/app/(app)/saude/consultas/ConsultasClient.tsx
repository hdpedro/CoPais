"use client";

import Link from "next/link";
import { useI18n } from "@/i18n/provider";
import { APPOINTMENT_STATUSES } from "@/lib/health-constants";
import CompleteAppointmentForm from "./CompleteAppointmentForm";

interface Props {
  appointments: any[];
  upcoming: any[];
  past: any[];
  pendingReturns: any[];
  isReadonly: boolean;
  success?: string;
  error?: string;
  completeAction: (formData: FormData) => Promise<void>;
}

export default function ConsultasClient({
  upcoming,
  past,
  pendingReturns,
  isReadonly,
  success,
  error: errorMsg,
  completeAction,
}: Props) {
  const { t } = useI18n();

  const typeConfig: Record<string, { icon: string; label: string; accent: string; dateBg: string }> = {
    rotina: { icon: "🩺", label: t("health.appointmentTypeRoutine"), accent: "border-l-primary", dateBg: "bg-primary/10 text-primary" },
    emergencia: { icon: "🚨", label: t("health.appointmentTypeEmergency"), accent: "border-l-red-400", dateBg: "bg-red-50 text-red-600" },
    retorno: { icon: "🔄", label: t("health.appointmentTypeReturn"), accent: "border-l-amber-400", dateBg: "bg-amber-50 text-amber-600" },
    exame: { icon: "🔬", label: t("health.appointmentTypeExam"), accent: "border-l-violet-400", dateBg: "bg-violet-50 text-violet-600" },
  };

  function formatDate(dateStr: string) {
    const date = new Date(dateStr);
    const day = date.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", day: "numeric" });
    const month = date.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", month: "short" });
    return { day, month };
  }

  function formatTime(dateStr: string) {
    return new Date(dateStr).toLocaleTimeString("pt-BR", {
      timeZone: "America/Sao_Paulo",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  function cleanWhatsAppNumber(number: string): string {
    const digits = number.replace(/\D/g, "");
    if (digits.length <= 11) return "55" + digits;
    return digits;
  }

  function renderAppointmentCard(apt: any, isPast: boolean, showCompleteForm: boolean = false) {
    const { day, month } = formatDate(apt.appointment_date);
    const time = formatTime(apt.appointment_date);
    const professional = apt.medical_professionals as any;
    const child = apt.children as any;
    const status = APPOINTMENT_STATUSES[apt.status] || { label: apt.status, color: "bg-gray-100 text-gray-500" };
    const tc = typeConfig[apt.appointment_type || "rotina"] || typeConfig.rotina;

    return (
      <div
        key={apt.id}
        className={`bg-white rounded-xl shadow-sm border-l-4 ${tc.accent} ${isPast ? "opacity-75" : ""}`}
      >
        <div className="p-4">
          <div className="flex gap-3">
            <div className={`flex-shrink-0 w-14 h-14 ${isPast ? "bg-gray-100" : tc.dateBg} rounded-lg flex flex-col items-center justify-center`}>
              <span className={`text-lg font-bold leading-none ${isPast ? "text-muted" : ""}`}>{day}</span>
              <span className={`text-xs uppercase ${isPast ? "text-muted" : ""}`}>{month}</span>
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-sm">{tc.icon}</span>
                <h3 className="font-semibold text-dark text-sm truncate">{apt.title}</h3>
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full whitespace-nowrap ${status.color}`}>
                  {status.label}
                </span>
                {apt.appointment_type && apt.appointment_type !== "rotina" && (
                  <span className="text-[10px] font-medium text-muted bg-gray-100 px-1.5 py-0.5 rounded-full">
                    {tc.label}
                  </span>
                )}
              </div>
              {professional && (
                <div className="flex items-center gap-1 mt-0.5">
                  <p className="text-xs text-muted">
                    {professional.name}{professional.specialty && ` — ${professional.specialty}`}
                  </p>
                  {!isPast && professional.whatsapp && (
                    <a
                      href={`https://wa.me/${cleanWhatsAppNumber(professional.whatsapp)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[#25D366]"
                    >
                      <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z" />
                        <path d="M12 0C5.373 0 0 5.373 0 12c0 2.625.846 5.059 2.284 7.034L.789 23.492a.5.5 0 00.611.611l4.458-1.495A11.952 11.952 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22c-2.37 0-4.567-.7-6.412-1.9l-.447-.29-2.642.886.886-2.642-.29-.447A9.953 9.953 0 012 12C2 6.486 6.486 2 12 2s10 4.486 10 10-4.486 10-10 10z" />
                      </svg>
                    </a>
                  )}
                </div>
              )}
              {child && <p className="text-[11px] text-muted mt-0.5">{child.full_name}</p>}
              <div className="flex items-center gap-3 mt-1 text-[11px] text-muted">
                <span>🕐 {time}</span>
                {apt.location && <span>📍 {apt.location}</span>}
              </div>
              {apt.summary && (
                <p className="text-xs text-dark mt-2 bg-gray-50 rounded-lg p-2">{apt.summary}</p>
              )}
            </div>
          </div>
        </div>

        {/* Return date badge */}
        {apt.return_date && (
          <div className="border-t border-gray-100 px-4 py-2 flex items-center gap-2">
            <span className="text-xs">🔄</span>
            <p className="text-xs text-muted flex-1">
              {t("health.expectedReturn")}: <span className="font-semibold text-dark">
                {new Date(apt.return_date + "T12:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" })}
              </span>
              {apt.return_notes && <span className="text-muted"> — {apt.return_notes}</span>}
            </p>
          </div>
        )}

        {/* Complete appointment form */}
        {showCompleteForm && apt.status === "scheduled" && (
          <CompleteAppointmentForm
            appointmentId={apt.id}
            completeAction={completeAction}
          />
        )}
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
        <h1 className="text-2xl font-bold text-dark">{t("health.appointments")}</h1>
      </div>

      {success && (
        <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm">
          {decodeURIComponent(success)}
        </div>
      )}
      {errorMsg && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          {decodeURIComponent(errorMsg)}
        </div>
      )}

      {/* Pending returns alert */}
      {pendingReturns.length > 0 && (
        <div className="mb-5 bg-amber-50 border border-amber-200 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-base">🔄</span>
            <h3 className="text-sm font-semibold text-amber-800">{t("health.pendingReturns")}</h3>
          </div>
          <div className="space-y-2">
            {pendingReturns.map((apt) => {
              const professional = apt.medical_professionals as any;
              return (
                <div key={apt.id} className="flex items-center gap-2 text-xs">
                  <span className="font-semibold text-amber-700">
                    {new Date(apt.return_date + "T12:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })}
                  </span>
                  <span className="text-amber-600">
                    {apt.title}{professional?.specialty ? ` (${professional.specialty})` : ""}
                  </span>
                  {apt.return_notes && <span className="text-amber-500">— {apt.return_notes}</span>}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Upcoming appointments */}
      <section className="mb-6">
        <div className="flex items-center gap-2 mb-3">
          <h2 className="text-sm font-semibold text-dark">{t("health.upcomingAppointments")}</h2>
          <span className="px-2 py-0.5 text-[11px] font-medium bg-primary/10 text-primary rounded-full">
            {upcoming.length}
          </span>
        </div>

        {upcoming.length > 0 ? (
          <div className="space-y-3">
            {upcoming.map((apt) => renderAppointmentCard(apt, false, !isReadonly))}
          </div>
        ) : (
          <div className="bg-white rounded-xl p-8 shadow-sm text-center">
            <p className="text-4xl mb-3" aria-hidden="true">📅</p>
            <p className="text-muted text-sm mb-1">{t("health.noAppointmentScheduled")}</p>
            <p className="text-muted text-xs">{t("health.scheduleAppointmentsToTrack")}</p>
          </div>
        )}
      </section>

      {/* Past appointments */}
      {past.length > 0 && (
        <section className="mb-6">
          <h2 className="text-sm font-semibold text-dark mb-3">{t("health.history")}</h2>
          <div className="space-y-3">
            {past.map((apt) => renderAppointmentCard(apt, true, !isReadonly))}
          </div>
        </section>
      )}

      {/* Add appointment button */}
      {!isReadonly && (
        <Link
          href="/saude/consultas/nova"
          className="fixed bottom-24 left-1/2 -translate-x-1/2 z-10 inline-flex items-center gap-2 px-5 py-3 bg-primary text-white text-sm font-semibold rounded-full shadow-lg hover:shadow-xl transition-all"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          {t("health.scheduleAppointmentButton")}
        </Link>
      )}
    </div>
  );
}
