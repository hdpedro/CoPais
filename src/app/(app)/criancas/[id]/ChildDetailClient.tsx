"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useI18n } from "@/i18n/provider";
import { updateChild } from "@/actions/group";
import { upsertChildEducation, uploadChildDocument, deleteChildDocument } from "@/actions/children";
import DocumentViewer from "@/app/(app)/documentos/DocumentViewer";

/* ───── Types ───── */

interface Child {
  id: string;
  full_name: string;
  birth_date: string;
  allergies: string[] | null;
  notes: string | null;
  cpf: string | null;
  rg: string | null;
}

interface MedicalInfo {
  id: string;
  blood_type: string | null;
  health_insurance: string | null;
  insurance_card_number: string | null;
  [key: string]: unknown;
}

interface GrowthRecord {
  id: string;
  weight_kg: number | null;
  height_cm: number | null;
  recorded_at: string;
}

interface Allergy {
  id: string;
  allergen: string;
  severity: string | null;
  notes: string | null;
}

interface Medication {
  id: string;
  name: string;
  dosage: string | null;
  frequency: string | null;
  status: string;
}

interface Vaccination {
  id: string;
  vaccine_name: string;
  applied_date: string | null;
}

interface DocumentRow {
  id: string;
  name: string;
  file_url: string;
  file_size: number | null;
  mime_type: string | null;
  category: string;
  created_at: string;
  profiles: { full_name: string } | null;
}

interface Education {
  id: string;
  school_name: string | null;
  school_address: string | null;
  school_phone: string | null;
  grade: string | null;
  class_name: string | null;
  teacher_name: string | null;
  coordinator_name: string | null;
  entry_time: string | null;
  exit_time: string | null;
  extracurricular_activities: string[] | null;
}

interface ChildDetailClientProps {
  child: Child;
  medicalInfo: MedicalInfo | null;
  latestGrowth: GrowthRecord | null;
  allergies: Allergy[];
  medications: Medication[];
  vaccinations: Vaccination[];
  documents: DocumentRow[];
  education: Education | null;
  groupId: string;
  isReadonly: boolean;
  tab: string;
}

/* ───── Helpers ───── */

function formatSize(bytes: number) {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}

const severityColors: Record<string, string> = {
  leve: "bg-yellow-100 text-yellow-700",
  moderada: "bg-orange-100 text-orange-700",
  grave: "bg-red-100 text-red-700",
  mild: "bg-yellow-100 text-yellow-700",
  moderate: "bg-orange-100 text-orange-700",
  severe: "bg-red-100 text-red-700",
};

const docTypeIcons: Record<string, string> = {
  rg: "\u{1F4C4}",
  cpf: "\u{1F4C4}",
  passaporte: "\u{1F6C2}",
  certidao: "\u{1F4DC}",
  vacinacao: "\u{1F489}",
  plano: "\u{1F3E5}",
  personal: "\u{1F4C4}",
  health: "\u{1F3E5}",
  education: "\u{1F393}",
  legal: "\u2696\uFE0F",
  other: "\u{1F4C1}",
};

/* ───── Component ───── */

