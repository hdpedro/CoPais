"use client";

import { useI18n } from "@/i18n/provider";

interface MedicalInfo {
  blood_type: string | null;
  insurance_name: string | null;
  insurance_number: string | null;
  sus_number: string | null;
  primary_pediatrician_id: string | null;
  medical_professionals: { name: string; specialty: string | null; crm: string | null; phone: string | null } | null;
}

interface Allergy {
  name: string;
  allergy_type: string | null;
  severity: string | null;
  reaction: string | null;
}

interface Medication {
  name: string;
  dosage: string | null;
  frequency: string | null;
  start_date: string | null;
  end_date: string | null;
  status: string;
  reason: string | null;
  prescribed_by: string | null;
}

interface Illness {
  title: string;
  symptoms: string[] | null;
  start_date: string | null;
  end_date: string | null;
  status: string;
  diagnosis: string | null;
  severity: string;
  hospital_visit: boolean;
  notes: string | null;
}

interface Appointment {
  title: string;
  appointment_date: string | null;
  appointment_type: string | null;
  location: string | null;
  status: string;
  summary: string | null;
  diagnosis: string | null;
  medical_professionals: { name: string } | null;
}

interface Vaccination {
  vaccine_name: string;
  dose_label: string | null;
  administered_date: string | null;
  batch_number: string | null;
  location: string | null;
}

interface GrowthRecord {
  measured_date: string | null;
  weight_kg: number | null;
  height_cm: number | null;
  head_cm: number | null;
}

interface Professional {
  name: string;
  specialty: string | null;
  crm: string | null;
  phone: string | null;
  whatsapp: string | null;
}

interface VaccineComparisonItem {
  vaccineName: string;
  dose: { label: string; ageLabel?: string };
}

interface HealthReportProps {
  child: { full_name: string; birth_date: string };
  ageLabel: string;
  generatedDate: string;
  generatedTime: string;
  medicalInfo: MedicalInfo | null;
  allergies: Allergy[] | null;
  medications: Medication[] | null;
  illnesses: Illness[] | null;
  appointments: Appointment[] | null;
  vaccinations: Vaccination[] | null;
  growthRecords: GrowthRecord[] | null;
  professionals: Professional[] | null;
  vaccineComparison: {
    overdue: VaccineComparisonItem[];
    upcoming: VaccineComparisonItem[];
  };
}

