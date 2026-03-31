"use client";

import { useI18n } from "@/i18n/provider";
import { addChild } from "@/actions/group";

interface NewChildClientProps {
  groupId: string;
  today: string;
}

export default function NewChildClient({ groupId, today }: NewChildClientProps) {
  const { t } = useI18n();

  return (
    <div className="max-w-lg mx-auto pb-20">
      <h1 className="text-2xl font-bold text-dark mb-6">{t("children.addChild")}</h1>

      <form action={addChild} className="bg-white rounded-xl p-6 shadow-sm space-y-4">
        <input type="hidden" name="groupId" value={groupId} />

        <div>
          <label className="block text-sm font-medium text-dark mb-1">{t("children.fullName")}</label>
          <input type="text" name="fullName" required placeholder={t("children.namePlaceholder")}
            className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary" />
        </div>

        <div>
          <label className="block text-sm font-medium text-dark mb-1">{t("children.birthDate")}</label>
          <input type="date" name="birthDate" required max={today}
            className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary" />
        </div>

        <div>
          <label className="block text-sm font-medium text-dark mb-1">{t("children.sex")}</label>
          <div className="flex gap-3">
            <label className="flex-1 relative">
              <input type="radio" name="sex" value="M" className="peer sr-only" />
              <div className="w-full py-3 text-center border-2 border-gray-200 rounded-lg cursor-pointer text-sm font-medium text-muted peer-checked:border-blue-500 peer-checked:bg-blue-50 peer-checked:text-blue-700 transition-colors">
                {t("children.boy")}
              </div>
            </label>
            <label className="flex-1 relative">
              <input type="radio" name="sex" value="F" className="peer sr-only" />
              <div className="w-full py-3 text-center border-2 border-gray-200 rounded-lg cursor-pointer text-sm font-medium text-muted peer-checked:border-pink-500 peer-checked:bg-pink-50 peer-checked:text-pink-700 transition-colors">
                {t("children.girl")}
              </div>
            </label>
          </div>
          <p className="text-[11px] text-muted mt-1">{t("children.sexHint")}</p>
        </div>

        <div>
          <label className="block text-sm font-medium text-dark mb-1">{t("children.allergiesLabel")}</label>
          <input type="text" name="allergies" placeholder={t("children.allergiesPlaceholder")}
            className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary" />
        </div>

        <div>
          <label className="block text-sm font-medium text-dark mb-1">{t("children.notes")}</label>
          <textarea name="notes" rows={3} placeholder={t("children.notesPlaceholder")}
            className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary" />
        </div>

        <button type="submit"
          className="w-full py-3 bg-primary text-white font-semibold rounded-lg hover:bg-primary-dark transition-colors">
          {t("common.save")}
        </button>
      </form>
    </div>
  );
}
