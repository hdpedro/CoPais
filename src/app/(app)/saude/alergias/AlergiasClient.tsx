"use client";

import { useState } from "react";
import Link from "next/link";
import { useI18n } from "@/i18n/provider";
import { ALLERGY_TYPES, ALLERGY_SEVERITIES, BLOOD_TYPES } from "@/lib/health-constants";
import { updateAllergy, deleteAllergy, upsertMedicalInfo } from "@/actions/health";

interface Allergy {
  id: string;
  name: string;
  allergy_type: string;
  severity: string;
  reaction: string | null;
}

interface MedicalInfo {
  blood_type: string | null;
  insurance_name: string | null;
  insurance_number: string | null;
  sus_number: string | null;
}

interface Pediatrician {
  name: string;
  specialty: string | null;
  crm: string | null;
  phone: string | null;
  whatsapp: string | null;
  address: string | null;
}

interface Child {
  id: string;
  full_name: string;
  birth_date: string;
}

interface Props {
  childrenList: Child[];
  selectedChildId: string;
  groupId: string;
  allergies: Allergy[] | null;
  info: MedicalInfo | null;
  pediatrician: Pediatrician | null;
  isReadonly: boolean;
  success?: string;
  error?: string;
}

export default function AlergiasClient({
  childrenList,
  selectedChildId,
  groupId,
  allergies,
  info,
  pediatrician,
  isReadonly,
  success,
  error: errorMsg,
}: Props) {
  const { t } = useI18n();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [editingMedicalInfo, setEditingMedicalInfo] = useState(false);

  const severityConfig: Record<string, { bg: string; text: string; labelKey: string }> = {
    severe: { bg: "bg-red-100", text: "text-red-700", labelKey: "health.severityGrave" },
    moderate: { bg: "bg-amber-100", text: "text-amber-700", labelKey: "health.severityModerate" },
    mild: { bg: "bg-yellow-100", text: "text-yellow-700", labelKey: "health.severityMild" },
  };

  function getAllergyIcon(type: string) {
    const found = ALLERGY_TYPES.find((t) => t.value === type);
    return found?.icon || "📝";
  }

  function getAllergyTypeLabel(type: string) {
    const found = ALLERGY_TYPES.find((t) => t.value === type);
    return found?.label || type;
  }

  if (!childrenList || childrenList.length === 0) {
    return (
      <div className="max-w-lg mx-auto pb-20">
        <div className="flex items-center gap-3 mb-6">
          <Link href="/saude" className="text-muted hover:text-dark">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </Link>
          <h1 className="text-2xl font-bold text-dark">{t("health.allergiesAndMedicalInfo")}</h1>
        </div>
        <div className="bg-white rounded-xl p-8 shadow-sm text-center">
          <p className="text-4xl mb-3" aria-hidden="true">⚠️</p>
          <p className="text-muted text-sm mb-1">{t("health.noChildRegistered")}</p>
          <p className="text-muted text-xs">{t("health.addChildToRegisterAllergies")}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto pb-20">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Link href="/saude" className="text-muted hover:text-dark" aria-label={t("health.backToHealth")}>
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-dark">{t("health.allergiesAndMedicalInfo")}</h1>
          <p className="text-sm text-muted">{t("health.importantMedicalInfo")}</p>
        </div>
      </div>

      {/* Alerts */}
      {success && (
        <div className="bg-green-50 border border-green-200 text-green-700 rounded-lg p-3 mb-4 text-sm">
          {decodeURIComponent(success)}
        </div>
      )}
      {errorMsg && (
        <div className="bg-red-50 border border-error/20 text-error rounded-lg p-3 mb-4 text-sm">
          {decodeURIComponent(errorMsg)}
        </div>
      )}

      {/* Child Selector */}
      {childrenList.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-1 mb-6 scrollbar-hide">
          {childrenList.map((child) => {
            const isActive = child.id === selectedChildId;
            return (
              <Link
                key={child.id}
                href={`/saude/alergias?crianca=${child.id}`}
                className={`flex-shrink-0 px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-primary text-white border-2 border-primary"
                    : "bg-white text-dark border-2 border-gray-200 hover:border-primary/40"
                }`}
              >
                {child.full_name.split(" ")[0]}
              </Link>
            );
          })}
        </div>
      )}

      {/* Alergias Section */}
      <section className="mb-6">
        <div className="flex items-center justify-between mb-3 px-1">
          <h2 className="text-sm font-semibold text-dark">{t("health.allergies")}</h2>
          {!isReadonly && (
            <Link
              href="/saude/alergias/nova"
              className="text-xs font-semibold text-primary hover:text-primary/80"
            >
              {t("health.add")}
            </Link>
          )}
        </div>

        {allergies && allergies.length > 0 ? (
          <div
            className={`bg-white rounded-xl p-4 shadow-sm space-y-3 ${
              allergies.length > 0 ? "border-l-4 border-red-400" : ""
            }`}
          >
            {allergies.map((allergy) => {
              const sev = severityConfig[allergy.severity] || severityConfig.mild;
              const isEditing = editingId === allergy.id;
              const isDeleting = deletingId === allergy.id;

              if (isEditing && !isReadonly) {
                return (
                  <form key={allergy.id} action={updateAllergy} className="border border-primary/20 rounded-lg p-3 space-y-3 bg-primary/5">
                    <input type="hidden" name="allergyId" value={allergy.id} />

                    {/* Allergy Name */}
                    <div>
                      <label className="block text-xs font-semibold text-dark mb-1">
                        {t("health.allergyName")} *
                      </label>
                      <input
                        type="text"
                        name="allergyName"
                        required
                        defaultValue={allergy.name}
                        className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm text-dark focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                      />
                    </div>

                    {/* Type */}
                    <div>
                      <label className="block text-xs font-semibold text-dark mb-1">
                        {t("health.type")} *
                      </label>
                      <select
                        name="allergyType"
                        required
                        defaultValue={allergy.allergy_type}
                        className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm text-dark focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                      >
                        <option value="">{t("health.select")}</option>
                        {ALLERGY_TYPES.map((type) => (
                          <option key={type.value} value={type.value}>
                            {type.icon} {type.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Severity */}
                    <div>
                      <label className="block text-xs font-semibold text-dark mb-1">
                        {t("health.severity")} *
                      </label>
                      <select
                        name="severity"
                        required
                        defaultValue={allergy.severity}
                        className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm text-dark focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                      >
                        <option value="">{t("health.select")}</option>
                        {ALLERGY_SEVERITIES.map((sev) => (
                          <option key={sev.value} value={sev.value}>
                            {sev.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Reaction */}
                    <div>
                      <label className="block text-xs font-semibold text-dark mb-1">
                        {t("health.reactionDescription")}{" "}
                        <span className="font-normal text-muted">({t("common.optional")})</span>
                      </label>
                      <textarea
                        name="reaction"
                        rows={2}
                        defaultValue={allergy.reaction || ""}
                        placeholder={t("health.reactionPlaceholder")}
                        className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm text-dark placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary resize-none"
                      />
                    </div>

                    {/* Actions */}
                    <div className="flex gap-2 justify-end">
                      <button
                        type="button"
                        onClick={() => setEditingId(null)}
                        className="px-3 py-1.5 text-xs font-medium text-muted bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                      >
                        {t("common.cancel")}
                      </button>
                      <button
                        type="submit"
                        className="px-3 py-1.5 text-xs font-medium text-white bg-primary rounded-lg hover:bg-primary/90 transition-colors"
                      >
                        {t("common.save")}
                      </button>
                    </div>
                  </form>
                );
              }

              return (
                <div key={allergy.id} className="relative">
                  {/* Delete confirmation overlay */}
                  {isDeleting && !isReadonly && (
                    <div className="absolute inset-0 bg-white/95 rounded-lg z-10 flex flex-col items-center justify-center gap-3 p-4">
                      <p className="text-sm text-dark text-center font-medium">
                        {t("health.deleteAllergyConfirm")}
                      </p>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => setDeletingId(null)}
                          className="px-3 py-1.5 text-xs font-medium text-muted bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                        >
                          {t("common.cancel")}
                        </button>
                        <form action={deleteAllergy}>
                          <input type="hidden" name="allergyId" value={allergy.id} />
                          <button
                            type="submit"
                            className="px-3 py-1.5 text-xs font-medium text-white bg-red-500 rounded-lg hover:bg-red-600 transition-colors"
                          >
                            {t("common.delete")}
                          </button>
                        </form>
                      </div>
                    </div>
                  )}

                  <div className="flex items-start gap-3">
                    <span className="text-xl mt-0.5">
                      {getAllergyIcon(allergy.allergy_type)}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-semibold text-dark">
                          {allergy.name}
                        </h3>
                        <span
                          className={`${sev.bg} ${sev.text} text-[10px] font-semibold px-2 py-0.5 rounded-full`}
                        >
                          {t(sev.labelKey)}
                        </span>
                      </div>
                      <p className="text-xs text-muted">
                        {getAllergyTypeLabel(allergy.allergy_type)}
                      </p>
                      {allergy.reaction && (
                        <p className="text-xs text-red-600 mt-1">
                          {t("health.reaction")}: {allergy.reaction}
                        </p>
                      )}
                    </div>

                    {/* Edit / Delete buttons */}
                    {!isReadonly && (
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <button
                          type="button"
                          onClick={() => {
                            setEditingId(allergy.id);
                            setDeletingId(null);
                          }}
                          className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                          title={t("health.editAllergy")}
                          aria-label={t("health.editAllergy")}
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                          </svg>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setDeletingId(allergy.id);
                            setEditingId(null);
                          }}
                          className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                          title={t("health.deleteAllergy")}
                          aria-label={t("health.deleteAllergy")}
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="bg-white rounded-xl p-8 shadow-sm text-center">
            <p className="text-4xl mb-3" aria-hidden="true">✅</p>
            <p className="text-muted text-sm mb-1">{t("health.noAllergiesRegistered")}</p>
            <p className="text-muted text-xs">{t("health.registerAllergiesToKeepHistory")}</p>
          </div>
        )}
      </section>

      {/* Info Medica Section */}
      <section id="medical-info-form" className="mb-6 scroll-mt-4 rounded-xl transition-all">
        <div className="flex items-center justify-between mb-3 px-1">
          <h2 className="text-sm font-semibold text-dark">{t("health.medicalInfo")}</h2>
          {!isReadonly && !editingMedicalInfo && (
            <button
              type="button"
              onClick={() => setEditingMedicalInfo(true)}
              className="text-xs font-semibold text-primary hover:text-primary/80"
            >
              {t("common.edit")}
            </button>
          )}
        </div>

        {editingMedicalInfo && !isReadonly ? (
          <form action={upsertMedicalInfo} className="bg-white rounded-xl p-4 shadow-sm space-y-4 border border-primary/20">
            <input type="hidden" name="childId" value={selectedChildId} />
            <input type="hidden" name="groupId" value={groupId} />

            <div>
              <label className="block text-xs font-semibold text-dark mb-1">
                {t("health.bloodType")}
              </label>
              <select
                name="bloodType"
                defaultValue={info?.blood_type || ""}
                className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm text-dark focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
              >
                <option value="">{t("health.select")}</option>
                {BLOOD_TYPES.map((bt) => (
                  <option key={bt} value={bt}>{bt}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-dark mb-1">
                {t("health.insurance")}
              </label>
              <input
                type="text"
                name="insuranceName"
                defaultValue={info?.insurance_name || ""}
                placeholder={t("health.insurance")}
                className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm text-dark placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-dark mb-1">
                {t("health.insuranceNumber")}
              </label>
              <input
                type="text"
                name="insuranceNumber"
                defaultValue={info?.insurance_number || ""}
                placeholder={t("health.insuranceNumber")}
                className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm text-dark placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-dark mb-1">
                {t("health.susNumber")}
              </label>
              <input
                type="text"
                name="susNumber"
                defaultValue={info?.sus_number || ""}
                placeholder={t("health.susNumber")}
                className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm text-dark placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
              />
            </div>

            <div className="flex gap-2 justify-end">
              <button
                type="button"
                onClick={() => setEditingMedicalInfo(false)}
                className="px-3 py-1.5 text-xs font-medium text-muted bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
              >
                {t("common.cancel")}
              </button>
              <button
                type="submit"
                className="px-3 py-1.5 text-xs font-medium text-white bg-primary rounded-lg hover:bg-primary/90 transition-colors"
              >
                {t("common.save")}
              </button>
            </div>
          </form>
        ) : (
          <div className="bg-white rounded-xl p-4 shadow-sm">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-[10px] text-muted uppercase tracking-wide font-semibold">
                  {t("health.bloodType")}
                </p>
                <p className="text-sm font-semibold text-dark mt-0.5">
                  {info?.blood_type || "—"}
                </p>
              </div>
              <div>
                <p className="text-[10px] text-muted uppercase tracking-wide font-semibold">
                  {t("health.insurance")}
                </p>
                <p className="text-sm font-semibold text-dark mt-0.5">
                  {info?.insurance_name || "—"}
                </p>
              </div>
              <div>
                <p className="text-[10px] text-muted uppercase tracking-wide font-semibold">
                  {t("health.insuranceNumber")}
                </p>
                <p className="text-sm font-semibold text-dark mt-0.5">
                  {info?.insurance_number || "—"}
                </p>
              </div>
              <div>
                <p className="text-[10px] text-muted uppercase tracking-wide font-semibold">
                  {t("health.susNumber")}
                </p>
                <p className="text-sm font-semibold text-dark mt-0.5">
                  {info?.sus_number || "—"}
                </p>
              </div>
            </div>
          </div>
        )}
      </section>

      {/* Pediatra Principal */}
      {pediatrician && (
        <section className="mb-6">
          <h2 className="text-sm font-semibold text-dark mb-3 px-1">
            {t("health.mainPediatrician")}
          </h2>
          <div className="bg-white rounded-xl p-4 shadow-sm">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                <span className="text-lg">👨‍⚕️</span>
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-bold text-dark">
                  Dr(a). {pediatrician.name}
                </h3>
                {pediatrician.specialty && (
                  <p className="text-xs text-muted">{pediatrician.specialty}</p>
                )}
                {pediatrician.crm && (
                  <p className="text-xs text-muted">CRM: {pediatrician.crm}</p>
                )}

                <div className="mt-3 space-y-2">
                  {pediatrician.phone && (
                    <div className="flex items-center gap-2 text-xs text-dark">
                      <svg className="w-3.5 h-3.5 text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                      </svg>
                      {pediatrician.phone}
                    </div>
                  )}

                  {pediatrician.whatsapp && (
                    <a
                      href={`https://wa.me/${pediatrician.whatsapp.replace(/\D/g, "").replace(/^(\d{10,11})$/, "55$1")}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 text-xs text-green-600 font-medium hover:text-green-700"
                    >
                      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                      </svg>
                      WhatsApp
                    </a>
                  )}

                  {pediatrician.address && (
                    <div className="flex items-start gap-2 text-xs text-dark">
                      <svg className="w-3.5 h-3.5 text-muted mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                      <span>{pediatrician.address}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
