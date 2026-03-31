"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useI18n } from "@/i18n/provider";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Child {
  id: string;
  full_name: string;
  birth_date: string;
  sex: string | null;
}

interface Illness {
  title: string;
  symptoms: string[] | null;
  start_date: string | null;
  end_date: string | null;
  status: string;
  severity: string;
  hospital_visit: boolean;
  diagnosis: string | null;
  notes: string | null;
}

interface Medication {
  id: string;
  name: string;
  dosage: string | null;
  frequency: string | null;
  frequency_hours: number | null;
  start_date: string | null;
  end_date: string | null;
  status: string;
  reason: string | null;
  adherence: number | null;
}

interface Vaccine {
  vaccine_name: string;
  dose_label: string | null;
  administered_date: string | null;
}

interface GrowthRecord {
  measured_date: string | null;
  weight_kg: number | null;
  height_cm: number | null;
  head_cm: number | null;
}

interface Allergy {
  name: string;
  allergy_type: string | null;
  severity: string | null;
  reaction: string | null;
}

interface MedicalInfo {
  blood_type: string | null;
  insurance_name: string | null;
  insurance_number: string | null;
}

interface SymptomEntry {
  symptom_type: string;
  temperature: number | null;
  intensity: string | null;
  recorded_at: string;
  notes: string | null;
}

interface Appointment {
  title: string;
  appointment_date: string | null;
  appointment_type: string | null;
  status: string;
  diagnosis: string | null;
  summary: string | null;
}