export default function ChildDetailClient({
  child,
  medicalInfo,
  latestGrowth,
  allergies,
  medications,
  vaccinations,
  documents,
  education,
  groupId,
  isReadonly,
  tab,
}: ChildDetailClientProps) {
  const { t, locale } = useI18n();
  const [selectedDoc, setSelectedDoc] = useState<DocumentRow | null>(null);

  const dateLocale = locale === "pt" ? "pt-BR" : locale === "en" ? "en-US" : locale === "es" ? "es-ES" : locale === "fr" ? "fr-FR" : "de-DE";

  const age = useMemo(() => Math.floor(
    (new Date().getTime() - new Date(child.birth_date).getTime()) / (365.25 * 24 * 60 * 60 * 1000)
  ), [child.birth_date]);

  const tabs = [
    { key: "geral", label: t("childProfile.tabGeneral"), icon: "\u{1F464}" },
    { key: "saude", label: t("childProfile.tabHealth"), icon: "\u{1F3E5}" },
    { key: "documentos", label: t("childProfile.tabDocuments"), icon: "\u{1F4C4}" },
    { key: "educacao", label: t("childProfile.tabEducation"), icon: "\u{1F393}" },
  ];

  const docCategories = [
    { value: "personal", label: t("childProfile.docTypeRG") },
    { value: "personal", label: "CPF" },
    { value: "personal", label: t("childProfile.docTypePassport") },
    { value: "legal", label: t("childProfile.docTypeBirthCert") },
    { value: "health", label: t("childProfile.docTypeVaccineCard") },
    { value: "health", label: t("childProfile.docTypeInsuranceCard") },
    { value: "other", label: t("childProfile.docTypeOther") },
  ];

  return (
    <div className="max-w-lg mx-auto space-y-4 pb-20">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/criancas" className="text-muted hover:text-dark">
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </Link>
        <div className="flex items-center gap-3 flex-1">
          <div className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-lg" style={{ backgroundColor: "#D4735A" }}>
            {child.full_name.charAt(0).toUpperCase()}
          </div>
          <div>
            <h1 className="text-xl font-bold text-dark">{child.full_name}</h1>
            <p className="text-xs text-muted">
              {age} {age === 1 ? t("children.yearOld") : t("children.yearsOld")} - {child.birth_date.split("-").reverse().join("/")}
            </p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-xl p-1">
        {tabs.map((tb) => (
          <a
            key={tb.key}
            href={`/criancas/${child.id}?tab=${tb.key}`}
            className={`flex-1 text-center py-2 text-xs font-medium rounded-lg transition-colors ${
              tab === tb.key
                ? "bg-white text-dark shadow-sm"
                : "text-muted hover:text-dark"
            }`}
          >
            <span className="block text-base">{tb.icon}</span>
            {tb.label}
          </a>
        ))}
      </div>

      {/* Tab Content */}
      {tab === "geral" && (
        <TabGeral
          child={child}
          isReadonly={isReadonly}
          t={t}
        />
      )}

      {tab === "saude" && (
        <TabSaude
          child={child}
          medicalInfo={medicalInfo}
          latestGrowth={latestGrowth}
          allergies={allergies}
          medications={medications}
          vaccinations={vaccinations}
          t={t}
        />
      )}

      {tab === "documentos" && (
        <TabDocumentos
          child={child}
          documents={documents}
          groupId={groupId}
          isReadonly={isReadonly}
          docCategories={docCategories}
          selectedDoc={selectedDoc}
          setSelectedDoc={setSelectedDoc}
          dateLocale={dateLocale}
          t={t}
        />
      )}

      {tab === "educacao" && (
        <TabEducacao
          child={child}
          education={education}
          groupId={groupId}
          isReadonly={isReadonly}
          t={t}
        />
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   TAB 1 - GERAL
   ═══════════════════════════════════════════════════════ */

function TabGeral({
  child,
  isReadonly,
  t,
}: {
  child: Child;
  isReadonly: boolean;
  t: (key: string, vars?: Record<string, string | number>) => string;
}) {
  return (
    <div className="space-y-4">
      {/* Info Card */}
      <div className="bg-white rounded-xl p-5 shadow-sm space-y-4">
        {/* CPF / RG */}
        {(child.cpf || child.rg) && (
          <div className="grid grid-cols-2 gap-3">
            {child.cpf && (
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-xs text-muted font-medium">CPF</p>
                <p className="text-sm text-dark font-mono">{child.cpf}</p>
              </div>
            )}
            {child.rg && (
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-xs text-muted font-medium">RG</p>
                <p className="text-sm text-dark font-mono">{child.rg}</p>
              </div>
            )}
          </div>
        )}

        {/* Allergies */}
        {child.allergies && child.allergies.length > 0 && (
          <div>
            <p className="text-sm font-medium text-dark mb-1">{t("childDetail.allergies")}</p>
            <div className="flex flex-wrap gap-1">
              {child.allergies.map((a, i) => (
                <span key={i} className="text-xs bg-error/10 text-error px-2 py-1 rounded-full">{a}</span>
              ))}
            </div>
          </div>
        )}

        {/* Notes */}
        {child.notes && (
          <div>
            <p className="text-sm font-medium text-dark mb-1">{t("childDetail.observations")}</p>
            <p className="text-sm text-muted">{child.notes}</p>
          </div>
        )}
      </div>

      {/* Edit Form */}
      {!isReadonly && (
        <details className="bg-white rounded-xl shadow-sm">
          <summary className="p-4 font-semibold text-dark cursor-pointer">{t("childDetail.editInfo")}</summary>
          <form action={updateChild} className="p-4 pt-0 space-y-4">
            <input type="hidden" name="id" value={child.id} />
            <div>
              <label className="block text-sm font-medium text-dark mb-1">{t("children.fullName")}</label>
              <input type="text" name="fullName" defaultValue={child.full_name} required
                className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary" />
            </div>
            <div>
              <label className="block text-sm font-medium text-dark mb-1">{t("children.birthDate")}</label>
              <input type="date" name="birthDate" defaultValue={child.birth_date} required
                className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-dark mb-1">CPF</label>
                <input type="text" name="cpf" defaultValue={child.cpf || ""}
                  placeholder="000.000.000-00"
                  className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary" />
              </div>
              <div>
                <label className="block text-sm font-medium text-dark mb-1">RG</label>
                <input type="text" name="rg" defaultValue={child.rg || ""}
                  placeholder={t("childProfile.rgPlaceholder")}
                  className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary" />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-dark mb-1">{t("health.allergies")}</label>
              <input type="text" name="allergies" defaultValue={child.allergies?.join(", ")}
                placeholder={t("children.allergiesPlaceholder")}
                className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary" />
            </div>
            <div>
              <label className="block text-sm font-medium text-dark mb-1">{t("children.notes")}</label>
              <textarea name="notes" rows={3} defaultValue={child.notes || ""}
                placeholder={t("children.notesPlaceholder")}
                className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary" />
            </div>
            <button type="submit" className="w-full py-3 bg-primary text-white font-semibold rounded-lg hover:bg-primary-dark transition-colors">
              {t("childDetail.saveChanges")}
            </button>
          </form>
        </details>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   TAB 2 - SAUDE
   ═══════════════════════════════════════════════════════ */

function TabSaude({
  child,
  medicalInfo,
  latestGrowth,
  allergies,
  medications,
  vaccinations,
  t,
}: {
  child: Child;
  medicalInfo: MedicalInfo | null;
  latestGrowth: GrowthRecord | null;
  allergies: Allergy[];
  medications: Medication[];
  vaccinations: Vaccination[];
  t: (key: string, vars?: Record<string, string | number>) => string;
}) {
  return (
    <div className="space-y-3">
      {/* Growth */}
      <div className="bg-white rounded-xl p-4 shadow-sm">
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-semibold text-dark text-sm">{t("childProfile.latestGrowth")}</h3>
          <Link href={`/saude/crescimento?child=${child.id}`} className="text-xs text-primary font-medium">
            {t("childProfile.seeMore")} &rarr;
          </Link>
        </div>
        {latestGrowth ? (
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-gray-50 rounded-lg p-3 text-center">
              <p className="text-xs text-muted">{t("childProfile.weight")}</p>
              <p className="text-lg font-bold text-dark">
                {latestGrowth.weight_kg ? `${latestGrowth.weight_kg} kg` : "—"}
              </p>
            </div>
            <div className="bg-gray-50 rounded-lg p-3 text-center">
              <p className="text-xs text-muted">{t("childProfile.height")}</p>
              <p className="text-lg font-bold text-dark">
                {latestGrowth.height_cm ? `${latestGrowth.height_cm} cm` : "—"}
              </p>
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted">{t("childProfile.noGrowthData")}</p>
        )}
      </div>

      {/* Blood Type & Insurance */}
      <div className="bg-white rounded-xl p-4 shadow-sm">
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-semibold text-dark text-sm">{t("childProfile.medicalInfo")}</h3>
        </div>
        {medicalInfo ? (
          <div className="space-y-2">
            {medicalInfo.blood_type && (
              <div className="flex items-center gap-2">
                <span className="text-red-500 text-lg">{"\u{1FA78}"}</span>
                <div>
                  <p className="text-xs text-muted">{t("childProfile.bloodType")}</p>
                  <p className="text-sm font-semibold text-dark">{medicalInfo.blood_type}</p>
                </div>
              </div>
            )}
            {medicalInfo.health_insurance && (
              <div className="flex items-center gap-2">
                <span className="text-blue-500 text-lg">{"\u{1F3E5}"}</span>
                <div>
                  <p className="text-xs text-muted">{t("childProfile.healthInsurance")}</p>
                  <p className="text-sm font-semibold text-dark">
                    {medicalInfo.health_insurance}
                    {medicalInfo.insurance_card_number && (
                      <span className="text-muted font-normal"> - {medicalInfo.insurance_card_number}</span>
                    )}
                  </p>
                </div>
              </div>
            )}
            {!medicalInfo.blood_type && !medicalInfo.health_insurance && (
              <p className="text-sm text-muted">{t("childProfile.noMedicalInfo")}</p>
            )}
          </div>
        ) : (
          <p className="text-sm text-muted">{t("childProfile.noMedicalInfo")}</p>
        )}
      </div>

      {/* Allergies */}
      <div className="bg-white rounded-xl p-4 shadow-sm">
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-semibold text-dark text-sm">{t("childProfile.allergiesTitle")}</h3>
          <Link href={`/saude/alergias?child=${child.id}`} className="text-xs text-primary font-medium">
            {t("childProfile.seeMore")} &rarr;
          </Link>
        </div>
        {allergies.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {allergies.map((a) => (
              <span
                key={a.id}
                className={`text-xs px-2 py-1 rounded-full font-medium ${
                  severityColors[a.severity?.toLowerCase() || ""] || "bg-gray-100 text-gray-700"
                }`}
              >
                {a.allergen}
                {a.severity && <span className="opacity-70"> ({a.severity})</span>}
              </span>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted">{t("childProfile.noAllergies")}</p>
        )}
      </div>

      {/* Medications */}
      <div className="bg-white rounded-xl p-4 shadow-sm">
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-semibold text-dark text-sm">{t("childProfile.activeMedications")}</h3>
          <Link href={`/saude/medicamentos?child=${child.id}`} className="text-xs text-primary font-medium">
            {t("childProfile.seeMore")} &rarr;
          </Link>
        </div>
        {medications.length > 0 ? (
          <div className="space-y-2">
            {medications.map((m) => (
              <div key={m.id} className="flex items-center justify-between bg-gray-50 rounded-lg p-2">
                <div>
                  <p className="text-sm font-medium text-dark">{m.name}</p>
                  {m.dosage && <p className="text-xs text-muted">{m.dosage}</p>}
                </div>
                {m.frequency && (
                  <span className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full">{m.frequency}</span>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted">{t("childProfile.noMedications")}</p>
        )}
      </div>

      {/* Vaccinations */}
      <div className="bg-white rounded-xl p-4 shadow-sm">
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-semibold text-dark text-sm">{t("childProfile.vaccinesRegistered")}</h3>
          <Link href={`/saude/vacinas?child=${child.id}`} className="text-xs text-primary font-medium">
            {t("childProfile.seeMore")} &rarr;
          </Link>
        </div>
        {vaccinations.length > 0 ? (
          <div className="flex items-center gap-2">
            <span className="text-2xl">{"\u{1F489}"}</span>
            <p className="text-sm text-dark">
              <span className="font-bold">{vaccinations.length}</span> {t("childProfile.vaccinesCount")}
            </p>
          </div>
        ) : (
          <p className="text-sm text-muted">{t("childProfile.noVaccines")}</p>
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   TAB 3 - DOCUMENTOS
   ═══════════════════════════════════════════════════════ */

function TabDocumentos({
  child,
  documents,
  groupId,
  isReadonly,
  docCategories,
  selectedDoc,
  setSelectedDoc,
  dateLocale,
  t,
}: {
  child: Child;
  documents: DocumentRow[];
  groupId: string;
  isReadonly: boolean;
  docCategories: Array<{ value: string; label: string }>;
  selectedDoc: DocumentRow | null;
  setSelectedDoc: (doc: DocumentRow | null) => void;
  dateLocale: string;
  t: (key: string, vars?: Record<string, string | number>) => string;
}) {
  const [isPending, startTransition] = useTransition();
  const [submitted, setSubmitted] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isDisabled = isPending || submitted;

  return (
    <div className="space-y-4">
      {/* Upload form */}
      {!isReadonly && (
        <form ref={formRef} action={(formData) => {
          if (isDisabled) return;
          setSubmitted(true);
          startTransition(async () => {
            await uploadChildDocument(formData);
            setSubmitted(false);
            formRef.current?.reset();
            if (fileInputRef.current) fileInputRef.current.value = "";
          });
        }} className="bg-white rounded-xl p-4 shadow-sm space-y-3">
          <h3 className="font-semibold text-dark text-sm">{t("childProfile.uploadDocument")}</h3>
          <input type="hidden" name="groupId" value={groupId} />
          <input type="hidden" name="childId" value={child.id} />

          <input
            type="text"
            name="name"
            required
            disabled={isDisabled}
            placeholder={t("childProfile.documentName")}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 disabled:opacity-50 disabled:bg-gray-50"
          />

          <select
            name="category"
            required
            disabled={isDisabled}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 disabled:opacity-50 disabled:bg-gray-50"
          >
            {docCategories.map((cat, i) => (
              <option key={i} value={cat.value}>
                {cat.label}
              </option>
            ))}
          </select>

          <input
            ref={fileInputRef}
            type="file"
            name="file"
            required
            disabled={isDisabled}
            accept="image/*,.pdf,.doc,.docx"
            className="w-full text-sm text-muted file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-primary/10 file:text-primary hover:file:bg-primary/20 disabled:opacity-50"
          />

          <button
            type="submit"
            disabled={isDisabled}
            className="w-full py-2.5 bg-primary text-white font-semibold rounded-lg hover:bg-primary-dark transition-colors text-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {isDisabled ? (
              <>
                <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                {t("childProfile.sending")}
              </>
            ) : (
              t("childProfile.upload")
            )}
          </button>
        </form>
      )}

      {/* Document List */}
      {documents.length > 0 ? (
        <div className="space-y-2">
          {documents.map((doc) => (
            <div
              key={doc.id}
              className="bg-white rounded-xl p-4 shadow-sm hover:shadow-md transition-shadow"
            >
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setSelectedDoc(doc)}
                  className="flex items-center gap-3 flex-1 min-w-0 text-left"
                >
                  <span className="text-2xl">
                    {docTypeIcons[doc.category] || docTypeIcons.other}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-dark text-sm truncate">{doc.name}</p>
                    <p className="text-xs text-muted">
                      {doc.category}
                      {doc.file_size ? ` - ${formatSize(doc.file_size)}` : ""}
                    </p>
                    <p className="text-xs text-muted">
                      {(doc.profiles as { full_name?: string } | null)?.full_name} - {new Date(doc.created_at).toLocaleDateString(dateLocale)}
                    </p>
                  </div>
                  <svg className="w-5 h-5 text-primary flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                </button>
                {!isReadonly && (
                  <button
                    type="button"
                    onClick={async () => {
                      if (!confirm(t("childProfile.confirmDeleteDoc"))) return;
                      const result = await deleteChildDocument(doc.id, child.id);
                      if (result?.error) alert(result.error);
                    }}
                    className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors flex-shrink-0"
                    title={t("childProfile.deleteDocTitle")}
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="bg-white rounded-xl p-8 shadow-sm text-center">
          <p className="text-3xl mb-2">{"\u{1F4C2}"}</p>
          <p className="text-muted text-sm">{t("childProfile.noDocuments")}</p>
        </div>
      )}

      {/* Document Viewer Modal */}
      {selectedDoc && (
        <DocumentViewer
          doc={{
            id: selectedDoc.id,
            name: selectedDoc.name,
            file_url: selectedDoc.file_url,
            file_size: selectedDoc.file_size,
            mime_type: selectedDoc.mime_type,
            category: selectedDoc.category,
            created_at: selectedDoc.created_at,
            child_name: child.full_name,
            uploader_name: (selectedDoc.profiles as { full_name?: string } | null)?.full_name || undefined,
          }}
          onClose={() => setSelectedDoc(null)}
        />
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   TAB 4 - EDUCACAO
   ═══════════════════════════════════════════════════════ */

function TabEducacao({
  child,
  education,
  groupId,
  isReadonly,
  t,
}: {
  child: Child;
  education: Education | null;
  groupId: string;
  isReadonly: boolean;
  t: (key: string, vars?: Record<string, string | number>) => string;
}) {
  const hasData = education && (education.school_name || education.grade || education.teacher_name);

  return (
    <div className="space-y-4">
      {/* Display card */}
      {hasData ? (
        <div className="bg-white rounded-xl p-5 shadow-sm space-y-3">
          <h3 className="font-semibold text-dark">{t("childProfile.schoolInfo")}</h3>

          {education!.school_name && (
            <div>
              <p className="text-xs text-muted">{t("childProfile.schoolName")}</p>
              <p className="text-sm font-medium text-dark">{education!.school_name}</p>
            </div>
          )}

          {education!.school_address && (
            <div>
              <p className="text-xs text-muted">{t("childProfile.schoolAddress")}</p>
              <p className="text-sm text-dark">{education!.school_address}</p>
            </div>
          )}

          {education!.school_phone && (
            <div>
              <p className="text-xs text-muted">{t("childProfile.schoolPhone")}</p>
              <p className="text-sm text-dark">{education!.school_phone}</p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            {education!.grade && (
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-xs text-muted">{t("childProfile.grade")}</p>
                <p className="text-sm font-semibold text-dark">{education!.grade}</p>
              </div>
            )}
            {education!.class_name && (
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-xs text-muted">{t("childProfile.className")}</p>
                <p className="text-sm font-semibold text-dark">{education!.class_name}</p>
              </div>
            )}
          </div>

          {education!.teacher_name && (
            <div>
              <p className="text-xs text-muted">{t("childProfile.teacherName")}</p>
              <p className="text-sm text-dark">{education!.teacher_name}</p>
            </div>
          )}

          {education!.coordinator_name && (
            <div>
              <p className="text-xs text-muted">{t("childProfile.coordinatorName")}</p>
              <p className="text-sm text-dark">{education!.coordinator_name}</p>
            </div>
          )}

          {(education!.entry_time || education!.exit_time) && (
            <div className="grid grid-cols-2 gap-3">
              {education!.entry_time && (
                <div className="bg-gray-50 rounded-lg p-3">
                  <p className="text-xs text-muted">{t("childProfile.entryTime")}</p>
                  <p className="text-sm font-semibold text-dark">{education!.entry_time}</p>
                </div>
              )}
              {education!.exit_time && (
                <div className="bg-gray-50 rounded-lg p-3">
                  <p className="text-xs text-muted">{t("childProfile.exitTime")}</p>
                  <p className="text-sm font-semibold text-dark">{education!.exit_time}</p>
                </div>
              )}
            </div>
          )}

          {education!.extracurricular_activities && education!.extracurricular_activities.length > 0 && (
            <div>
              <p className="text-xs text-muted mb-1">{t("childProfile.extracurricular")}</p>
              <div className="flex flex-wrap gap-1">
                {education!.extracurricular_activities.map((act, i) => (
                  <span key={i} className="text-xs bg-purple-50 text-purple-700 px-2 py-1 rounded-full">
                    {act}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="bg-white rounded-xl p-8 shadow-sm text-center">
          <p className="text-3xl mb-2">{"\u{1F3EB}"}</p>
          <p className="text-muted text-sm">{t("childProfile.noEducationData")}</p>
          <p className="text-muted text-xs mt-1">{t("childProfile.addSchoolPrompt")}</p>
        </div>
      )}

      {/* Edit Form */}
      {!isReadonly && (
        <details className="bg-white rounded-xl shadow-sm" open={!hasData}>
          <summary className="p-4 font-semibold text-dark cursor-pointer text-sm">
            {hasData ? t("childProfile.editSchoolInfo") : t("childProfile.addSchoolInfo")}
          </summary>
          <form action={upsertChildEducation} className="p-4 pt-0 space-y-3">
            <input type="hidden" name="childId" value={child.id} />
            <input type="hidden" name="groupId" value={groupId} />

            <div>
              <label className="block text-sm font-medium text-dark mb-1">{t("childProfile.schoolName")}</label>
              <input type="text" name="school_name" defaultValue={education?.school_name || ""}
                placeholder={t("childProfile.schoolNamePlaceholder")}
                className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
            </div>

            <div>
              <label className="block text-sm font-medium text-dark mb-1">{t("childProfile.schoolAddress")}</label>
              <input type="text" name="school_address" defaultValue={education?.school_address || ""}
                placeholder={t("childProfile.schoolAddressPlaceholder")}
                className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
            </div>

            <div>
              <label className="block text-sm font-medium text-dark mb-1">{t("childProfile.schoolPhone")}</label>
              <input type="tel" name="school_phone" defaultValue={education?.school_phone || ""}
                placeholder="(00) 0000-0000"
                className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-dark mb-1">{t("childProfile.grade")}</label>
                <input type="text" name="grade" defaultValue={education?.grade || ""}
                  placeholder={t("childProfile.gradePlaceholder")}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
              </div>
              <div>
                <label className="block text-sm font-medium text-dark mb-1">{t("childProfile.className")}</label>
                <input type="text" name="class_name" defaultValue={education?.class_name || ""}
                  placeholder={t("childProfile.classNamePlaceholder")}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-dark mb-1">{t("childProfile.teacherName")}</label>
              <input type="text" name="teacher_name" defaultValue={education?.teacher_name || ""}
                placeholder={t("childProfile.teacherNamePlaceholder")}
                className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
            </div>

            <div>
              <label className="block text-sm font-medium text-dark mb-1">{t("childProfile.coordinatorName")}</label>
              <input type="text" name="coordinator_name" defaultValue={education?.coordinator_name || ""}
                placeholder={t("childProfile.coordinatorNamePlaceholder")}
                className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-dark mb-1">{t("childProfile.entryTime")}</label>
                <input type="time" name="entry_time" defaultValue={education?.entry_time || ""}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
              </div>
              <div>
                <label className="block text-sm font-medium text-dark mb-1">{t("childProfile.exitTime")}</label>
                <input type="time" name="exit_time" defaultValue={education?.exit_time || ""}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-dark mb-1">{t("childProfile.extracurricular")}</label>
              <input type="text" name="extracurricular_activities"
                defaultValue={education?.extracurricular_activities?.join(", ") || ""}
                placeholder={t("childProfile.extracurricularPlaceholder")}
                className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
            </div>

            <button type="submit" className="w-full py-3 bg-primary text-white font-semibold rounded-lg hover:bg-primary-dark transition-colors text-sm">
              {t("common.save")}
            </button>
          </form>
        </details>
      )}
    </div>
  );
}
