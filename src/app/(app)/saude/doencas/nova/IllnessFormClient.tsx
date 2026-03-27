"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import SymptomsSelector from "../SymptomsSelector";
import { useI18n } from "@/i18n/provider";

interface IllnessFormClientProps {
  groupId: string;
  children: { id: string; full_name: string }[];
  today: string;
  createAction: (formData: FormData) => Promise<void>;
}

const SEVERITY_VALUES = ["leve", "moderado", "grave"] as const;

const COMMON_ILLNESS_KEYS = [
  "flu", "cold", "otitis", "tonsillitis", "conjunctivitis",
  "viralInfection", "stomachache", "allergy", "covid",
] as const;

export default function IllnessFormClient({
  groupId,
  children,
  today,
  createAction,
}: IllnessFormClientProps) {
  const { t } = useI18n();
  const [severity, setSeverity] = useState("leve");
  const [hospitalVisit, setHospitalVisit] = useState(false);
  const [title, setTitle] = useState("");
  const [isPending, startTransition] = useTransition();

  const SEVERITY_OPTIONS = [
    { value: "leve", icon: "\uD83D\uDFE2" },
    { value: "moderado", icon: "\uD83D\uDFE1" },
    { value: "grave", icon: "\uD83D\uDD34" },
  ];

  const COMMON_ILLNESSES = COMMON_ILLNESS_KEYS.map((key) => t(`health.illnessForm.illness_${key}`));

  function handleSubmit(formData: FormData) {
    formData.set("severity", severity);
    formData.set("hospitalVisit", hospitalVisit ? "true" : "false");
    startTransition(() => {
      createAction(formData);
    });
  }

  return (
    <form action={handleSubmit} className="space-y-4">
      <input type="hidden" name="groupId" value={groupId} />

      {/* Step 1: Child + Quick Title */}
      <div className="bg-white rounded-xl p-4 shadow-sm space-y-4">
        <div className="flex items-center gap-2 mb-1">
          <span className="flex items-center justify-center w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-bold">1</span>
          <span className="text-sm font-semibold text-dark">{t("health.illnessForm.whatHappened")}</span>
        </div>

        {/* Child selector */}
        <div>
          <label className="block text-xs font-medium text-muted mb-1">{t("health.illnessForm.childRequired")}</label>
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

        {/* Quick illness buttons */}
        <div>
          <label className="block text-xs font-medium text-muted mb-2">{t("health.illnessForm.chooseOrType")}</label>
          <div className="flex flex-wrap gap-1.5">
            {COMMON_ILLNESSES.map((illness) => (
              <button
                key={illness}
                type="button"
                onClick={() => setTitle(illness)}
                className={`px-3 py-1.5 text-xs rounded-full transition-all ${
                  title === illness
                    ? "bg-primary text-white shadow-sm"
                    : "bg-gray-100 text-dark hover:bg-gray-200"
                }`}
              >
                {illness}
              </button>
            ))}
          </div>
        </div>

        {/* Title input */}
        <input
          type="text"
          name="title"
          required
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={t("health.illnessForm.illnessNamePlaceholder")}
          className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-dark placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
        />
      </div>

      {/* Step 2: Symptoms */}
      <div className="bg-white rounded-xl p-4 shadow-sm">
        <div className="flex items-center gap-2 mb-3">
          <span className="flex items-center justify-center w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-bold">2</span>
          <span className="text-sm font-semibold text-dark">{t("health.illnessForm.symptoms")}</span>
        </div>
        <SymptomsSelector />
      </div>

      {/* Step 3: Severity */}
      <div className="bg-white rounded-xl p-4 shadow-sm">
        <div className="flex items-center gap-2 mb-3">
          <span className="flex items-center justify-center w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-bold">3</span>
          <span className="text-sm font-semibold text-dark">{t("health.illnessForm.severityLabel")}</span>
        </div>
        <div className="space-y-2">
          {SEVERITY_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setSeverity(opt.value)}
              className={`w-full flex items-center gap-3 p-3 rounded-lg border-2 transition-all text-left ${
                severity === opt.value
                  ? opt.value === "leve"
                    ? "border-green-400 bg-green-50"
                    : opt.value === "moderado"
                    ? "border-amber-400 bg-amber-50"
                    : "border-red-400 bg-red-50"
                  : "border-gray-200 bg-white hover:border-gray-300"
              }`}
            >
              <span className="text-xl">{opt.icon}</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-dark">{t(`health.illnessForm.severity_${opt.value}`)}</p>
                <p className="text-xs text-muted">{t(`health.illnessForm.severityDesc_${opt.value}`)}</p>
              </div>
              {severity === opt.value && (
                <svg className="w-5 h-5 text-primary flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Step 4: Hospital Visit */}
      <div className="bg-white rounded-xl p-4 shadow-sm">
        <div className="flex items-center gap-2 mb-3">
          <span className="flex items-center justify-center w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-bold">4</span>
          <span className="text-sm font-semibold text-dark">{t("health.illnessForm.careLabel")}</span>
        </div>

        {/* Toggle hospital visit */}
        <button
          type="button"
          onClick={() => setHospitalVisit(!hospitalVisit)}
          className={`w-full flex items-center gap-3 p-3 rounded-lg border-2 transition-all ${
            hospitalVisit
              ? "border-red-300 bg-red-50"
              : "border-gray-200 bg-white hover:border-gray-300"
          }`}
        >
          <span className="text-xl">{hospitalVisit ? "\uD83C\uDFE5" : "\uD83C\uDFE0"}</span>
          <div className="flex-1 text-left">
            <p className="text-sm font-semibold text-dark">
              {hospitalVisit ? t("health.illnessForm.wentToHospital") : t("health.illnessForm.homecare")}
            </p>
            <p className="text-xs text-muted">
              {hospitalVisit
                ? t("health.illnessForm.neededMedicalCare")
                : t("health.illnessForm.noHospitalNeeded")}
            </p>
          </div>
          <div
            className={`w-11 h-6 rounded-full transition-colors relative ${
              hospitalVisit ? "bg-red-400" : "bg-gray-300"
            }`}
          >
            <div
              className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                hospitalVisit ? "translate-x-5" : "translate-x-0.5"
              }`}
            />
          </div>
        </button>

        {/* Hospital details - fade in */}
        {hospitalVisit && (
          <div className="mt-3 space-y-3 animate-[fadeIn_200ms_ease-out]">
            <div>
              <label className="block text-xs font-medium text-muted mb-1">
                {t("health.illnessForm.hospitalName")}
              </label>
              <input
                type="text"
                name="hospitalName"
                placeholder={t("health.illnessForm.hospitalNamePlaceholder")}
                className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-dark placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted mb-1">
                {t("health.illnessForm.careDate")}
              </label>
              <input
                type="date"
                name="hospitalDate"
                defaultValue={today}
                className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-dark focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
              />
            </div>
          </div>
        )}
      </div>

      {/* Step 5: Details */}
      <div className="bg-white rounded-xl p-4 shadow-sm">
        <div className="flex items-center gap-2 mb-3">
          <span className="flex items-center justify-center w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-bold">5</span>
          <span className="text-sm font-semibold text-dark">{t("health.illnessForm.detailsLabel")}</span>
          <span className="text-xs text-muted">({t("common.optional")})</span>
        </div>

        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-muted mb-1">{t("health.illnessForm.startDate")}</label>
            <input
              type="date"
              name="startDate"
              defaultValue={today}
              className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-dark focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-muted mb-1">{t("health.illnessForm.medicalDiagnosis")}</label>
            <input
              type="text"
              name="diagnosis"
              placeholder={t("health.illnessForm.diagnosisPlaceholder")}
              className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-dark placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-muted mb-1">{t("health.illnessForm.observations")}</label>
            <textarea
              name="notes"
              rows={3}
              placeholder={t("health.illnessForm.observationsPlaceholder")}
              className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-dark placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary resize-none"
            />
          </div>
        </div>
      </div>

      {/* Submit */}
      <button
        type="submit"
        disabled={isPending || !title.trim()}
        className="w-full bg-primary text-white font-semibold py-3.5 rounded-xl hover:bg-primary/90 transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed text-base"
      >
        {isPending ? t("health.illnessForm.registering") : t("health.illnessForm.registerEpisode")}
      </button>
    </form>
  );
}
