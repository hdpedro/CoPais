"use client";

import Link from "next/link";
import { useI18n } from "@/i18n/provider";

export default function CalendarHeader({ isReadonly }: { isReadonly: boolean }) {
  const { t } = useI18n();

  return (
    <div className="flex items-center justify-between">
      <h1 className="text-[22px] font-bold text-[#2C2C2C] tracking-tight">
        {t("calendar.title")}
      </h1>
      {!isReadonly && (
        <div className="flex items-center gap-2">
          <Link
            href="/calendario/escala"
            className="w-9 h-9 flex items-center justify-center rounded-xl bg-white border border-gray-200/80 text-[#7A8C8B] hover:bg-gray-50 hover:text-[#2C2C2C] transition-all active:scale-95 shadow-sm"
            aria-label={t("schedule.configure")}
          >
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
              <line x1="16" y1="2" x2="16" y2="6" />
              <line x1="8" y1="2" x2="8" y2="6" />
              <line x1="3" y1="10" x2="21" y2="10" />
              <path d="M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01" />
            </svg>
          </Link>
          <Link
            href="/calendario/novo"
            className="w-9 h-9 flex items-center justify-center rounded-xl bg-[#D4735A] text-white hover:bg-[#C0644D] transition-all active:scale-95 shadow-sm"
            aria-label={t("calendar.addEvent")}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </Link>
        </div>
      )}
    </div>
  );
}
