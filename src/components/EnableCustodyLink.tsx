"use client";

import Link from "next/link";
import { useI18n } from "@/i18n/provider";

export default function EnableCustodyLink() {
  const { t } = useI18n();

  return (
    <div className="text-center py-4">
      <Link
        href="/calendario/escala"
        className="inline-flex items-center gap-1.5 text-[13px] text-[#7A8C8B] hover:text-[#5B9E85] transition-colors"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
        {t("calendar.enableCustodyLink")}
      </Link>
    </div>
  );
}
