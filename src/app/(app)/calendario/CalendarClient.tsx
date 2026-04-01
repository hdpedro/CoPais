"use client";

import { useState, useMemo, useCallback, memo } from "react";
import { useI18n } from "@/i18n/provider";
import CalendarGrid from "./CalendarGrid";
import WeekendPlanner from "./WeekendPlanner";
import DayDetailSheet from "./DayDetailSheet";
import SwapRequestList from "./SwapRequestList";
import CalendarExportButton from "./CalendarExportButton";
import SwapBalanceCard from "./SwapBalanceCard";
import EnableCustodyLink from "@/components/EnableCustodyLink";
import type { CustodyDayInfo, ParentColorMap, WeekendInfo, SwapBalance } from "@/lib/calendar-utils";

interface SwapRequest {
  id: string;
  original_date: string;
  proposed_date: string | null;
  reason: string | null;
  status: string;
  created_at: string;
  requester: { full_name: string } | null;
  target: { full_name: string } | null;
  requester_id: string;
  target_user_id: string;
}

export interface ActivityReportInfo {
  status: string;
  notes: string | null;
  child_mood: string | null;
  responsible_override?: string | null;
}

export interface ChecklistItemInfo {
  id: string;
  name: string;
  completed: boolean;
}

export interface ActivityInfo {
  id: string;
  name: string;
  category: string;
  time_start: string | null;
  time_end?: string | null;
  location: string | null;
  childName: string;
  checklistCount: number;
  description?: string | null;
  all_day?: boolean;
  assigned_to_name?: string | null;
  report?: ActivityReportInfo | null;
  recurrence_type?: string;
  teacher_name?: string | null;
  class_name?: string | null;
  room?: string | null;
  responsible_id?: string | null;
  responsible_name?: string | null;
  checklistItems?: ChecklistItemInfo[];
  source?: "activity" | "event" | "appointment";
}

interface CalendarClientProps {
  initialYear: number;
  initialMonth: number;
  custodyMap: Record<string, CustodyDayInfo>;
  parentColors: ParentColorMap;
  currentUserId: string;
  currentUserRole: string;
  groupId: string;
  weekends: WeekendInfo[];
  swapBalance: SwapBalance;
  custodyChangeBanner: { childNames: string; parentName: string } | null;
  custodyEnabled: boolean;
  swapRequests: SwapRequest[];
  activities: Record<string, ActivityInfo[]>;
  memberNames: Record<string, string>;
}

export default memo(function CalendarClient({
  initialYear,
  initialMonth,
  custodyMap,
  parentColors,
  currentUserId,
  // currentUserRole — available via props but not currently used
  groupId,
  weekends,
  swapBalance,
  custodyChangeBanner,
  custodyEnabled,
  swapRequests,
  activities,
  memberNames,
}: CalendarClientProps) {
  const { t } = useI18n();
  const [dayDetail, setDayDetail] = useState<{
    isOpen: boolean;
    dateKey: string;
    dayInfo: CustodyDayInfo | null;
  }>({ isOpen: false, dateKey: "", dayInfo: null });

  // Parents who have custody days assigned
  const isParentWithCustody = Object.values(custodyMap).some(
    (d) => d.userId === currentUserId
  );

  // Build set of dates with pending swap requests
  const pendingSwapDates = useMemo(() => {
    const dates = new Set<string>();
    swapRequests.forEach((r) => {
      if (r.status === "pending") {
        dates.add(r.original_date);
      }
    });
    return dates;
  }, [swapRequests]);

  const handleDayClick = useCallback((dateKey: string, info: CustodyDayInfo | null) => {
    // Open day detail for any day with custody info or activities
    const hasActivities = activities[dateKey] && activities[dateKey].length > 0;
    if (info || hasActivities) {
      setDayDetail({ isOpen: true, dateKey, dayInfo: info });
    }
  }, [activities]);

  const hasCustodyData = custodyEnabled && Object.keys(custodyMap).length > 0;

  return (
    <>
      {custodyEnabled && !hasCustodyData && (
        <div className="rounded-xl bg-gray-50 border border-gray-200 p-3 text-center">
          <p className="text-[12px] text-gray-500">{t("schedule.optional")}</p>
        </div>
      )}

      {custodyEnabled && custodyChangeBanner && (
        <div className="flex items-start gap-3 rounded-xl bg-amber-50 border border-amber-200 p-3">
          <span className="text-xl leading-none mt-0.5" aria-hidden="true">&#x1F504;</span>
          <p className="text-sm text-amber-900 font-medium">
            {t("calendar.custodyChangeTomorrow", { childNames: custodyChangeBanner.childNames, parentName: custodyChangeBanner.parentName })}
          </p>
        </div>
      )}

      <CalendarGrid
        initialYear={initialYear}
        initialMonth={initialMonth}
        custodyMap={custodyEnabled ? custodyMap : {}}
        parentColors={custodyEnabled ? parentColors : {}}
        currentUserId={currentUserId}
        groupId={groupId}
        onDayClick={handleDayClick}
        pendingSwapDates={pendingSwapDates}
        activities={activities}
      />

      {hasCustodyData && (
        <SwapBalanceCard
          balanceByUser={swapBalance.balanceByUser}
          totalSwapDays={swapBalance.totalSwapDays}
          parentColors={parentColors}
        />
      )}

      {hasCustodyData && (
        <WeekendPlanner weekends={weekends} currentUserId={currentUserId} />
      )}

      {hasCustodyData && (
        <SwapRequestList requests={swapRequests} currentUserId={currentUserId} />
      )}

      <CalendarExportButton groupId={groupId} />

      {!custodyEnabled && <EnableCustodyLink />}

      {/* Day Detail Bottom Sheet with Quick Swap */}
      <DayDetailSheet
        isOpen={dayDetail.isOpen}
        onClose={() => setDayDetail({ isOpen: false, dateKey: "", dayInfo: null })}
        dateKey={dayDetail.dateKey}
        dayInfo={dayDetail.dayInfo}
        groupId={groupId}
        currentUserId={currentUserId}
        isParent={isParentWithCustody}
        pendingSwapForDay={pendingSwapDates.has(dayDetail.dateKey)}
        activities={activities[dayDetail.dateKey] || []}
        memberNames={memberNames}
      />
    </>
  );
});
