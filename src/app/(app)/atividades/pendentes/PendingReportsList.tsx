"use client";

import { useState } from "react";
import { useI18n } from "@/i18n/provider";
import { ACTIVITY_CATEGORIES } from "@/lib/constants";
import ActivityReportModal from "../ActivityReportModal";

interface PendingItem {
  activityId: string;
  activityName: string;
  category: string;
  childName: string;
  timeStart: string | null;
  occurrenceDate: string;
  dateLabel: string;
}

/**
 * Lista de ocorrências esperando relato. Cada card abre o ActivityReportModal
 * com a occurrence_date CERTA — relatar limpa o pendente via router.refresh().
 */
export default function PendingReportsList({ items }: { items: PendingItem[] }) {
  const { t } = useI18n();
  const [selected, setSelected] = useState<PendingItem | null>(null);

  if (items.length === 0) {
    return (
      <div className="bg-white rounded-2xl p-8 shadow-sm text-center">
        <p className="text-[15px] font-semibold text-[#2C2C2C]">✓ {t("activityReport.pendingEmpty")}</p>
        <p className="text-[12px] text-[#9A8878] mt-1">{t("activityReport.pendingEmptyHint")}</p>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-2">
        {items.map((p) => {
          const cat = ACTIVITY_CATEGORIES.find((c) => c.value === p.category);
          return (
            <button
              key={`${p.activityId}:${p.occurrenceDate}`}
              type="button"
              onClick={() => setSelected(p)}
              className="w-full text-left bg-white rounded-2xl p-4 shadow-sm border border-gray-100/80 hover:shadow-md transition-shadow"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-[#C07055]/10 flex items-center justify-center text-lg flex-shrink-0">
                  {cat?.icon || "📋"}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[14px] font-semibold text-[#2C2C2C] truncate">{p.activityName}</p>
                  <p className="text-[11px] text-[#9A8878]">
                    {[p.childName, p.timeStart?.slice(0, 5), p.dateLabel].filter(Boolean).join(" · ")}
                  </p>
                </div>
                <span className="text-[12px] font-semibold text-[#C07055] flex-shrink-0">
                  {t("activityReport.reportCta")} →
                </span>
              </div>
            </button>
          );
        })}
      </div>
      <ActivityReportModal
        key={selected ? `${selected.activityId}:${selected.occurrenceDate}` : "none"}
        isOpen={!!selected}
        onClose={() => setSelected(null)}
        activityId={selected?.activityId ?? ""}
        activityName={selected?.activityName ?? ""}
        childName={selected?.childName ?? ""}
        occurrenceDate={selected?.occurrenceDate ?? ""}
        timeStart={selected?.timeStart}
      />
    </>
  );
}
