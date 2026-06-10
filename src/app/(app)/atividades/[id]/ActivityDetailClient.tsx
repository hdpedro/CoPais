"use client";

import { useState } from "react";
import { ACTIVITY_CATEGORIES, getDisplayName } from "@/lib/constants";
import ActivityReportModal from "../ActivityReportModal";

interface OccurrenceRow {
  date: string;
  dateLabel: string;
  reported?: boolean;
}

interface Props {
  activity: {
    id: string;
    name: string;
    category: string;
    timeStart: string | null;
    location: string | null;
    childName: string;
    responsibleName: string | null;
  };
  past: OccurrenceRow[];
  upcoming: OccurrenceRow[];
  /** Deep-link de push (?date=...): abre o modal direto nessa ocorrência. */
  initialReportDate: string | null;
  headings: {
    upcoming: string;
    recent: string;
    reported: string;
    noOccurrences: string;
    responsible: string;
    reportCta: string;
  };
}

export default function ActivityDetailClient({ activity, past, upcoming, initialReportDate, headings }: Props) {
  const [reportDate, setReportDate] = useState<string | null>(initialReportDate);
  const cat = ACTIVITY_CATEGORIES.find((c) => c.value === activity.category);

  const meta = [
    cat?.label || activity.category,
    activity.childName,
    activity.timeStart,
    activity.location,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="pb-20">
      <header className="mb-5">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-[#C07055]/10 flex items-center justify-center text-2xl flex-shrink-0">
            {cat?.icon || "📋"}
          </div>
          <div className="min-w-0">
            <h1 className="font-display text-[25px] font-semibold text-[#2A2622] tracking-tight leading-[1.1] truncate">
              {activity.name}
            </h1>
            <p className="text-[12.5px] text-[#9A8878] mt-0.5">{meta}</p>
          </div>
        </div>
        {activity.responsibleName && (
          <p className="text-[12px] text-[#9A8878] mt-2">
            {headings.responsible}: {getDisplayName(activity.responsibleName, true)}
          </p>
        )}
      </header>

      <section className="mb-5">
        <h2 className="text-[11px] uppercase tracking-wide text-[#9A8878] font-semibold mb-2">{headings.upcoming}</h2>
        {upcoming.length === 0 ? (
          <div className="bg-white rounded-2xl p-4 shadow-sm">
            <p className="text-[12px] text-[#9A8878]">{headings.noOccurrences}</p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl shadow-sm divide-y divide-gray-100/80">
            {upcoming.map((o) => (
              <div key={o.date} className="px-4 py-3 flex items-center justify-between">
                <span className="text-[13px] text-[#2C2C2C]">{o.dateLabel}</span>
                {activity.timeStart && <span className="text-[12px] text-[#9A8878] tabular-nums">{activity.timeStart}</span>}
              </div>
            ))}
          </div>
        )}
      </section>

      {past.length > 0 && (
        <section>
          <h2 className="text-[11px] uppercase tracking-wide text-[#9A8878] font-semibold mb-2">{headings.recent}</h2>
          <div className="bg-white rounded-2xl shadow-sm divide-y divide-gray-100/80">
            {past.map((o) => (
              <div key={o.date} className="px-4 py-3 flex items-center justify-between gap-3">
                <span className="text-[13px] text-[#2C2C2C]">{o.dateLabel}</span>
                {o.reported ? (
                  <span className="text-[11px] font-semibold text-[#5B9E85] bg-[#5B9E85]/10 px-2 py-0.5 rounded-full">
                    ✓ {headings.reported}
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => setReportDate(o.date)}
                    className="text-[12px] font-semibold text-[#C07055] hover:text-[#A85D47]"
                  >
                    {headings.reportCta} →
                  </button>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      <ActivityReportModal
        key={reportDate ?? "none"}
        isOpen={!!reportDate}
        onClose={() => setReportDate(null)}
        activityId={activity.id}
        activityName={activity.name}
        childName={activity.childName}
        occurrenceDate={reportDate ?? ""}
        timeStart={activity.timeStart}
      />
    </div>
  );
}
