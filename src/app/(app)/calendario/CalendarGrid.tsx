"use client";

import { useState, useMemo, useCallback } from "react";
import { useI18n } from "@/i18n/provider";
import {
  getMonthGrid,
  isWeekend,
  formatDateKey,
  parseDateKey,
} from "@/lib/calendar-utils";
import type { CustodyDayInfo, ParentColorMap } from "@/lib/calendar-utils";
// DAY_NAMES and MONTH_NAMES are now sourced from i18n translations
import { getHolidayMap } from "@/lib/brazilian-holidays";
import { hapticLight } from "@/lib/haptics";

interface ActivityInfo {
  id: string;
  name: string;
  category: string;
  time_start: string | null;
  location: string | null;
  childName: string;
  checklistCount: number;
}

interface CalendarGridProps {
  initialYear: number;
  initialMonth: number;
  custodyMap: Record<string, CustodyDayInfo>;
  parentColors: ParentColorMap;
  currentUserId: string;
  groupId: string;
  onDayClick?: (dateKey: string, info: CustodyDayInfo | null) => void;
  pendingSwapDates?: Set<string>;
  activities?: Record<string, ActivityInfo[]>;
}

// Activity pill colors — MUST NOT conflict with parent custody colors
// Parent A = Terracota #D4735A (warm coral/orange)
// Parent B = Sage #5B9E85 (green/teal)
// So activities use: blues, purples, pinks, yellows — NO oranges or greens
const CATEGORY_COLORS: Record<string, string> = {
  sport: "#4A6CF7",    // vivid blue
  health: "#E84393",   // pink
  school: "#6B5B95",   // purple
  art: "#F39C12",      // golden yellow
  music: "#3742FA",    // indigo
  therapy: "#A855F7",  // violet
  course: "#0984E3",   // ocean blue
  evento: "#E17055",   // soft red (distinct from terracota)
  viagem: "#6C5CE7",   // deep purple
  guarda: "#636E72",   // neutral gray (not used in pills, but just in case)
  birthday: "#D946EF", // magenta — festive, distinct from custody (terracota/sage) and other categories
  other: "#636E72",    // neutral gray
};

// Pre-computed pill styles per category to avoid creating new objects each render
const CATEGORY_PILL_STYLES: Record<string, React.CSSProperties> = {};
for (const [cat, color] of Object.entries(CATEGORY_COLORS)) {
  CATEGORY_PILL_STYLES[cat] = {
    backgroundColor: color + "25",
    color: color,
    borderLeft: `2px solid ${color}`,
  };
}
function getCategoryPillStyle(category: string): React.CSSProperties {
  return CATEGORY_PILL_STYLES[category] || CATEGORY_PILL_STYLES.other;
}

const EMPTY_STYLE: React.CSSProperties = {};

