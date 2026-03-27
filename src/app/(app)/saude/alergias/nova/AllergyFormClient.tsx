"use client";

import Link from "next/link";
import { useI18n } from "@/i18n/provider";
import { ALLERGY_TYPES, ALLERGY_SEVERITIES } from "@/lib/health-constants";
import SubmitButton from "../../SubmitButton";

interface Child {
  id: string;
  full_name: string;
}

interface Props {
  groupId: string;
  children: Child[];
  error?: string;
  createAction: (formData: FormData) => Promise<void>;
}

export default function AllergyFormClient({ groupId, children, error: errorMsg, createAction }: Props) {
  const { t } = useI18n();

  return (
    <div className="max-w-lg mx-auto pb-20">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Link href="/saude/alergias" className="text-muted hover:text-dark">
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-dark">{t("health.addAllergy")}</h1>
          <p className="text-sm text-muted">{t("health.newAllergyOrIntolerance")}</p>
        </div>
      </div>

      {/* Alerts */}
      {errorMsg && (
        <div className="bg-red-50 border border-error/20 text-error rounded-lg p-3 mb-4 text-sm">
          {decodeURIComponent(errorMsg)}
        </div>
      )}

      <form action={createAction} className="space-y-4">
        <input type="hidden" name="groupId" value={groupId} />

        {/* Child Select */}
        <div className="bg-white rounded-xl p-4 shadow-sm">
          <label className="block text-xs font-semibold text-dark mb-1.5">
            {t("health.child")} *
          </label>
          {children && children.length > 0 ? (
            <select
              name="childId"
              required
              className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-dark focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
            >
              <option value="">{t("health.select")}</option>
              {children.map((child) => (
                <option key={child.id} value={child.id}>
                  {child.full_name}
                </option>
              ))}
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

        {/* Name */}
        <div className="bg-white rounded-xl p-4 shadow-sm">
          <label className="block text-xs font-semibold text-dark mb-1.5">
            {t("health.allergyName")} *
          </label>
          <input
            type="text"
            name="name"
            required
            placeholder={t("health.allergyNamePlaceholder")}
            className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-dark placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
          />
        </div>

        {/* Allergy Type */}
        <div className="bg-white rounded-xl p-4 shadow-sm">
          <label className="block text-xs font-semibold text-dark mb-1.5">
            {t("health.type")} *
          </label>
          <select
            name="allergyType"
            required
            className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-dark focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
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
        <div className="bg-white rounded-xl p-4 shadow-sm">
          <label className="block text-xs font-semibold text-dark mb-1.5">
            {t("health.severity")} *
          </label>
          <select
            name="severity"
            required
            className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-dark focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
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
        <div className="bg-white rounded-xl p-4 shadow-sm">
          <label className="block text-xs font-semibold text-dark mb-1.5">
            {t("health.reactionDescription")}{" "}
            <span className="font-normal text-muted">({t("common.optional")})</span>
          </label>
          <textarea
            name="reaction"
            rows={3}
            placeholder={t("health.reactionPlaceholder")}
            className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-dark placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary resize-none"
          />
        </div>

        {/* Submit */}
        <SubmitButton label={t("health.registerAllergy")} />
      </form>
    </div>
  );
}