interface Props {
  child: Child;
  childrenList: Child[];
  sinceDate: string;
  lastAppointmentTitle: string | null;
  illnesses: Illness[];
  medications: Medication[];
  vaccines: Vaccine[];
  growthRecords: GrowthRecord[];
  allergies: Allergy[];
  medicalInfo: MedicalInfo | null;
  symptoms: SymptomEntry[];
  pastAppointments: Appointment[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function calculateAge(birthDate: string): { years: number; months: number } {
  const birth = new Date(birthDate + "T12:00:00");
  const now = new Date();
  let years = now.getFullYear() - birth.getFullYear();
  let months = now.getMonth() - birth.getMonth();
  if (now.getDate() < birth.getDate()) months--;
  if (months < 0) {
    years--;
    months += 12;
  }
  return { years, months };
}

function formatDate(d: string | null): string {
  if (!d) return "\u2014";
  return new Date(d + "T12:00:00").toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}


// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function ResumoConsultaClient({
  child,
  childrenList,
  sinceDate,
  lastAppointmentTitle,
  illnesses,
  medications,
  vaccines,
  growthRecords,
  allergies,
  medicalInfo,
  symptoms,
  pastAppointments,
}: Props) {
  const { t } = useI18n();
  const router = useRouter();
  const [copied, setCopied] = useState(false);

  const age = useMemo(() => calculateAge(child.birth_date), [child.birth_date]);
  const ageLabel = age.years > 0
    ? `${age.years}${t("preSummary.yearsShort")} ${age.months}${t("preSummary.monthsShort")}`
    : `${age.months} ${t("preSummary.months")}`;

  const todayStr = new Date().toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });

  // Severity helpers
  const severityLabel = useMemo<Record<string, string>>(() => ({
    grave: t("preSummary.severe"),
    moderado: t("preSummary.moderate"),
    leve: t("preSummary.mild"),
    severe: t("preSummary.severe"),
    moderate: t("preSummary.moderate"),
    mild: t("preSummary.mild"),
  }), [t]);

  const severityBg: Record<string, string> = {
    grave: "bg-red-100 text-red-700 border-red-200",
    severe: "bg-red-100 text-red-700 border-red-200",
    moderado: "bg-amber-100 text-amber-700 border-amber-200",
    moderate: "bg-amber-100 text-amber-700 border-amber-200",
    leve: "bg-emerald-100 text-emerald-700 border-emerald-200",
    mild: "bg-emerald-100 text-emerald-700 border-emerald-200",
  };

  // Symptom summary
  const symptomCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    let maxTemp: number | null = null;
    for (const s of symptoms) {
      counts[s.symptom_type] = (counts[s.symptom_type] || 0) + 1;
      if (s.temperature && (maxTemp === null || s.temperature > maxTemp)) {
        maxTemp = s.temperature;
      }
    }
    return { counts, maxTemp };
  }, [symptoms]);

  const symptomTypeLabel = useMemo<Record<string, string>>(() => ({
    febre: t("preSummary.symptomFever"),
    vomito: t("preSummary.symptomVomit"),
    diarreia: t("preSummary.symptomDiarrhea"),
    tosse: t("preSummary.symptomCough"),
    dor: t("preSummary.symptomPain"),
    manchas: t("preSummary.symptomRash"),
    sem_apetite: t("preSummary.symptomNoAppetite"),
    outro: t("preSummary.symptomOther"),
  }), [t]);

  // Growth comparison
  const latestGrowth = growthRecords[0] || null;
  const previousGrowth = growthRecords.length > 1 ? growthRecords[1] : null;

  // Adherence color
  function adherenceColor(val: number | null) {
    if (val === null) return "bg-gray-200";
    if (val >= 80) return "bg-emerald-500";
    if (val >= 50) return "bg-amber-400";
    return "bg-red-500";
  }

  function adherenceTextColor(val: number | null) {
    if (val === null) return "text-gray-400";
    if (val >= 80) return "text-emerald-600";
    if (val >= 50) return "text-amber-600";
    return "text-red-600";
  }

  // ---------------------------------------------------------------------------
  // Copy to clipboard
  // ---------------------------------------------------------------------------
  const buildPlainText = useCallback(() => {
    const lines: string[] = [];
    const hr = "────────────────────────────────";

    lines.push("\uD83D\uDCCB RESUMO PARA CONSULTA");
    lines.push(
      `\uD83D\uDC76 ${child.full_name} \u2014 ${ageLabel}`
    );
    lines.push(
      `\uD83D\uDCC5 ${t("preSummary.period")}: ${formatDate(sinceDate)} a ${todayStr}`
    );
    if (lastAppointmentTitle) {
      lines.push(
        `${t("preSummary.lastAppointment")}: ${lastAppointmentTitle} ${t("preSummary.on")} ${formatDate(sinceDate)}`
      );
    }
    lines.push("");
    lines.push(hr);

    // Allergies
    lines.push(`\u26A0\uFE0F ${t("preSummary.allergiesTitle").toUpperCase()}`);
    if (allergies.length === 0) {
      lines.push(t("preSummary.noneRegistered"));
    } else {
      for (const a of allergies) {
        lines.push(
          `- ${a.name}${a.severity ? ` (${severityLabel[a.severity] || a.severity})` : ""}${a.reaction ? ` \u2014 ${a.reaction}` : ""}`
        );
      }
    }
    lines.push("");

    // Medical info
    lines.push(`\uD83E\uDE78 ${t("preSummary.medicalInfoTitle").toUpperCase()}`);
    lines.push(
      `${t("preSummary.bloodType")}: ${medicalInfo?.blood_type || t("preSummary.notInformed")}`
    );
    lines.push(
      `${t("preSummary.insurance")}: ${medicalInfo?.insurance_name ? `${medicalInfo.insurance_name}${medicalInfo.insurance_number ? ` (${medicalInfo.insurance_number})` : ""}` : t("preSummary.notInformed")}`
    );
    lines.push("");

    // Illness episodes
    if (illnesses.length > 0) {
      lines.push(hr);
      lines.push(
        `\uD83D\uDD34 ${t("preSummary.illnessTitle").toUpperCase()} (${illnesses.length})`
      );
      for (const ill of illnesses) {
        const dates = `${formatDate(ill.start_date)}${ill.end_date ? ` \u2014 ${formatDate(ill.end_date)}` : ""}`;
        lines.push(
          `- ${ill.title} (${severityLabel[ill.severity] || ill.severity}) \u2014 ${dates}${ill.hospital_visit ? ` \u26A0\uFE0F Hospital` : ""}`
        );
        if (ill.diagnosis) lines.push(`  ${t("preSummary.diagnosis")}: ${ill.diagnosis}`);
        if (ill.symptoms && ill.symptoms.length > 0)
          lines.push(`  ${t("preSummary.symptomsLabel")}: ${ill.symptoms.join(", ")}`);
      }
      lines.push("");
    }

    // Symptoms
    if (symptoms.length > 0) {
      lines.push(hr);
      lines.push(
        `\uD83D\uDCDD ${t("preSummary.symptomsTitle").toUpperCase()} (${symptoms.length})`
      );
      for (const [type, count] of Object.entries(symptomCounts.counts)) {
        lines.push(`- ${symptomTypeLabel[type] || type}: ${count}x`);
      }
      if (symptomCounts.maxTemp !== null) {
        lines.push(`  ${t("preSummary.maxTemp")}: ${symptomCounts.maxTemp}\u00B0C`);
      }
      lines.push("");
    }

    // Medications
    if (medications.length > 0) {
      lines.push(hr);
      lines.push(`\uD83D\uDC8A ${t("preSummary.medicationsTitle").toUpperCase()}`);
      for (const med of medications) {
        lines.push(
          `- ${med.name}${med.dosage ? ` ${med.dosage}` : ""} \u2014 ${med.frequency || ""}`
        );
        const dates = `${formatDate(med.start_date)}${med.end_date ? ` \u2014 ${formatDate(med.end_date)}` : ""}`;
        lines.push(
          `  ${t("preSummary.period")}: ${dates}${med.adherence !== null ? ` | ${t("preSummary.adherence")}: ${med.adherence}%` : ""}`
        );
        if (med.reason) lines.push(`  ${t("preSummary.reason")}: ${med.reason}`);
      }
      lines.push("");
    }

    // Vaccines
    if (vaccines.length > 0) {
      lines.push(hr);
      lines.push(
        `\uD83D\uDC89 ${t("preSummary.vaccinesTitle").toUpperCase()} (${vaccines.length})`
      );
      for (const v of vaccines) {
        lines.push(
          `- ${v.vaccine_name}${v.dose_label ? ` (${v.dose_label})` : ""} \u2014 ${formatDate(v.administered_date)}`
        );
      }
      lines.push("");
    }

    // Growth
    if (latestGrowth) {
      lines.push(hr);
      lines.push(`\uD83D\uDCCF ${t("preSummary.growthTitle").toUpperCase()}`);
      if (latestGrowth.weight_kg !== null)
        lines.push(`${t("preSummary.weight")}: ${latestGrowth.weight_kg.toFixed(1)} kg`);
      if (latestGrowth.height_cm !== null)
        lines.push(`${t("preSummary.height")}: ${latestGrowth.height_cm.toFixed(1)} cm`);
      if (latestGrowth.head_cm !== null)
        lines.push(`${t("preSummary.head")}: ${latestGrowth.head_cm.toFixed(1)} cm`);
      lines.push(`${t("preSummary.measuredOn")}: ${formatDate(latestGrowth.measured_date)}`);
      lines.push("");
    }

    // Past appointments
    if (pastAppointments.length > 0) {
      lines.push(hr);
      lines.push(
        `\uD83D\uDCC5 ${t("preSummary.appointmentsTitle").toUpperCase()} (${pastAppointments.length})`
      );
      for (const a of pastAppointments) {
        lines.push(
          `- ${a.title} \u2014 ${formatDate(a.appointment_date?.split("T")[0] || null)}`
        );
        if (a.diagnosis) lines.push(`  ${t("preSummary.diagnosis")}: ${a.diagnosis}`);
        if (a.summary) lines.push(`  ${a.summary}`);
      }
      lines.push("");
    }

    lines.push(hr);
    lines.push(`Kindar \u2014 ${todayStr}`);

    return lines.join("\n");
  }, [
    child,
    ageLabel,
    sinceDate,
    todayStr,
    lastAppointmentTitle,
    allergies,
    medicalInfo,
    illnesses,
    symptoms,
    symptomCounts,
    medications,
    vaccines,
    latestGrowth,
    pastAppointments,
    t,
    severityLabel,
    symptomTypeLabel,
  ]);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(buildPlainText());
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback
      const textarea = document.createElement("textarea");
      textarea.value = buildPlainText();
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [buildPlainText]);

  const handlePrint = useCallback(() => {
    window.print();
  }, []);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  return (
    <>
      {/* Print styles */}
      <style
        dangerouslySetInnerHTML={{
          __html: `
            @media print {
              .no-print { display: none !important; }
              .print-break { page-break-before: always; }
              body { -webkit-print-color-adjust: exact; print-color-adjust: exact; background: white !important; }
              .summary-container { box-shadow: none !important; max-width: 100% !important; padding: 0 !important; }
            }
            @page { margin: 15mm 12mm; size: A4; }
          `,
        }}
      />

      <div className="min-h-screen bg-[#FAF8F5] pb-24 print:bg-white">
        {/* Top bar */}
        <div className="no-print sticky top-0 z-30 bg-white/90 backdrop-blur border-b border-[#E8E0D4]">
          <div className="max-w-2xl mx-auto flex items-center gap-3 px-4 py-3">
            <Link
              href="/saude/consultas"
              className="flex items-center gap-1.5 text-sm text-muted hover:text-dark transition-colors"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M15 18l-6-6 6-6" />
              </svg>
              {t("common.back")}
            </Link>
            <div className="flex-1" />
            {childrenList.length > 1 && (
              <select
                className="no-print text-sm border border-[#E8E0D4] rounded-lg px-3 py-1.5 bg-white text-dark"
                value={child.id}
                onChange={(e) =>
                  router.push(`/saude/consultas/resumo?crianca=${e.target.value}`)
                }
              >
                {childrenList.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.full_name}
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>

        {/* Content */}
        <div className="summary-container max-w-2xl mx-auto px-4 pt-6">
          {/* Header */}
          <div className="text-center mb-6">
            <div className="inline-flex items-center gap-2 mb-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#5B9E85] to-[#0d9490] flex items-center justify-center text-white font-extrabold text-lg">
                K
              </div>
              <span className="text-xs font-semibold text-[#5B9E85] uppercase tracking-widest">
                Kindar
              </span>
            </div>
            <h1 className="text-xl font-bold text-dark mb-1">
              {t("preSummary.title")}
            </h1>
            <p className="text-2xl font-bold text-dark">
              {child.full_name}
            </p>
            <p className="text-sm text-muted mt-1">
              {ageLabel}{" "}
              {child.sex === "M"
                ? `\u2014 ${t("preSummary.male")}`
                : child.sex === "F"
                  ? `\u2014 ${t("preSummary.female")}`
                  : ""}
            </p>
          </div>

          {/* Period badge */}
          <div className="flex justify-center mb-8">
            <div className="inline-flex items-center gap-2 bg-[#5B9E85]/10 text-[#5B9E85] rounded-full px-4 py-2 text-sm font-medium">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                <line x1="16" y1="2" x2="16" y2="6" />
                <line x1="8" y1="2" x2="8" y2="6" />
                <line x1="3" y1="10" x2="21" y2="10" />
              </svg>
              {lastAppointmentTitle ? (
                <span>
                  {t("preSummary.since")} &ldquo;{lastAppointmentTitle}&rdquo;{" "}
                  {t("preSummary.on")} {formatDate(sinceDate)}
                </span>
              ) : (
                <span>{t("preSummary.sinceBirth")}</span>
              )}
            </div>
          </div>

          {/* ─── Section 1: Allergies & Medical Info ─── */}
          <SectionCard
            icon={
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#C07055" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                <line x1="12" y1="9" x2="12" y2="13" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
            }
            title={t("preSummary.allergiesTitle")}
            accentColor="border-l-[#C07055]"
          >
            {allergies.length === 0 ? (
              <p className="text-sm text-muted italic">
                {t("preSummary.noAllergies")}
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {allergies.map((a, i) => (
                  <div
                    key={i}
                    className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium ${severityBg[a.severity || ""] || "bg-gray-100 text-gray-600 border-gray-200"}`}
                  >
                    <span className="font-semibold">{a.name}</span>
                    {a.reaction && (
                      <span className="text-xs opacity-75">
                        \u2014 {a.reaction}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Medical info row */}
            <div className="mt-4 pt-4 border-t border-[#E8E0D4] grid grid-cols-2 gap-3">
              <div>
                <p className="text-xs text-muted font-medium uppercase tracking-wide">
                  {t("preSummary.bloodType")}
                </p>
                <p className="text-sm font-semibold text-dark mt-0.5">
                  {medicalInfo?.blood_type || t("preSummary.notInformed")}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted font-medium uppercase tracking-wide">
                  {t("preSummary.insurance")}
                </p>
                <p className="text-sm font-semibold text-dark mt-0.5">
                  {medicalInfo?.insurance_name
                    ? `${medicalInfo.insurance_name}${medicalInfo.insurance_number ? ` (${medicalInfo.insurance_number})` : ""}`
                    : t("preSummary.notInformed")}
                </p>
              </div>
            </div>
          </SectionCard>

          {/* ─── Section 2: Illness Episodes ─── */}
          {illnesses.length > 0 && (
            <SectionCard
              icon={
                <span className="text-lg">{"\uD83D\uDD34"}</span>
              }
              title={`${t("preSummary.illnessTitle")} (${illnesses.length})`}
              accentColor="border-l-red-400"
            >
              <div className="space-y-3">
                {illnesses.map((ill, i) => (
                  <div
                    key={i}
                    className="bg-white rounded-lg border border-[#E8E0D4] p-3"
                  >
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <h4 className="font-semibold text-dark text-sm">
                        {ill.title}
                      </h4>
                      <span
                        className={`shrink-0 text-xs font-medium px-2 py-0.5 rounded-full border ${severityBg[ill.severity] || "bg-gray-100 text-gray-600 border-gray-200"}`}
                      >
                        {severityLabel[ill.severity] || ill.severity}
                      </span>
                    </div>
                    <p className="text-xs text-muted">
                      {formatDate(ill.start_date)}
                      {ill.end_date
                        ? ` \u2014 ${formatDate(ill.end_date)}`
                        : ` \u2014 ${t("preSummary.ongoing")}`}
                      {ill.hospital_visit && (
                        <span className="ml-2 inline-flex items-center gap-1 text-red-600 font-medium">
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                            <line x1="12" y1="9" x2="12" y2="13" />
                            <line x1="12" y1="17" x2="12.01" y2="17" />
                          </svg>
                          Hospital
                        </span>
                      )}
                    </p>
                    {ill.diagnosis && (
                      <p className="text-xs text-dark mt-1.5">
                        <span className="font-medium text-muted">
                          {t("preSummary.diagnosis")}:
                        </span>{" "}
                        {ill.diagnosis}
                      </p>
                    )}
                    {ill.symptoms && ill.symptoms.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {ill.symptoms.map((s, si) => (
                          <span
                            key={si}
                            className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full"
                          >
                            {s}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </SectionCard>
          )}

          {/* ─── Section 3: Symptoms ─── */}
          {symptoms.length > 0 && (
            <SectionCard
              icon={
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#8B6914" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                  <line x1="16" y1="13" x2="8" y2="13" />
                  <line x1="16" y1="17" x2="8" y2="17" />
                </svg>
              }
              title={`${t("preSummary.symptomsTitle")} (${symptoms.length})`}
              accentColor="border-l-amber-400"
            >
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {Object.entries(symptomCounts.counts).map(([type, count]) => (
                  <div
                    key={type}
                    className="bg-white rounded-lg border border-[#E8E0D4] p-2.5 text-center"
                  >
                    <p className="text-lg font-bold text-dark">{count}x</p>
                    <p className="text-xs text-muted">
                      {symptomTypeLabel[type] || type}
                    </p>
                  </div>
                ))}
              </div>
              {symptomCounts.maxTemp !== null && (
                <div className="mt-3 flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm text-red-700">
                  <span>{"\uD83C\uDF21\uFE0F"}</span>
                  <span className="font-medium">
                    {t("preSummary.maxTemp")}: {symptomCounts.maxTemp}\u00B0C
                  </span>
                </div>
              )}
            </SectionCard>
          )}

          {/* ─── Section 4: Medications ─── */}
          {medications.length > 0 && (
            <SectionCard
              icon={
                <span className="text-lg">{"\uD83D\uDC8A"}</span>
              }
              title={t("preSummary.medicationsTitle")}
              accentColor="border-l-blue-400"
            >
              <div className="space-y-3">
                {medications.map((med, i) => (
                  <div
                    key={i}
                    className="bg-white rounded-lg border border-[#E8E0D4] p-3"
                  >
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <div>
                        <h4 className="font-semibold text-dark text-sm">
                          {med.name}
                        </h4>
                        {med.dosage && (
                          <p className="text-xs text-muted">{med.dosage}</p>
                        )}
                      </div>
                      <span
                        className={`shrink-0 text-xs font-medium px-2 py-0.5 rounded-full ${med.status === "active"
                          ? "bg-emerald-100 text-emerald-700"
                          : "bg-gray-100 text-gray-500"
                          }`}
                      >
                        {med.status === "active"
                          ? t("preSummary.active")
                          : t("preSummary.finished")}
                      </span>
                    </div>
                    <p className="text-xs text-muted mb-2">
                      {med.frequency && <>{med.frequency} &middot; </>}
                      {formatDate(med.start_date)}
                      {med.end_date ? ` \u2014 ${formatDate(med.end_date)}` : ""}
                    </p>
                    {med.reason && (
                      <p className="text-xs text-muted mb-2">
                        <span className="font-medium">{t("preSummary.reason")}:</span>{" "}
                        {med.reason}
                      </p>
                    )}
                    {med.adherence !== null && (
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs text-muted font-medium">
                            {t("preSummary.adherence")}
                          </span>
                          <span
                            className={`text-xs font-bold ${adherenceTextColor(med.adherence)}`}
                          >
                            {med.adherence}%
                          </span>
                        </div>
                        <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
                          <div
                            className={`h-2 rounded-full transition-all ${adherenceColor(med.adherence)}`}
                            style={{ width: `${med.adherence}%` }}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </SectionCard>
          )}

          {/* ─── Section 5: Vaccines ─── */}
          {vaccines.length > 0 && (
            <SectionCard
              icon={
                <span className="text-lg">{"\uD83D\uDC89"}</span>
              }
              title={`${t("preSummary.vaccinesTitle")} (${vaccines.length})`}
              accentColor="border-l-purple-400"
            >
              <div className="space-y-2">
                {vaccines.map((v, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between bg-white rounded-lg border border-[#E8E0D4] px-3 py-2.5"
                  >
                    <div>
                      <p className="text-sm font-semibold text-dark">
                        {v.vaccine_name}
                      </p>
                      {v.dose_label && (
                        <p className="text-xs text-muted">{v.dose_label}</p>
                      )}
                    </div>
                    <p className="text-xs text-muted font-medium">
                      {formatDate(v.administered_date)}
                    </p>
                  </div>
                ))}
              </div>
            </SectionCard>
          )}

          {/* ─── Section 6: Growth ─── */}
          {latestGrowth && (
            <SectionCard
              icon={
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#5B9E85" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="12" y1="20" x2="12" y2="4" />
                  <polyline points="6 10 12 4 18 10" />
                </svg>
              }
              title={t("preSummary.growthTitle")}
              accentColor="border-l-[#5B9E85]"
            >
              <div className="grid grid-cols-3 gap-3 mb-3">
                <GrowthMetric
                  label={t("preSummary.weight")}
                  value={
                    latestGrowth.weight_kg !== null
                      ? `${latestGrowth.weight_kg.toFixed(1)} kg`
                      : "\u2014"
                  }
                  delta={
                    previousGrowth?.weight_kg !== null &&
                    latestGrowth.weight_kg !== null &&
                    previousGrowth?.weight_kg !== undefined
                      ? `${(latestGrowth.weight_kg - previousGrowth.weight_kg) >= 0 ? "+" : ""}${(latestGrowth.weight_kg - previousGrowth.weight_kg).toFixed(1)}`
                      : null
                  }
                />
                <GrowthMetric
                  label={t("preSummary.height")}
                  value={
                    latestGrowth.height_cm !== null
                      ? `${latestGrowth.height_cm.toFixed(1)} cm`
                      : "\u2014"
                  }
                  delta={
                    previousGrowth?.height_cm !== null &&
                    latestGrowth.height_cm !== null &&
                    previousGrowth?.height_cm !== undefined
                      ? `${(latestGrowth.height_cm - previousGrowth.height_cm) >= 0 ? "+" : ""}${(latestGrowth.height_cm - previousGrowth.height_cm).toFixed(1)}`
                      : null
                  }
                />
                <GrowthMetric
                  label={t("preSummary.head")}
                  value={
                    latestGrowth.head_cm !== null
                      ? `${latestGrowth.head_cm.toFixed(1)} cm`
                      : "\u2014"
                  }
                  delta={
                    previousGrowth?.head_cm !== null &&
                    latestGrowth.head_cm !== null &&
                    previousGrowth?.head_cm !== undefined
                      ? `${(latestGrowth.head_cm - previousGrowth.head_cm) >= 0 ? "+" : ""}${(latestGrowth.head_cm - previousGrowth.head_cm).toFixed(1)}`
                      : null
                  }
                />
              </div>
              <p className="text-xs text-muted text-center">
                {t("preSummary.measuredOn")} {formatDate(latestGrowth.measured_date)}
                {previousGrowth && (
                  <span>
                    {" "}&middot; {t("preSummary.previousMeasurement")}{" "}
                    {formatDate(previousGrowth.measured_date)}
                  </span>
                )}
              </p>
            </SectionCard>
          )}

          {/* ─── Section 7: Past Appointments ─── */}
          {pastAppointments.length > 0 && (
            <SectionCard
              icon={
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                  <line x1="16" y1="2" x2="16" y2="6" />
                  <line x1="8" y1="2" x2="8" y2="6" />
                  <line x1="3" y1="10" x2="21" y2="10" />
                </svg>
              }
              title={`${t("preSummary.appointmentsTitle")} (${pastAppointments.length})`}
              accentColor="border-l-indigo-400"
            >
              <div className="space-y-2">
                {pastAppointments.map((a, i) => (
                  <div
                    key={i}
                    className="bg-white rounded-lg border border-[#E8E0D4] p-3"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <h4 className="font-semibold text-dark text-sm">
                        {a.title}
                      </h4>
                      <span className="text-xs text-muted font-medium shrink-0">
                        {formatDate(a.appointment_date?.split("T")[0] || null)}
                      </span>
                    </div>
                    {a.diagnosis && (
                      <p className="text-xs text-dark mt-1">
                        <span className="font-medium text-muted">
                          {t("preSummary.diagnosis")}:
                        </span>{" "}
                        {a.diagnosis}
                      </p>
                    )}
                    {a.summary && (
                      <p className="text-xs text-muted mt-1">{a.summary}</p>
                    )}
                  </div>
                ))}
              </div>
            </SectionCard>
          )}

          {/* ─── Empty state ─── */}
          {illnesses.length === 0 &&
            symptoms.length === 0 &&
            medications.length === 0 &&
            vaccines.length === 0 &&
            !latestGrowth &&
            pastAppointments.length === 0 && (
              <div className="text-center py-12 px-4">
                <p className="text-4xl mb-3">{"\u2728"}</p>
                <p className="text-sm text-muted">
                  {t("preSummary.noDataInPeriod")}
                </p>
              </div>
            )}

          {/* ─── Footer for print ─── */}
          <div className="hidden print:block mt-10 pt-4 border-t-2 border-[#5B9E85] text-center text-xs text-gray-400">
            <p className="font-semibold text-[#5B9E85]">
              Kindar \u2014 {t("preSummary.tagline")}
            </p>
            <p>{todayStr}</p>
          </div>

          {/* ─── Bottom action buttons ─── */}
          <div className="no-print fixed bottom-0 inset-x-0 bg-white/95 backdrop-blur border-t border-[#E8E0D4] py-3 px-4 z-30">
            <div className="max-w-2xl mx-auto flex gap-3">
              <button
                onClick={handleCopy}
                className="flex-1 flex items-center justify-center gap-2 rounded-xl border-2 border-[#5B9E85] text-[#5B9E85] font-semibold py-3 text-sm hover:bg-[#5B9E85]/5 transition-colors"
              >
                {copied ? (
                  <>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                    {t("preSummary.copied")}
                  </>
                ) : (
                  <>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                      <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
                    </svg>
                    {t("preSummary.copySummary")}
                  </>
                )}
              </button>
              <button
                onClick={handlePrint}
                className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-[#5B9E85] text-white font-semibold py-3 text-sm hover:bg-[#4e8a74] transition-colors"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="6 9 6 2 18 2 18 9" />
                  <path d="M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2" />
                  <rect x="6" y="14" width="12" height="8" />
                </svg>
                {t("preSummary.print")}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function SectionCard({
  icon,
  title,
  accentColor,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  accentColor: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`bg-[#FEFDFB] rounded-xl shadow-sm border border-[#E8E0D4] border-l-4 ${accentColor} mb-4 overflow-hidden`}
    >
      <div className="flex items-center gap-2.5 px-4 pt-4 pb-2">
        {icon}
        <h3 className="text-sm font-bold text-dark">{title}</h3>
      </div>
      <div className="px-4 pb-4">{children}</div>
    </div>
  );
}

function GrowthMetric({
  label,
  value,
  delta,
}: {
  label: string;
  value: string;
  delta: string | null;
}) {
  return (
    <div className="bg-white rounded-lg border border-[#E8E0D4] p-3 text-center">
      <p className="text-xs text-muted font-medium uppercase tracking-wide mb-1">
        {label}
      </p>
      <p className="text-lg font-bold text-dark">{value}</p>
      {delta && (
        <p
          className={`text-xs font-medium mt-0.5 ${delta.startsWith("+") || delta.startsWith("-")
            ? delta.startsWith("+")
              ? "text-emerald-600"
              : "text-red-500"
            : "text-gray-400"
            }`}
        >
          {delta}
        </p>
      )}
    </div>
  );
}
