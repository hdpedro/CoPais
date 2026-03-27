"use client";

import { useState, useTransition } from "react";
import { useI18n } from "@/i18n/provider";

interface CompleteAppointmentFormProps {
  appointmentId: string;
  completeAction: (formData: FormData) => Promise<void>;
}

export default function CompleteAppointmentForm({
  appointmentId,
  completeAction,
}: CompleteAppointmentFormProps) {
  const { t } = useI18n();
  const [isOpen, setIsOpen] = useState(false);
  const [summary, setSummary] = useState("");
  const [diagnosis, setDiagnosis] = useState("");
  const [prescriptions, setPrescriptions] = useState("");
  const [returnDate, setReturnDate] = useState("");
  const [returnNotes, setReturnNotes] = useState("");
  const [isPending, startTransition] = useTransition();

  function handleSubmit(formData: FormData) {
    if (!summary.trim()) return;
    formData.set("appointmentId", appointmentId);
    formData.set("summary", summary.trim());
    formData.set("diagnosis", diagnosis.trim());
    formData.set("prescriptions", prescriptions.trim());
    if (returnDate) formData.set("returnDate", returnDate);
    if (returnNotes.trim()) formData.set("returnNotes", returnNotes.trim());
    startTransition(() => {
      completeAction(formData).then(() => {
        setSummary("");
        setDiagnosis("");
        setPrescriptions("");
        setReturnDate("");
        setReturnNotes("");
        setIsOpen(false);
      });
    });
  }

  if (!isOpen) {
    return (
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="w-full text-center text-xs font-semibold text-green-700 bg-green-50/50 hover:bg-green-50 py-2.5 transition-colors flex items-center justify-center gap-1.5 border-t border-gray-100"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        {t("health.completeAppointment.completeButton")}
      </button>
    );
  }

  return (
    <form action={handleSubmit} className="p-3 bg-green-50/50 border-t border-gray-100 animate-[fadeIn_200ms_ease-out]">
      <p className="text-xs font-semibold text-dark mb-2">{t("health.completeAppointment.summaryTitle")}</p>

      {/* Summary textarea */}
      <textarea
        value={summary}
        onChange={(e) => setSummary(e.target.value)}
        placeholder={t("health.completeAppointment.summaryPlaceholder")}
        rows={3}
        required
        className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-xs text-dark placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-green-300 focus:border-green-400 mb-2 resize-none"
      />

      {/* Diagnosis */}
      <input
        type="text"
        value={diagnosis}
        onChange={(e) => setDiagnosis(e.target.value)}
        placeholder={t("health.completeAppointment.diagnosisPlaceholder")}
        className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-xs text-dark placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-green-300 focus:border-green-400 mb-2"
      />

      {/* Prescriptions */}
      <input
        type="text"
        value={prescriptions}
        onChange={(e) => setPrescriptions(e.target.value)}
        placeholder={t("health.completeAppointment.prescriptionsPlaceholder")}
        className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-xs text-dark placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-green-300 focus:border-green-400 mb-2"
      />

      {/* Return date */}
      <div className="flex gap-2 mb-2">
        <input
          type="date"
          value={returnDate}
          onChange={(e) => setReturnDate(e.target.value)}
          className="flex-1 bg-white border border-gray-200 rounded-lg px-3 py-2 text-xs text-dark placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-green-300 focus:border-green-400"
          placeholder={t("health.completeAppointment.returnPlaceholder")}
        />
        <input
          type="text"
          value={returnNotes}
          onChange={(e) => setReturnNotes(e.target.value)}
          placeholder={t("health.completeAppointment.returnNotesPlaceholder")}
          className="flex-1 bg-white border border-gray-200 rounded-lg px-3 py-2 text-xs text-dark placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-green-300 focus:border-green-400"
        />
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => { setIsOpen(false); setSummary(""); setDiagnosis(""); setPrescriptions(""); setReturnDate(""); setReturnNotes(""); }}
          className="flex-1 px-3 py-1.5 text-xs font-semibold bg-white border border-gray-200 rounded-lg text-muted hover:bg-gray-50"
        >
          {t("common.cancel")}
        </button>
        <button
          type="submit"
          disabled={isPending || !summary.trim()}
          className="flex-1 px-3 py-1.5 text-xs font-semibold bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
        >
          {isPending ? t("health.completeAppointment.saving") : t("health.completeAppointment.complete")}
        </button>
      </div>
    </form>
  );
}
