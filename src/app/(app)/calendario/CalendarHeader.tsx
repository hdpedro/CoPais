"use client";

import Link from "next/link";
import { useI18n } from "@/i18n/provider";

export default function CalendarHeader({ isReadonly }: { isReadonly: boolean }) {
  const { t } = useI18n();

  return (
    <div className="flex items-center justify-between">
      <h1 className="text-2xl font-bold text-dark">{t("calendar.title")}</h1>
      {!isReadonly && (
        <div className="flex gap-2">
          <Link
            href="/calendario/escala"
            className="px-4 py-2 bg-white text-primary text-sm font-semibold rounded-lg border border-primary hover:bg-primary/5 transition-colors"
          >
            {t("schedule.configure")}
          </Link>
          <Link
            href="/calendario/novo"
            className="px-4 py-2 bg-primary text-white text-sm font-semibold rounded-lg hover:bg-primary-dark transition-colors"
          >
            + {t("calendar.addEvent")}
          </Link>
        </div>
      )}
    </div>
  );
}
