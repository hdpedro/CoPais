"use client";

import Link from "next/link";
import { useI18n } from "@/i18n/provider";
import SubmitButton from "../../SubmitButton";

interface Props {
  groupId: string;
  children: { id: string; full_name: string }[] | null;
  allVaccineNames: string[];
  today: string;
  error?: string;
  createAction: (formData: FormData) => Promise<void>;
}

export default function VaccineFormClient({ groupId, children, allVaccineNames, today, error: errorMsg, createAction }: Props) {
  const { t } = useI18n();

  return (
    <div className="max-w-lg mx-auto pb-20">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/saude/vacinas" className="text-muted hover:text-dark">
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-dark">{t("health.registerVaccineTitle")}</h1>
          <p className="text-sm text-muted">{t("health.newVaccineRecord")}</p>
        </div>
      </div>

      {errorMsg && (
        <div className="bg-red-50 border border-error/20 text-error rounded-lg p-3 mb-4 text-sm">
          {decodeURIComponent(errorMsg)}
        </div>
      )}

      <form action={createAction} className="space-y-4">
        <input type="hidden" name="groupId" value={groupId} />

        <div className="bg-white rounded-xl p-4 shadow-sm">
          <label className="block text-xs font-semibold text-dark mb-1.5">{t("health.child")} *</label>
          {children && children.length > 0 ? (
            <select name="childId" required className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-dark focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary">
              <option value="">{t("health.select")}</option>
              {children.map((child) => (
                <option key={child.id} value={child.id}>{child.full_name}</option>
              ))}
            </select>
          ) : (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800">
              {t("health.registerChildFirst")}{" "}
              <Link href="/criancas/nova" className="text-primary font-semibold underline">{t("health.registerChild")}</Link>
            </div>
          )}
        </div>

        <div className="bg-white rounded-xl p-4 shadow-sm">
          <label className="block text-xs font-semibold text-dark mb-1.5">{t("health.vaccine")} *</label>
          <select name="vaccineName" required className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-dark focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary">
            <option value="">{t("health.selectVaccine")}</option>
            {allVaccineNames.map((name) => (
              <option key={name} value={name}>{name}</option>
            ))}
            <option value="__outra">{t("health.otherManual")}</option>
          </select>
          <input type="text" name="vaccineNameCustom" placeholder={t("health.vaccineNameManual")} className="w-full mt-2 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-dark placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary" />
        </div>

        <div className="bg-white rounded-xl p-4 shadow-sm">
          <label className="block text-xs font-semibold text-dark mb-1.5">{t("health.doseLabel")}</label>
          <input type="text" name="doseLabel" placeholder={t("health.dosePlaceholder")} className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-dark placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary" />
        </div>

        <div className="bg-white rounded-xl p-4 shadow-sm">
          <label className="block text-xs font-semibold text-dark mb-1.5">{t("health.applicationDate")} *</label>
          <input type="date" name="administeredDate" required defaultValue={today} className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-dark focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary" />
        </div>

        <div className="bg-white rounded-xl p-4 shadow-sm">
          <label className="block text-xs font-semibold text-dark mb-1.5">{t("health.batchNumber")} <span className="font-normal text-muted">({t("common.optional")})</span></label>
          <input type="text" name="batchNumber" placeholder={t("health.batchNumberPlaceholder")} className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-dark placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary" />
        </div>

        <div className="bg-white rounded-xl p-4 shadow-sm">
          <label className="block text-xs font-semibold text-dark mb-1.5">{t("health.location")} <span className="font-normal text-muted">({t("common.optional")})</span></label>
          <input type="text" name="location" placeholder={t("health.locationPlaceholder")} className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-dark placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary" />
        </div>

        <div className="bg-white rounded-xl p-4 shadow-sm">
          <label className="block text-xs font-semibold text-dark mb-1.5">{t("health.notes")} <span className="font-normal text-muted">({t("common.optional")})</span></label>
          <textarea name="notes" rows={3} placeholder={t("health.notesVaccinePlaceholder")} className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-dark placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary resize-none" />
        </div>

        <SubmitButton label={t("health.registerVaccine")} />
      </form>
    </div>
  );
}
