"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useI18n } from "@/i18n/provider";
import { MEDICATION_FREQUENCIES, ILLNESS_COMMON_SYMPTOMS } from "@/lib/health-constants";

interface IllnessWizardProps {
  groupId: string;
  childrenList: { id: string; full_name: string }[];
  today: string;
  createAction: (formData: FormData) => Promise<void>;
}

const COMMON_ILLNESS_KEYS = [
  "flu", "cold", "otitis", "tonsillitis", "conjunctivitis",
  "viralInfection", "stomachache", "allergy", "covid",
] as const;

const SEVERITY_OPTIONS = [
  { value: "leve", icon: "🟢" },
  { value: "moderado", icon: "🟡" },
  { value: "grave", icon: "🔴" },
];

export default function IllnessWizard({
  groupId,
  childrenList,
  today,
  createAction,
}: IllnessWizardProps) {
  const { t } = useI18n();
  const [step, setStep] = useState(1);
  const [isPending, startTransition] = useTransition();

  // Step 1: Illness
  const [title, setTitle] = useState("");
  const [severity, setSeverity] = useState("leve");
  const [hospitalVisit, setHospitalVisit] = useState(false);
  const [hospitalName, setHospitalName] = useState("");
  const [childId, setChildId] = useState(childrenList.length === 1 ? childrenList[0].id : "");
  const [symptoms, setSymptoms] = useState<string[]>([]);

  // Step 2: Medication (optional)
  const [addMed, setAddMed] = useState(false);
  const [medName, setMedName] = useState("");
  const [medDosage, setMedDosage] = useState("");
  const [medFrequency, setMedFrequency] = useState("");
  const [medFrequencyHours, setMedFrequencyHours] = useState<string>("");
  const [medEndDate, setMedEndDate] = useState("");

  // Step 3: Appointment (optional)
  const [addApt, setAddApt] = useState(false);
  const [aptTitle, setAptTitle] = useState("");
  const [aptDate, setAptDate] = useState("");
  const [aptTime, setAptTime] = useState("");
  const [aptLocation, setAptLocation] = useState("");

  const COMMON_ILLNESSES = COMMON_ILLNESS_KEYS.map((key) => t(`health.illnessForm.illness_${key}`));

  function canProceedStep1() {
    return childId && title;
  }

  function handleSubmit() {
    const formData = new FormData();
    formData.set("groupId", groupId);
    formData.set("childId", childId);
    formData.set("title", title);
    formData.set("symptoms", symptoms.join(","));
    formData.set("startDate", today);
    formData.set("severity", severity);
    formData.set("hospitalVisit", hospitalVisit ? "true" : "false");
    if (hospitalName) formData.set("hospitalName", hospitalName);

    // Medication
    if (addMed && medName) {
      formData.set("medName", medName);
      formData.set("medDosage", medDosage);
      formData.set("medFrequency", medFrequency);
      if (medFrequencyHours) formData.set("medFrequencyHours", medFrequencyHours);
      formData.set("medStartDate", today);
      if (medEndDate) formData.set("medEndDate", medEndDate);
    }

    // Appointment
    if (addApt && aptTitle && aptDate && aptTime) {
      formData.set("aptTitle", aptTitle);
      formData.set("aptDate", aptDate);
      formData.set("aptTime", aptTime);
      if (aptLocation) formData.set("aptLocation", aptLocation);
    }

    startTransition(() => {
      createAction(formData);
    });
  }

  // Progress indicator
  const stepLabels = [
    t("health.wizard.step1"),
    t("health.wizard.step2"),
    t("health.wizard.step3"),
  ];

  return (
    <div className="space-y-4">
      {/* Progress bar */}
      <div className="flex items-center gap-2 mb-2">
        {[1, 2, 3].map((s) => (
          <div key={s} className="flex-1 flex items-center gap-2">
            <div className={`flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold transition-colors ${
              s < step ? "bg-green-500 text-white" :
              s === step ? "bg-primary text-white" :
              "bg-gray-200 text-muted"
            }`}>
              {s < step ? "✓" : s}
            </div>
            <span className={`text-[11px] font-medium flex-1 ${s === step ? "text-dark" : "text-muted"}`}>
              {stepLabels[s - 1]}
            </span>
          </div>
        ))}
      </div>

      {/* Step 1: What happened? */}
      {step === 1 && (
        <div className="bg-white rounded-xl p-5 shadow-sm space-y-4">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xl">🤒</span>
            <span className="text-base font-bold text-dark">{t("health.wizard.whatHappened")}</span>
          </div>

          {/* Child selector */}
          {childrenList.length > 1 && (
            <div>
              <label className="block text-xs font-medium text-muted mb-1">{t("health.illnessForm.childRequired")}</label>
              <select
                value={childId}
                onChange={(e) => setChildId(e.target.value)}
                className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-dark focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
              >
                <option value="">{t("health.select")}</option>
                {childrenList.map((child) => (
                  <option key={child.id} value={child.id}>{child.full_name}</option>
                ))}
              </select>
            </div>
          )}

          {childrenList.length === 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800">
              {t("health.registerChildFirst")}{" "}
              <Link href="/criancas/nova" className="text-primary font-semibold underline">
                {t("health.registerChild")}
              </Link>
            </div>
          )}

          {/* Quick illness buttons */}
          <div>
            <label className="block text-xs font-medium text-muted mb-2">{t("health.illnessForm.chooseOrType")}</label>
            <div className="flex flex-wrap gap-1.5 mb-2">
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
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t("health.illnessForm.illnessNamePlaceholder")}
              className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-dark focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
            />
          </div>

          {/* Symptoms */}
          <div>
            <label className="block text-xs font-medium text-muted mb-2">{t("health.illnessForm.symptoms")}</label>
            <div className="flex flex-wrap gap-1.5">
              {ILLNESS_COMMON_SYMPTOMS.map((symptom) => (
                <button
                  key={symptom}
                  type="button"
                  onClick={() => setSymptoms(prev => prev.includes(symptom) ? prev.filter(s => s !== symptom) : [...prev, symptom])}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                    symptoms.includes(symptom) ? "bg-accent text-white" : "bg-gray-100 text-dark hover:bg-gray-200"
                  }`}
                >
                  {symptom}
                </button>
              ))}
            </div>
          </div>

          {/* Severity */}
          <div>
            <label className="block text-xs font-medium text-muted mb-2">{t("health.illnessForm.severityLabel")}</label>
            <div className="grid grid-cols-3 gap-2">
              {SEVERITY_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setSeverity(opt.value)}
                  className={`flex flex-col items-center gap-1 p-3 rounded-xl border-2 transition-all ${
                    severity === opt.value
                      ? "border-primary bg-primary/5"
                      : "border-gray-200 hover:border-gray-300"
                  }`}
                >
                  <span className="text-xl">{opt.icon}</span>
                  <span className="text-xs font-semibold text-dark">
                    {t(`health.illnessForm.severity_${opt.value}`)}
                  </span>
                  <span className="text-[10px] text-muted text-center leading-tight">
                    {t(`health.illnessForm.severityDesc_${opt.value}`)}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Hospital visit */}
          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setHospitalVisit(true)}
                className={`flex items-center gap-2 p-3 rounded-xl border-2 transition-all text-left ${
                  hospitalVisit ? "border-primary bg-primary/5" : "border-gray-200"
                }`}
              >
                <span className="text-lg">🏥</span>
                <span className="text-xs font-medium text-dark">{t("health.illnessForm.wentToHospital")}</span>
              </button>
              <button
                type="button"
                onClick={() => { setHospitalVisit(false); setHospitalName(""); }}
                className={`flex items-center gap-2 p-3 rounded-xl border-2 transition-all text-left ${
                  !hospitalVisit ? "border-primary bg-primary/5" : "border-gray-200"
                }`}
              >
                <span className="text-lg">🏠</span>
                <span className="text-xs font-medium text-dark">{t("health.illnessForm.homecare")}</span>
              </button>
            </div>
            {hospitalVisit && (
              <input
                type="text"
                value={hospitalName}
                onChange={(e) => setHospitalName(e.target.value)}
                placeholder={t("health.illnessForm.hospitalNamePlaceholder")}
                className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-dark focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
              />
            )}
          </div>

          <button
            type="button"
            onClick={() => setStep(2)}
            disabled={!canProceedStep1()}
            className="w-full py-3 rounded-xl font-bold text-white bg-primary hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {t("health.wizard.next")}
          </button>
        </div>
      )}

      {/* Step 2: Medication */}
      {step === 2 && (
        <div className="bg-white rounded-xl p-5 shadow-sm space-y-4">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xl">💊</span>
            <span className="text-base font-bold text-dark">{t("health.wizard.needsMedication")}</span>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setAddMed(true)}
              className={`flex flex-col items-center gap-1 p-4 rounded-xl border-2 transition-all ${
                addMed ? "border-primary bg-primary/5" : "border-gray-200 hover:border-gray-300"
              }`}
            >
              <span className="text-2xl">💊</span>
              <span className="text-sm font-semibold text-dark">{t("health.wizard.yesMedication")}</span>
            </button>
            <button
              type="button"
              onClick={() => { setAddMed(false); setMedName(""); setMedDosage(""); setMedFrequency(""); setMedFrequencyHours(""); setMedEndDate(""); }}
              className={`flex flex-col items-center gap-1 p-4 rounded-xl border-2 transition-all ${
                !addMed ? "border-primary bg-primary/5" : "border-gray-200 hover:border-gray-300"
              }`}
            >
              <span className="text-2xl">🚫</span>
              <span className="text-sm font-semibold text-dark">{t("health.wizard.noMedication")}</span>
            </button>
          </div>

          {addMed && (
            <div className="space-y-3 pt-2">
              <input
                type="text"
                value={medName}
                onChange={(e) => setMedName(e.target.value)}
                placeholder={t("health.medicationName")}
                className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-dark focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
              />
              <input
                type="text"
                value={medDosage}
                onChange={(e) => setMedDosage(e.target.value)}
                placeholder={t("health.dosagePlaceholder")}
                className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-dark focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
              />
              <div>
                <label className="block text-xs font-medium text-muted mb-1">{t("health.frequencyLabel")}</label>
                <div className="flex flex-wrap gap-1.5">
                  {MEDICATION_FREQUENCIES.map((freq) => (
                    <button
                      key={freq.value}
                      type="button"
                      onClick={() => {
                        setMedFrequency(freq.value);
                        setMedFrequencyHours(freq.hours.toString());
                      }}
                      className={`px-3 py-1.5 text-xs rounded-full transition-all ${
                        medFrequency === freq.value
                          ? "bg-blue-500 text-white"
                          : "bg-gray-100 text-dark hover:bg-gray-200"
                      }`}
                    >
                      {freq.label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-muted mb-1">{t("health.endDate")}</label>
                <input
                  type="date"
                  value={medEndDate}
                  onChange={(e) => setMedEndDate(e.target.value)}
                  min={today}
                  className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-dark focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                />
                <p className="text-[10px] text-muted mt-1">{t("health.wizard.leaveEmptyContinuous")}</p>
              </div>
            </div>
          )}

          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={() => setStep(1)}
              className="px-6 py-3 rounded-xl font-semibold text-muted bg-gray-100 hover:bg-gray-200 transition-colors"
            >
              {t("health.wizard.back")}
            </button>
            <button
              type="button"
              onClick={() => setStep(3)}
              disabled={addMed && !medName.trim()}
              className="flex-1 py-3 rounded-xl font-bold text-white bg-primary hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {t("health.wizard.next")}
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Appointment */}
      {step === 3 && (
        <div className="bg-white rounded-xl p-5 shadow-sm space-y-4">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xl">📅</span>
            <span className="text-base font-bold text-dark">{t("health.wizard.needsAppointment")}</span>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setAddApt(true)}
              className={`flex flex-col items-center gap-1 p-4 rounded-xl border-2 transition-all ${
                addApt ? "border-primary bg-primary/5" : "border-gray-200 hover:border-gray-300"
              }`}
            >
              <span className="text-2xl">📅</span>
              <span className="text-sm font-semibold text-dark">{t("health.wizard.yesAppointment")}</span>
            </button>
            <button
              type="button"
              onClick={() => { setAddApt(false); setAptTitle(""); setAptDate(""); setAptTime(""); setAptLocation(""); }}
              className={`flex flex-col items-center gap-1 p-4 rounded-xl border-2 transition-all ${
                !addApt ? "border-primary bg-primary/5" : "border-gray-200 hover:border-gray-300"
              }`}
            >
              <span className="text-2xl">🚫</span>
              <span className="text-sm font-semibold text-dark">{t("health.wizard.noAppointment")}</span>
            </button>
          </div>

          {addApt && (
            <div className="space-y-3 pt-2">
              <input
                type="text"
                value={aptTitle}
                onChange={(e) => setAptTitle(e.target.value)}
                placeholder={t("health.wizard.appointmentTitlePlaceholder")}
                className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-dark focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
              />
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-medium text-muted mb-1">{t("health.appointmentForm.date")}</label>
                  <input
                    type="date"
                    value={aptDate}
                    onChange={(e) => setAptDate(e.target.value)}
                    min={today}
                    className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-dark focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted mb-1">{t("health.appointmentForm.time")}</label>
                  <input
                    type="time"
                    value={aptTime}
                    onChange={(e) => setAptTime(e.target.value)}
                    className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-dark focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                  />
                </div>
              </div>
              <input
                type="text"
                value={aptLocation}
                onChange={(e) => setAptLocation(e.target.value)}
                placeholder={t("health.appointmentForm.locationPlaceholder")}
                className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-dark focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
              />
            </div>
          )}

          {/* Summary */}
          <div className="bg-gray-50 rounded-xl p-3 space-y-1">
            <p className="text-xs font-semibold text-muted uppercase">{t("health.wizard.summary")}</p>
            <p className="text-sm text-dark">🤒 {title} ({t(`health.illnessForm.severity_${severity}`)})</p>
            {symptoms.length > 0 && (
              <p className="text-xs text-muted">{t("health.illnessForm.symptoms")}: {symptoms.join(", ")}</p>
            )}
            {addMed && medName && (
              <p className="text-sm text-dark">💊 {medName} {medDosage ? `(${medDosage})` : ""} {medFrequency ? `· ${medFrequency}` : ""}</p>
            )}
            {addApt && aptTitle && (
              <p className="text-sm text-dark">📅 {aptTitle} {aptDate ? `· ${aptDate}` : ""} {aptTime ? `${aptTime}` : ""}</p>
            )}
          </div>

          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={() => setStep(2)}
              className="px-6 py-3 rounded-xl font-semibold text-muted bg-gray-100 hover:bg-gray-200 transition-colors"
            >
              {t("health.wizard.back")}
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={isPending}
              className="flex-1 py-3 rounded-xl font-bold text-white bg-red-500 hover:bg-red-600 disabled:opacity-50 transition-colors"
            >
              {isPending ? t("health.wizard.saving") : t("health.wizard.register")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
