"use client";

import { useI18n } from "@/i18n/provider";
import Link from "next/link";

export default function NovoHeader() {
  const { t } = useI18n();

  return (
    <div className="flex items-center gap-3 mb-6">
      <Link href="/calendario" className="text-muted hover:text-dark">
        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
      </Link>
      <h1 className="text-2xl font-bold text-dark">{t("calendar.newAppointment")}</h1>
    </div>
  );
}
