"use client";

import Link from "next/link";
import { type FormEvent, useState } from "react";
import { useI18n } from "@/i18n/provider";
import { MEDICATION_FREQUENCIES } from "@/lib/health-constants";
import FrequencySelect from "../FrequencySelect";
import SubmitButton from "../../SubmitButton";

type CareType = 'medication' | 'treatment' | 'procedure';

const CARE_TYPE_ICONS: Record<CareType, string> = {
  medication: '💊',
  treatment: '🩹',
  procedure: '🩺',
};

interface Props {
  groupId: string;
  children: { id: string; full_name: string }[] | null;
  today: string;
  createAction: (formData: FormData) => Promise<void>;
}

export default function MedicationFormClient({ groupId, children, today, createAction }: Props) {
  const { t } = useI18n();
  const [careType, setCareType] = useState<CareType>('medication');

  // Meio-termo (paridade com o native, decisão do dono 2026-06-04): dosagem e
  // frequência não são mais obrigatórias, mas se vierem em branco confirmamos
  // antes de salvar — em vez de bloquear (regra antiga do PWA) ou aceitar
  // silenciosamente. Report iOS (martins.00542).
  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    const fd = new FormData(e.currentTarget);
    const dosage = ((fd.get("dosage") as string) || "").trim();
    const frequency = ((fd.get("frequency") as string) || "").trim();
    if ((!dosage || !frequency) && !window.confirm(t("health.confirmSaveWithoutDosageFrequency"))) {
      e.preventDefault();
    }
  }

  const isMedication = careType === 'medication';
  const isTreatment = careType === 'treatment';
  const isProcedure = careType === 'procedure';

  const pageTitle = isMedication ? t("health.newMedication") : isTreatment ? t("health.newTreatment") : t("health.newProcedure");
  const nameLabel = isMedication ? t("health.medicationName") : isTreatment ? t("health.treatmentName") : t("health.procedureName");
  const namePlaceholder = isMedication ? '' : isTreatment ? t("health.treatmentNamePlaceholder") : t("health.procedureNamePlaceholder");
  const dosageLabel = isMedication ? t("health.dosageLabel") : isTreatment ? t("health.treatmentGuidanceLabel") : t("health.procedureDetailsLabel");
  const dosagePlaceholder = isMedication ? t("health.dosagePlaceholder") : isTreatment ? t("health.treatmentGuidancePlaceholder") : t("health.procedureDetailsPlaceholder");
  const frequencyLabel = isProcedure ? t("health.whenToRepeatLabel") : t("health.frequencyLabel");
  const freqPlaceholder = isProcedure ? t("health.whenToRepeatPlaceholder") : t("health.treatmentGuidancePlaceholder");
  const prescribedByLabel = isMedication ? t("health.prescribedByLabel") : isTreatment ? t("health.indicatedByLabel") : t("health.requestedByLabel");
  const submitLabel = isMedication ? t("health.addMedication") : isTreatment ? t("health.addTreatment") : t("health.addProcedure");

  return (
    <div className="max-w-lg mx-auto pb-20 space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/saude/medicamentos" className="w-9 h-9 flex items-center justify-center rounded-full bg-white shadow-sm text-[#8E8E93] hover:bg-gray-50 transition-colors">
          ←
        </Link>
        <h1 className="text-2xl font-bold text-[#2D2D2D]">{pageTitle}</h1>
      </div>

      <form action={createAction} onSubmit={handleSubmit} className="bg-white rounded-xl p-4 shadow-sm space-y-4">
        <input type="hidden" name="groupId" value={groupId} />
        <input type="hidden" name="careType" value={careType} />

        {/* Care type selector */}
        <div>
          <label className="block text-sm font-medium text-[#2D2D2D] mb-2">{t("health.careType")}</label>
          <div className="flex gap-2">
            {(["medication", "treatment", "procedure"] as CareType[]).map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => setCareType(type)}
                className={`flex-1 py-2 px-2 rounded-lg text-xs font-medium border transition-colors flex flex-col items-center gap-1 ${
                  careType === type
                    ? "bg-[#5B9B8A] text-white border-[#5B9B8A]"
                    : "bg-white text-[#2D2D2D] border-gray-200 hover:border-[#5B9B8A]/50"
                }`}
              >
                <span>{CARE_TYPE_ICONS[type]}</span>
                <span>{type === "medication" ? t("health.careTypeMedication") : type === "treatment" ? t("health.careTypeTreatment") : t("health.careTypeProcedure")}</span>
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-[#2D2D2D] mb-1">{t("health.child")}</label>
          {children && children.length > 0 ? (
            <select name="childId" required className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#5B9B8A]/50">
              <option value="">{t("health.select")}</option>
              {children.map((c) => (
                <option key={c.id} value={c.id}>{c.full_name}</option>
              ))}
            </select>
          ) : (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800">
              {t("health.registerChildFirst")}{" "}
              <Link href="/criancas/nova" className="text-primary font-semibold underline">{t("health.registerChild")}</Link>
            </div>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-[#2D2D2D] mb-1">{nameLabel}</label>
          <input type="text" name="name" required placeholder={namePlaceholder} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#5B9B8A]/50" />
        </div>

        <div>
          <label className="block text-sm font-medium text-[#2D2D2D] mb-1">{dosageLabel}</label>
          <input type="text" name="dosage" placeholder={dosagePlaceholder} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#5B9B8A]/50" />
        </div>

        <div>
          {isMedication ? (
            <FrequencySelect frequencies={MEDICATION_FREQUENCIES} />
          ) : (
            <>
              <label className="block text-sm font-medium text-[#2D2D2D] mb-1">{frequencyLabel}</label>
              <input type="text" name="frequency" placeholder={freqPlaceholder} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#5B9B8A]/50" />
            </>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-[#2D2D2D] mb-1">{t("health.reason")}</label>
          <input type="text" name="reason" placeholder={t("health.reasonPlaceholder")} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#5B9B8A]/50" />
        </div>

        <div>
          <label className="block text-sm font-medium text-[#2D2D2D] mb-1">{prescribedByLabel}</label>
          <input type="text" name="prescribedBy" placeholder={t("health.doctorNamePlaceholder")} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#5B9B8A]/50" />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-[#2D2D2D] mb-1">{t("health.startDate")}</label>
            <input type="date" name="startDate" required defaultValue={today} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#5B9B8A]/50" />
          </div>
          <div>
            <label className="block text-sm font-medium text-[#2D2D2D] mb-1">{t("health.endDate")}</label>
            <input type="date" name="endDate" className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#5B9B8A]/50" />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-[#2D2D2D] mb-1">{t("health.notes")}</label>
          <textarea name="notes" rows={3} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#5B9B8A]/50" />
        </div>

        <SubmitButton label={submitLabel} />
      </form>
    </div>
  );
}
