"use client";

import { useState } from "react";
import { useMemo } from "react";
import {
  getMonthGrid,
  isToday,
  isWeekend,
  formatDateKey,
  parseDateKey,
} from "@/lib/calendar-utils";
import type { CustodyDayInfo, ParentColorMap } from "@/lib/calendar-utils";
import { DAY_NAMES, MONTH_NAMES } from "@/lib/constants";
import { getHolidayMap } from "@/lib/brazilian-holidays";

interface CalendarGridProps {
  initialYear: number;
  initialMonth: number;
  custodyMap: Record<string, CustodyDayInfo>;
  parentColors: ParentColorMap;
  currentUserId: string;
  groupId: string;
  onDayClick?: (dateKey: string, info: CustodyDayInfo | null) => void;
}

export default function CalendarGrid({
  initialYear,
  initialMonth,
  custodyMap,
  parentColors,
  currentUserId,
  onDayClick,
}: CalendarGridProps) {
  const [year, setYear] = useState(initialYear);
  const [month, setMonth] = useState(initialMonth);

  const grid = getMonthGrid(year, month);
  const todayKey = formatDateKey(new Date());
  const holidayMap = useMemo(() => getHolidayMap(year), [year]);

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

  function handleDayClick(dateKey: string) {
    const info = custodyMap[dateKey] || null;
    onDayClick?.(dateKey, info);
  }

  return (
    <div className="bg-white rounded-xl shadow-sm p-4">
      {/* Month Navigation */}
      <div className="flex items-center justify-between mb-4">
        <button
          onClick={prevMonth}
          className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          aria-label="Mes anterior"
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
          className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          aria-label="Proximo mes"
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

      {/* Calendar Grid */}
      <div className="grid grid-cols-7 gap-1">
        {grid.flat().map((dateKey, idx) => {
          if (!dateKey) {
            return <div key={`empty-${idx}`} className="aspect-square" />;
          }

          const info = custodyMap[dateKey];
          const dayNum = parseDateKey(dateKey).getDate();
          const today = dateKey === todayKey;
          const weekend = isWeekend(dateKey);
          const holiday = holidayMap[dateKey];

          return (
            <button
              key={dateKey}
              onClick={() => handleDayClick(dateKey)}
              title={holiday || undefined}
              className={`
                aspect-square rounded-lg flex flex-col items-center justify-center relative
                text-sm transition-all
                ${holiday ? "bg-purple-50" : weekend ? "bg-gray-50" : ""}
                ${today ? "ring-2 ring-primary ring-offset-1" : ""}
                hover:bg-gray-100
              `}
            >
              <span className={`text-xs font-medium ${
                holiday ? "text-purple-600 font-bold" : today ? "text-primary font-bold" : "text-dark"
              }`}>
                {dayNum}
              </span>
              <div className="flex items-center gap-0.5 mt-0.5">
                {holiday && (
                  <div className="w-1.5 h-1.5 rounded-full bg-purple-400" />
                )}
                {info && (
                  <div
                    className="w-2 h-2 rounded-full"
                    style={{ backgroundColor: info.color }}
                    title={info.userName}
                  />
                )}
              </div>
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
              {name} {userId === currentUserId ? "(voce)" : ""}
            </span>
          </div>
        ))}
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-purple-400" />
          <span className="text-xs text-muted">Feriado</span>
        </div>
      </div>
    </div>
  );
}