export default function CalendarGrid({
  initialYear,
  initialMonth,
  custodyMap,
  parentColors,
  currentUserId,
  onDayClick,
  pendingSwapDates,
  activities = {},
}: CalendarGridProps) {
  const { t } = useI18n();
  const [year, setYear] = useState(initialYear);
  const [month, setMonth] = useState(initialMonth);

  const grid = useMemo(() => getMonthGrid(year, month), [year, month]);
  const flatGrid = useMemo(() => grid.flat(), [grid]);
  const todayKey = useMemo(() => formatDateKey(new Date()), []);
  const holidayMap = useMemo(() => getHolidayMap(year), [year]);

  // Translated month and day names from i18n
  const MONTH_NAMES = useMemo(() => t("calendar.monthNames").split(","), [t]);
  const DAY_NAMES = useMemo(() => t("calendar.dayNames").split(","), [t]);

  function prevMonth() {
    if (month === 0) {
      setMonth(11);
      setYear(year - 1);
    } else {
      setMonth(month - 1);
    }
  }

  function nextMonth() {
    if (month === 11) {
      setMonth(0);
      setYear(year + 1);
    } else {
      setMonth(month + 1);
    }
  }

  const handleDayClick = useCallback((dateKey: string) => {
    hapticLight();
    const info = custodyMap[dateKey] || null;
    onDayClick?.(dateKey, info);
  }, [custodyMap, onDayClick]);

  return (
    <div className="bg-white rounded-xl shadow-sm p-4">
      {/* Month Navigation */}
      <div className="flex items-center justify-between mb-4">
        <button
          onClick={prevMonth}
          className="min-w-[44px] min-h-[44px] flex items-center justify-center hover:bg-gray-100 active:bg-gray-200 rounded-lg transition-colors"
          aria-label={t("calendar.previousMonth")}
        >
          <svg className="w-5 h-5 text-dark" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <h2 className="text-lg font-bold text-dark">
          {MONTH_NAMES[month]} {year}
        </h2>
        <button
          onClick={nextMonth}
          className="min-w-[44px] min-h-[44px] flex items-center justify-center hover:bg-gray-100 active:bg-gray-200 rounded-lg transition-colors"
          aria-label={t("calendar.nextMonth")}
        >
          <svg className="w-5 h-5 text-dark" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>

      {/* Day Headers */}
      <div className="grid grid-cols-7 mb-1">
        {DAY_NAMES.map((day, i) => (
          <div
            key={day}
            className={`text-center text-xs font-semibold py-2 ${
              i === 0 || i === 6 ? "text-secondary" : "text-muted"
            }`}
          >
            {day}
          </div>
        ))}
      </div>

      {/* Calendar Grid — Apple-style with event pills */}
      <div className="grid grid-cols-7 gap-0.5">
        {flatGrid.map((dateKey, idx) => {
          if (!dateKey) {
            return <div key={`empty-${idx}`} className="min-h-[72px] sm:min-h-[80px]" />;
          }

          const info = custodyMap[dateKey];
          const dayNum = parseDateKey(dateKey).getDate();
          const today = dateKey === todayKey;
          const isPast = dateKey < todayKey;
          const weekend = isWeekend(dateKey);
          const holiday = holidayMap[dateKey];
          const hasPendingSwap = pendingSwapDates?.has(dateKey) || false;
          const dayActivities = activities[dateKey] || [];
          const visibleActivities = dayActivities.slice(0, 2);
          const extraCount = dayActivities.length - 2;
          // Week separator: add top border on Sundays (start of visual week)
          const isSunday = idx % 7 === 0 && idx > 0 && dateKey;

          return (
            <button
              key={dateKey}
              onClick={() => handleDayClick(dateKey)}
              title={info ? info.userName : holiday || undefined}
              className={`
                min-h-[72px] sm:min-h-[80px] rounded-lg flex flex-col items-stretch p-1 relative
                text-sm transition-all overflow-hidden active:scale-[0.97]
                ${holiday && !info ? "bg-purple-50/50" : weekend && !info ? "bg-gray-50/50" : ""}
                ${today ? "ring-2 ring-primary ring-offset-1 shadow-sm" : ""}
                ${isPast && !today ? "opacity-60" : ""}
                ${isSunday ? "border-t border-gray-100" : ""}
                hover:bg-gray-50/80
              `}
              style={info ? { backgroundColor: info.color + "12" } : EMPTY_STYLE}
            >
              {/* Day number + indicators */}
              <div className="flex items-center justify-between mb-0.5">
                <span className={`text-[11px] leading-none font-semibold w-5 h-5 flex items-center justify-center rounded-full ${
                  today ? "bg-primary text-white" : holiday ? "text-purple-600" : "text-dark"
                }`}>
                  {dayNum}
                </span>
                <div className="flex items-center gap-0.5">
                  {holiday && (
                    <div className="w-1.5 h-1.5 rounded-full bg-purple-400" />
                  )}
                  {hasPendingSwap && (
                    <div className="w-3 h-3 rounded-full bg-amber-400 flex items-center justify-center">
                      <svg className="w-2 h-2 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                      </svg>
                    </div>
                  )}
                </div>
              </div>

              {/* Holiday name — subtle label */}
              {holiday && (
                <div className="text-[8px] leading-tight text-purple-500 font-medium truncate px-0.5 mb-0.5">
                  {holiday}
                </div>
              )}

              {/* Event pills — Apple Calendar style */}
              <div className="flex flex-col gap-[2px] flex-1">
                {visibleActivities.map((act) => (
                  <div
                    key={act.id}
                    className="text-[9px] sm:text-[10px] leading-tight truncate px-1 py-[1px] rounded-sm font-medium"
                    style={getCategoryPillStyle(act.category)}
                  >
                    {act.time_start ? act.time_start.slice(0, 5) + " " : ""}{act.name}
                  </div>
                ))}
                {extraCount > 0 && (
                  <div className="text-[9px] text-muted font-medium px-1">
                    +{extraCount}
                  </div>
                )}
              </div>

              {/* Custody indicator: colored bar at bottom */}
              {info && (
                <div
                  className="absolute bottom-0 left-0 right-0 h-1.5"
                  style={{ backgroundColor: info.color }}
                />
              )}
            </button>
          );
        })}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-4 mt-4 pt-3 border-t border-gray-100">
        {Object.entries(parentColors).map(([userId, { name, color }]) => (
          <div key={userId} className="flex items-center gap-2">
            <div
              className="w-3 h-3 rounded-full"
              style={{ backgroundColor: color }}
            />
            <span className="text-xs text-muted">
              {name} {userId === currentUserId ? t("calendar.you") : ""}
            </span>
          </div>
        ))}
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-purple-400" />
          <span className="text-xs text-muted">{t("calendar.holiday")}</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-[#D4735A]" />
          <span className="text-xs text-muted">{t("calendar.activity")}</span>
        </div>
      </div>
    </div>
  );
}
