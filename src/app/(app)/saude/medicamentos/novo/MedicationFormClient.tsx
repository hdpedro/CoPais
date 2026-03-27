"use client";

import Link from "next/link";
import { useI18n } from "@/i18n/provider";
import { MEDICATION_FREQUENCIES } from "@/lib/health-constants";
import FrequencySelect from "../FrequencySelect";
import SubmitButton from "../../SubmitButton";

interface Props {
  groupId: string;
  children: { id: string; full_name: string }[] | null;
  today: string;
  createAction: (formData: FormData) => Promise<void>;
}

export default function MedicationFormClient({ groupId, children, today, createAction }: Props) {
  const { t } = useI18n();

  return (
    <div className="max-w-lg mx-auto pb-20 space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/saude/medicamentos" className="w-9 h-9 flex items-center justify-center rounded-full bg-white shadow-sm text-[#8E8E93] hover:bg-gray-50 transition-colors">
          ←
        </Link>
        <h1 className="text-2xl font-bold text-[#2D2D2D]">{t("health.newMedication")}</h1>
      </div>

      <form action={createAction} className="bg-white rounded-xl p-4 shadow-sm space-y-4">
        <input type="hidden" name="groupId" value={groupId} />

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
          <label className="block text-sm font-medium text-[#2D2D2D] mb-1">{t("health.medicationName")}</label>
          <input type="text" name="name" required className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#5B9B8A]/50" />
        </div>

        <div>
          <label className="block text-sm font-medium text-[#2D2D2D] mb-1">{t("health.dosageLabel")}</label>
          <input type="text" name="dosage" required placeholder={t("health.dosagePlaceholder")} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#5B9B8A]/50" />
        </div>

        <div>
          <FrequencySelect frequencies={MEDICATION_FREQUENCIES} />
        </div>

        <div>
          <label className="block text-sm font-medium text-[#2D2D2D] mb-1">{t("health.reason")}</label>
          <input type="text" name="reason" placeholder={t("health.reasonPlaceholder")} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#5B9B8A]/50" />
        </div>

        <div>
          <label className="block text-sm font-medium text-[#2D2D2D] mb-1">{t("health.prescribedByLabel")}</label>
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

        <SubmitButton label={t("health.addMedication")} />
      </form>
    </div>
  );
}
