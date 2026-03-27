"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { APPOINTMENT_TYPES } from "@/lib/health-constants";
import { useI18n } from "@/i18n/provider";

interface AppointmentFormClientProps {
  groupId: string;
  children: { id: string; full_name: string }[];
  professionals: { id: string; name: string; specialty: string | null; whatsapp: string | null }[];
  today: string;
  createAction: (formData: FormData) => Promise<void>;
}

export default function AppointmentFormClient({
  groupId,
  children,
  professionals,
  today,
  createAction,
}: AppointmentFormClientProps) {
  const { t } = useI18n();
  const [appointmentType, setAppointmentType] = useState("rotina");
  const [showReturn, setShowReturn] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(formData: FormData) {
    formData.set("appointmentType", appointmentType);
    if (!showReturn) {
      formData.delete("returnDate");
      formData.delete("returnNotes");
    }
    startTransition(() => {
      createAction(formData);
    });
  }

  return (
    <form action={handleSubmit} className="space-y-4">
      <input type="hidden" name="groupId" value={groupId} />

      {/* Step 1: Tipo da consulta */}
      <div className="bg-white rounded-xl p-4 shadow-sm">
        <div className="flex items-center gap-2 mb-3">
          <span className="flex items-center justify-center w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-bold">1</span>
          <span className="text-sm font-semibold text-dark">{t("health.appointmentForm.appointmentType")}</span>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {APPOINTMENT_TYPES.map((type) => (
            <button
              key={type.value}
              type="button"
              onClick={() => setAppointmentType(type.value)}
              className={`flex flex-col items-start p-3 rounded-xl border-2 transition-all text-left ${
                appointmentType === type.value
                  ? type.color + " border-current"
                  : "border-gray-200 bg-white hover:border-gray-300"
              }`}
            >
              <span className="text-lg mb-1">{type.icon}</span>
              <span className="text-sm font-semibold">{t(`health.appointmentForm.type_${type.value}`)}</span>
              <span className="text-[11px] text-muted leading-tight">{t(`health.appointmentForm.typeDesc_${type.value}`)}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Step 2: Crianca + Profissional */}
      <div className="bg-white rounded-xl p-4 shadow-sm space-y-3">
        <div className="flex items-center gap-2 mb-1">
          <span className="flex items-center justify-center w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-bold">2</span>
          <span className="text-sm font-semibold text-dark">{t("health.appointmentForm.details")}</span>
        </div>

        <div>
          <label className="block text-xs font-medium text-muted mb-1">{t("health.appointmentForm.childRequired")}</label>
          {children.length > 0 ? (
            <select
              name="childId"
              required
              className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-dark focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
            >
              {children.length === 1 ? (
                <option value={children[0].id}>{children[0].full_name}</option>
              ) : (
                <>
                  <option value="">{t("health.select")}</option>
                  {children.map((child) => (
                    <option key={child.id} value={child.id}>{child.full_name}</option>
                  ))}
                </>
              )}
            </select>
          ) : (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800">
              {t("health.registerChildFirst")}{" "}
              <Link href="/criancas/nova" className="text-primary font-semibold underline">
                {t("health.registerChild")}
              </Link>
            </div>
          )}
        </div>

        <div>
          <label className="block text-xs font-medium text-muted mb-1">{t("health.appointmentForm.professional")}</label>
          <select
            name="professionalId"
            className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-dark focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
          >
            <option value="">{t("health.appointmentForm.selectOptional")}</option>
            {professionals.map((prof) => (
              <option key={prof.id} value={prof.id}>
                {prof.name}{prof.specialty ? ` — ${prof.specialty}` : ""}
              </option>
            ))}
          </select>
          <Link href="/saude/profissionais/novo" className="text-[11px] text-primary hover:underline mt-1 inline-block">
            {t("health.appointmentForm.registerNewProfessional")}
          </Link>
        </div>

        <div>
          <label className="block text-xs font-medium text-muted mb-1">
            {appointmentType === "emergencia" ? t("health.appointmentForm.emergencyReason") : t("health.appointmentForm.titleReason")}
          </label>
          <input
            type="text"
            name="title"
            required
            placeholder={
              appointmentType === "rotina" ? t("health.appointmentForm.placeholderRoutine") :
              appointmentType === "emergencia" ? t("health.appointmentForm.placeholderEmergency") :
              appointmentType === "retorno" ? t("health.appointmentForm.placeholderReturn") :
              t("health.appointmentForm.placeholderExam")
            }
            className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-dark placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
          />
        </div>
      </div>

      {/* Step 3: Data e Horario */}
      <div className="bg-white rounded-xl p-4 shadow-sm space-y-3">
        <div className="flex items-center gap-2 mb-1">
          <span className="flex items-center justify-center w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-bold">3</span>
          <span className="text-sm font-semibold text-dark">
            {appointmentType === "emergencia" ? t("health.appointmentForm.whenWasIt") : t("health.appointmentForm.dateAndTime")}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-muted mb-1">{t("health.appointmentForm.date")}</label>
            <input
              type="date"
              name="appointmentDate"
              required
              defaultValue={today}
              min={appointmentType !== "emergencia" ? today : undefined}
              className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-dark focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted mb-1">{t("health.appointmentForm.time")}</label>
            <input
              type="time"
              name="appointmentTime"
              required
              className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-dark focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-muted mb-1">{t("health.appointmentForm.locationLabel")}</label>
          <input
            type="text"
            name="location"
            placeholder={appointmentType === "emergencia" ? t("health.appointmentForm.locationPlaceholderEmergency") : t("health.appointmentForm.locationPlaceholder")}
            className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-dark placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
          />
        </div>
      </div>

      {/* Step 4: Retorno */}
      <div className="bg-white rounded-xl p-4 shadow-sm">
        <div className="flex items-center gap-2 mb-3">
          <span className="flex items-center justify-center w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-bold">4</span>
          <span className="text-sm font-semibold text-dark">{t("health.appointmentForm.returnLabel")}</span>
          <span className="text-xs text-muted">({t("common.optional")})</span>
        </div>

        <button
          type="button"
          onClick={() => setShowReturn(!showReturn)}
          className={`w-full flex items-center gap-3 p-3 rounded-lg border-2 transition-all ${
            showReturn
              ? "border-primary bg-primary/5"
              : "border-gray-200 bg-white hover:border-gray-300"
          }`}
        >
          <span className="text-xl">{showReturn ? "\uD83D\uDD04" : "\uD83D\uDCC5"}</span>
          <div className="flex-1 text-left">
            <p className="text-sm font-semibold text-dark">
              {showReturn ? t("health.appointmentForm.returnExpected") : t("health.appointmentForm.scheduleReturn")}
            </p>
            <p className="text-xs text-muted">
              {showReturn
                ? t("health.appointmentForm.returnReminder")
                : t("health.appointmentForm.defineReturnDate")}
            </p>
          </div>
          <div className={`w-11 h-6 rounded-full transition-colors relative ${showReturn ? "bg-primary" : "bg-gray-300"}`}>
            <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${showReturn ? "translate-x-5" : "translate-x-0.5"}`} />
          </div>
        </button>

        {showReturn && (
          <div className="mt-3 space-y-3 animate-[fadeIn_200ms_ease-out]">
            <div>
              <label className="block text-xs font-medium text-muted mb-1">{t("health.appointmentForm.expectedReturnDate")}</label>
              <input
                type="date"
                name="returnDate"
                className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-dark focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted mb-1">{t("health.appointmentForm.returnNotes")}</label>
              <input
                type="text"
                name="returnNotes"
                placeholder={t("health.appointmentForm.returnNotesPlaceholder")}
                className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-dark placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
              />
            </div>
          </div>
        )}
      </div>

      {/* Step 5: Observacoes */}
      <div className="bg-white rounded-xl p-4 shadow-sm">
        <div className="flex items-center gap-2 mb-3">
          <span className="flex items-center justify-center w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-bold">5</span>
          <span className="text-sm font-semibold text-dark">{t("health.appointmentForm.observations")}</span>
          <span className="text-xs text-muted">({t("common.optional")})</span>
        </div>
        <textarea
          name="notes"
          rows={3}
          placeholder={t("health.appointmentForm.observationsPlaceholder")}
          className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-dark placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary resize-none"
        />
      </div>

      {/* Submit */}
      <button
        type="submit"
        disabled={isPending}
        className={`w-full font-semibold py-3.5 rounded-xl transition-colors shadow-sm disabled:opacity-50 text-base ${
          appointmentType === "emergencia"
            ? "bg-red-600 text-white hover:bg-red-700"
            : "bg-primary text-white hover:bg-primary/90"
        }`}
      >
        {isPending ? t("health.appointmentForm.saving") : appointmentType === "emergencia" ? t("health.appointmentForm.registerEmergency") : t("health.appointmentForm.scheduleAppointment")}
      </button>
    </form>
  );
}
