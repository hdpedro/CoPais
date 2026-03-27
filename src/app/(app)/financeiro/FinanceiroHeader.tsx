"use client";

import { useI18n } from "@/i18n/provider";

export default function FinanceiroHeader() {
  const { t } = useI18n();

  return (
    <div className="flex items-center justify-between">
      <h1 className="text-2xl font-bold text-dark">{t("nav.financialSummary")}</h1>
    </div>
  );
}