export default function HealthReportClient({
  child,
  ageLabel,
  generatedDate,
  generatedTime,
  medicalInfo,
  allergies,
  medications,
  illnesses,
  appointments,
  vaccinations,
  growthRecords,
  professionals,
  vaccineComparison,
}: HealthReportProps) {
  const { t } = useI18n();

  const pediatrician = (medicalInfo as any)?.medical_professionals;

  const severityLabel: Record<string, string> = {
    grave: t("health.export.severe"),
    moderado: t("health.export.moderate"),
    leve: t("health.export.mild"),
    severe: t("health.export.severe"),
    moderate: t("health.export.moderate"),
    mild: t("health.export.mild"),
  };

  const severityColor: Record<string, string> = {
    grave: "#dc2626",
    moderado: "#d97706",
    leve: "#16a34a",
    severe: "#dc2626",
    moderate: "#d97706",
    mild: "#16a34a",
  };

  const statusLabel: Record<string, string> = {
    active: t("health.export.statusActive"),
    resolved: t("health.export.statusResolved"),
    chronic: t("health.export.statusChronic"),
    scheduled: t("health.export.statusScheduled"),
    completed: t("health.export.statusCompleted"),
    cancelled: t("health.export.statusCancelled"),
    missed: t("health.export.statusMissed"),
  };

  const appointmentTypeLabel: Record<string, string> = {
    routine: t("health.export.typeRoutine"),
    specialist: t("health.export.typeSpecialist"),
    emergency: t("health.export.typeEmergency"),
    exam: t("health.export.typeExam"),
    vaccine: t("health.export.typeVaccine"),
    dental: t("health.export.typeDental"),
    therapy: t("health.export.typeTherapy"),
    other: t("health.export.typeOther"),
  };

  function formatDate(d: string | null) {
    if (!d) return "\u2014";
    return new Date(d + "T12:00:00").toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  }

  function formatDateTime(d: string | null) {
    if (!d) return "\u2014";
    return new Date(d).toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "America/Sao_Paulo",
    });
  }

  const notInformed = t("health.export.notInformed");

  return (
    <>
      <style
        dangerouslySetInnerHTML={{
          __html: `
            @media print {
              .no-print { display: none !important; }
              body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
            }
            @page {
              margin: 15mm 12mm;
              size: A4;
            }
          `,
        }}
      />

      {/* Print button bar */}
      <div className="no-print" style={{
        position: "sticky",
        top: 0,
        zIndex: 50,
        background: "#f8fafa",
        borderBottom: "1px solid #e5e7eb",
        padding: "12px 16px",
        display: "flex",
        alignItems: "center",
        gap: "12px",
      }}>
        <a
          href="/saude"
          style={{
            color: "#6b7280",
            textDecoration: "none",
            fontSize: "14px",
            display: "flex",
            alignItems: "center",
            gap: "4px",
          }}
        >
          {"\u2190"} {t("common.back")}
        </a>
        <div style={{ flex: 1 }} />
        <button
          id="print-btn"
          style={{
            background: "#5B9E85",
            color: "white",
            border: "none",
            borderRadius: "8px",
            padding: "8px 20px",
            fontSize: "14px",
            fontWeight: 600,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: "6px",
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="6 9 6 2 18 2 18 9" />
            <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
            <rect x="6" y="14" width="12" height="8" />
          </svg>
          {t("health.export.printSavePdf")}
        </button>
      </div>
      <script
        dangerouslySetInnerHTML={{
          __html: `document.getElementById("print-btn").addEventListener("click",function(){window.print()})`,
        }}
      />

      {/* Report content */}
      <div style={{
        maxWidth: "800px",
        margin: "0 auto",
        padding: "24px 16px 60px",
        fontFamily: "Georgia, 'Times New Roman', serif",
        color: "#1a1a1a",
        lineHeight: 1.6,
        fontSize: "13px",
      }}>

        {/* Header */}
        <div style={{ marginBottom: "32px" }}>
          <div style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: "16px",
            paddingBottom: "12px",
            borderBottom: "3px solid #5B9E85",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <div style={{
                width: "36px",
                height: "36px",
                borderRadius: "8px",
                background: "linear-gradient(135deg, #5B9E85 0%, #0d9490 100%)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "white",
                fontSize: "16px",
                fontWeight: 800,
                fontFamily: "Arial, sans-serif",
              }}>
                K
              </div>
              <div>
                <p style={{ fontSize: "15px", fontWeight: 700, color: "#2C2C2C", lineHeight: 1.2 }}>Kindar</p>
                <p style={{ fontSize: "10px", color: "#5B9E85", fontWeight: 600, letterSpacing: "0.5px", textTransform: "uppercase" }}>{t("health.export.tagline")}</p>
              </div>
            </div>
            <div style={{ textAlign: "right" }}>
              <p style={{ fontSize: "10px", color: "#9ca3af" }}>{t("health.export.generatedOn")}</p>
              <p style={{ fontSize: "11px", color: "#6b7280", fontWeight: 500 }}>{generatedDate} {t("health.export.at")} {generatedTime}</p>
            </div>
          </div>

          <div style={{ textAlign: "center" }}>
            <p style={{ fontSize: "11px", color: "#5B9E85", fontWeight: 700, textTransform: "uppercase", letterSpacing: "1.5px", marginBottom: "4px" }}>
              {t("health.export.healthReport")}
            </p>
            <h1 style={{ fontSize: "22px", fontWeight: 700, marginBottom: "4px", color: "#2C2C2C" }}>
              {child.full_name}
            </h1>
            <p style={{ fontSize: "13px", color: "#6b7280" }}>
              {t("health.export.birthDate")}: {formatDate(child.birth_date)} &middot; {t("health.export.age")}: {ageLabel}
            </p>
          </div>

          <div style={{ width: "60px", height: "3px", background: "#5B9E85", margin: "12px auto 0", borderRadius: "2px" }} />
        </div>

        {/* Medical Info */}
        <SectionTitle title={t("health.export.medicalInfo")} />
        <table style={tableStyle}>
          <tbody>
            <InfoRow label={t("health.export.bloodType")} value={medicalInfo?.blood_type || notInformed} />
            <InfoRow label={t("health.export.insurance")} value={medicalInfo?.insurance_name ? `${medicalInfo.insurance_name}${medicalInfo.insurance_number ? ` (${medicalInfo.insurance_number})` : ""}` : notInformed} />
            <InfoRow label={t("health.export.susCard")} value={medicalInfo?.sus_number || notInformed} />
            <InfoRow label={t("health.export.mainPediatrician")} value={pediatrician ? `${pediatrician.name}${pediatrician.specialty ? ` - ${pediatrician.specialty}` : ""}${pediatrician.crm ? ` (CRM: ${pediatrician.crm})` : ""}` : notInformed} />
          </tbody>
        </table>

        {/* Allergies */}
        <SectionTitle title={t("health.export.allergies")} />
        {(!allergies || allergies.length === 0) ? (
          <EmptySection text={t("health.export.noAllergies")} />
        ) : (
          <table style={tableStyle}>
            <thead>
              <tr>
                <Th>{t("health.export.allergy")}</Th>
                <Th>{t("health.export.typeCol")}</Th>
                <Th>{t("health.export.severityCol")}</Th>
                <Th>{t("health.export.reactionCol")}</Th>
              </tr>
            </thead>
            <tbody>
              {allergies.map((a, i) => (
                <tr key={i} style={i % 2 === 1 ? altRowStyle : {}}>
                  <Td>{a.name}</Td>
                  <Td>{a.allergy_type || "\u2014"}</Td>
                  <Td>
                    {a.severity ? (
                      <span style={{ color: severityColor[a.severity] || "#1a1a1a", fontWeight: 600 }}>
                        {severityLabel[a.severity] || a.severity}
                      </span>
                    ) : "\u2014"}
                  </Td>
                  <Td>{a.reaction || "\u2014"}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {/* Active Medications */}
        <SectionTitle title={t("health.export.activeMedications")} />
        {(!medications || medications.length === 0) ? (
          <EmptySection text={t("health.export.noMedications")} />
        ) : (
          <table style={tableStyle}>
            <thead>
              <tr>
                <Th>{t("health.export.medication")}</Th>
                <Th>{t("health.export.dosageCol")}</Th>
                <Th>{t("health.export.frequencyCol")}</Th>
                <Th>{t("health.export.startCol")}</Th>
                <Th>{t("health.export.endCol")}</Th>
                <Th>{t("health.export.reasonCol")}</Th>
              </tr>
            </thead>
            <tbody>
              {medications.map((m, i) => (
                <tr key={i} style={i % 2 === 1 ? altRowStyle : {}}>
                  <Td bold>{m.name}</Td>
                  <Td>{m.dosage || "\u2014"}</Td>
                  <Td>{m.frequency || "\u2014"}</Td>
                  <Td>{formatDate(m.start_date)}</Td>
                  <Td>{formatDate(m.end_date)}</Td>
                  <Td>{m.reason || "\u2014"}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {/* Illness History */}
        <SectionTitle title={t("health.export.illnessHistory")} />
        {(!illnesses || illnesses.length === 0) ? (
          <EmptySection text={t("health.export.noEpisodes")} />
        ) : (
          <div style={{ marginBottom: "24px" }}>
            {illnesses.map((ill, i) => (
              <div
                key={i}
                style={{
                  border: "1px solid #d1d5db",
                  borderLeft: `4px solid ${severityColor[ill.severity] || "#9ca3af"}`,
                  borderRadius: "4px",
                  padding: "10px 12px",
                  marginBottom: "8px",
                  fontSize: "12px",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
                  <span style={{ fontWeight: 700, fontSize: "13px" }}>{ill.title}</span>
                  <span style={{
                    fontSize: "11px",
                    padding: "1px 8px",
                    borderRadius: "9999px",
                    background: ill.status === "active" ? "#fef3c7" : ill.status === "resolved" ? "#d1fae5" : "#e5e7eb",
                    color: ill.status === "active" ? "#92400e" : ill.status === "resolved" ? "#065f46" : "#374151",
                  }}>
                    {statusLabel[ill.status] || ill.status}
                  </span>
                </div>
                <div style={{ color: "#6b7280" }}>
                  {formatDate(ill.start_date)}{ill.end_date ? ` \u2014 ${formatDate(ill.end_date)}` : ""}
                  {ill.severity ? <> &middot; <span style={{ color: severityColor[ill.severity], fontWeight: 600 }}>{severityLabel[ill.severity] || ill.severity}</span></> : ""}
                  {ill.hospital_visit ? ` \u00B7 ${t("health.export.hospitalVisit")}` : ""}
                </div>
                {ill.diagnosis && <div style={{ marginTop: "4px" }}><strong>{t("health.export.diagnosisLabel")}:</strong> {ill.diagnosis}</div>}
                {ill.symptoms && ill.symptoms.length > 0 && (
                  <div style={{ marginTop: "4px" }}><strong>{t("health.export.symptomsLabel")}:</strong> {ill.symptoms.join(", ")}</div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Appointments */}
        <div style={{ pageBreakBefore: "always" }} />
        <SectionTitle title={t("health.export.medicalAppointments")} />
        {(!appointments || appointments.length === 0) ? (
          <EmptySection text={t("health.export.noAppointments")} />
        ) : (
          <table style={tableStyle}>
            <thead>
              <tr>
                <Th>{t("health.export.dateCol")}</Th>
                <Th>{t("health.export.appointmentCol")}</Th>
                <Th>{t("health.export.typeCol")}</Th>
                <Th>{t("health.export.locationCol")}</Th>
                <Th>{t("health.export.statusCol")}</Th>
                <Th>{t("health.export.summaryCol")}</Th>
              </tr>
            </thead>
            <tbody>
              {appointments.map((a, i) => (
                <tr key={i} style={i % 2 === 1 ? altRowStyle : {}}>
                  <Td>{formatDateTime(a.appointment_date)}</Td>
                  <Td bold>{a.title}{(a as any).medical_professionals?.name ? ` (${(a as any).medical_professionals.name})` : ""}</Td>
                  <Td>{appointmentTypeLabel[(a.appointment_type as string)] || a.appointment_type || "\u2014"}</Td>
                  <Td>{a.location || "\u2014"}</Td>
                  <Td>{statusLabel[a.status] || a.status}</Td>
                  <Td style={{ maxWidth: "180px", fontSize: "11px" }}>{a.summary ? (a.summary.length > 100 ? a.summary.slice(0, 100) + "..." : a.summary) : "\u2014"}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {/* Vaccination */}
        <SectionTitle title={t("health.export.vaccination")} />
        {(!vaccinations || vaccinations.length === 0) && vaccineComparison.overdue.length === 0 ? (
          <EmptySection text={t("health.export.noVaccines")} />
        ) : (
          <>
            {vaccineComparison.overdue.length > 0 && (
              <div style={{
                background: "#fef2f2",
                border: "1px solid #fecaca",
                borderRadius: "4px",
                padding: "8px 12px",
                marginBottom: "12px",
                fontSize: "12px",
                color: "#991b1b",
              }}>
                <strong>{t("health.export.overdueVaccines", { count: String(vaccineComparison.overdue.length) })}:</strong>{" "}
                {vaccineComparison.overdue.map((v) => `${v.vaccineName} (${v.dose.label})`).join(", ")}
              </div>
            )}

            {vaccinations && vaccinations.length > 0 && (
              <table style={tableStyle}>
                <thead>
                  <tr>
                    <Th>{t("health.export.vaccineCol")}</Th>
                    <Th>{t("health.export.doseCol")}</Th>
                    <Th>{t("health.export.dateCol")}</Th>
                    <Th>{t("health.export.batchCol")}</Th>
                    <Th>{t("health.export.locationCol")}</Th>
                  </tr>
                </thead>
                <tbody>
                  {vaccinations.map((v, i) => (
                    <tr key={i} style={i % 2 === 1 ? altRowStyle : {}}>
                      <Td bold>{v.vaccine_name}</Td>
                      <Td>{v.dose_label || "\u2014"}</Td>
                      <Td>{formatDate(v.administered_date)}</Td>
                      <Td>{v.batch_number || "\u2014"}</Td>
                      <Td>{v.location || "\u2014"}</Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {vaccineComparison.upcoming.length > 0 && (
              <div style={{
                background: "#fffbeb",
                border: "1px solid #fde68a",
                borderRadius: "4px",
                padding: "8px 12px",
                marginBottom: "12px",
                marginTop: "8px",
                fontSize: "12px",
                color: "#92400e",
              }}>
                <strong>{t("health.export.upcomingVaccines")}:</strong>{" "}
                {vaccineComparison.upcoming.map((v) => `${v.vaccineName} (${v.dose.label} - ${v.dose.ageLabel})`).join(", ")}
              </div>
            )}
          </>
        )}

        {/* Growth */}
        <SectionTitle title={t("health.export.growthTitle")} />
        {(!growthRecords || growthRecords.length === 0) ? (
          <EmptySection text={t("health.export.noMeasurements")} />
        ) : (
          <table style={tableStyle}>
            <thead>
              <tr>
                <Th>{t("health.export.dateCol")}</Th>
                <Th>{t("health.export.weightCol")}</Th>
                <Th>{t("health.export.heightCol")}</Th>
                <Th>{t("health.export.headCol")}</Th>
              </tr>
            </thead>
            <tbody>
              {growthRecords.map((g, i) => (
                <tr key={i} style={i % 2 === 1 ? altRowStyle : {}}>
                  <Td>{formatDate(g.measured_date)}</Td>
                  <Td>{g.weight_kg != null ? g.weight_kg.toFixed(1) : "\u2014"}</Td>
                  <Td>{g.height_cm != null ? g.height_cm.toFixed(1) : "\u2014"}</Td>
                  <Td>{g.head_cm != null ? g.head_cm.toFixed(1) : "\u2014"}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {/* Health Professionals */}
        <SectionTitle title={t("health.export.healthProfessionals")} />
        {(!professionals || professionals.length === 0) ? (
          <EmptySection text={t("health.export.noProfessionals")} />
        ) : (
          <table style={tableStyle}>
            <thead>
              <tr>
                <Th>{t("health.export.nameCol")}</Th>
                <Th>{t("health.export.specialtyCol")}</Th>
                <Th>{t("health.export.crmCol")}</Th>
                <Th>{t("health.export.phoneCol")}</Th>
              </tr>
            </thead>
            <tbody>
              {professionals.map((p, i) => (
                <tr key={i} style={i % 2 === 1 ? altRowStyle : {}}>
                  <Td bold>{p.name}</Td>
                  <Td>{p.specialty || "\u2014"}</Td>
                  <Td>{p.crm || "\u2014"}</Td>
                  <Td>{p.phone || p.whatsapp || "\u2014"}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {/* Footer */}
        <div style={{
          marginTop: "40px",
          paddingTop: "16px",
          borderTop: "2px solid #5B9E85",
          textAlign: "center",
          fontSize: "11px",
          color: "#9ca3af",
        }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "6px", marginBottom: "4px" }}>
            <div style={{
              width: "18px",
              height: "18px",
              borderRadius: "4px",
              background: "#5B9E85",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              color: "white",
              fontSize: "8px",
              fontWeight: 800,
              fontFamily: "Arial, sans-serif",
            }}>
              K
            </div>
            <span style={{ color: "#5B9E85", fontWeight: 700 }}>Kindar</span>
            <span>{"\u2014"} {t("health.export.tagline")}</span>
          </div>
          <p>{t("health.export.generatedOn")} {generatedDate} {t("health.export.at")} {generatedTime}</p>
          <p style={{ marginTop: "4px", fontSize: "10px", fontStyle: "italic" }}>{t("health.export.disclaimer")}</p>
        </div>
      </div>
    </>
  );
}

// Reusable components

function SectionTitle({ title }: { title: string }) {
  return (
    <h2 style={{
      fontSize: "15px",
      fontWeight: 700,
      color: "#2C2C2C",
      marginTop: "28px",
      marginBottom: "10px",
      paddingBottom: "4px",
      borderBottom: "1px solid #d1d5db",
    }}>
      {title}
    </h2>
  );
}

function EmptySection({ text }: { text: string }) {
  return (
    <p style={{ color: "#9ca3af", fontSize: "12px", marginBottom: "16px", fontStyle: "italic" }}>
      {text}
    </p>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th style={{
      textAlign: "left",
      padding: "6px 8px",
      fontSize: "11px",
      fontWeight: 700,
      color: "#374151",
      background: "#f3f4f6",
      borderBottom: "2px solid #9ca3af",
      whiteSpace: "nowrap",
    }}>
      {children}
    </th>
  );
}

function Td({ children, bold, style }: { children: React.ReactNode; bold?: boolean; style?: React.CSSProperties }) {
  return (
    <td style={{
      padding: "5px 8px",
      fontSize: "12px",
      borderBottom: "1px solid #e5e7eb",
      fontWeight: bold ? 600 : 400,
      verticalAlign: "top",
      ...style,
    }}>
      {children}
    </td>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <tr>
      <td style={{ padding: "5px 8px", fontSize: "12px", fontWeight: 700, color: "#374151", borderBottom: "1px solid #e5e7eb", width: "160px" }}>
        {label}
      </td>
      <td style={{ padding: "5px 8px", fontSize: "12px", borderBottom: "1px solid #e5e7eb" }}>
        {value}
      </td>
    </tr>
  );
}

const tableStyle: React.CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  marginBottom: "20px",
  border: "1px solid #d1d5db",
};

const altRowStyle: React.CSSProperties = {
  background: "#f9fafb",
};
