"use client";

import { useState, useMemo } from "react";
import CalendarGrid from "./CalendarGrid";
import WeekendPlanner from "./WeekendPlanner";
import DayDetailSheet from "./DayDetailSheet";
import SwapRequestList from "./SwapRequestList";
import CalendarExportButton from "./CalendarExportButton";
import SwapBalanceCard from "./SwapBalanceCard";
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
  swapRequests: SwapRequest[];
}

export default function CalendarClient({
  initialYear,
  initialMonth,
  custodyMap,
  parentColors,
  currentUserId,
  currentUserRole,
  groupId,
  weekends,
  swapBalance,
  swapRequests,
}: CalendarClientProps) {
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

  function handleDayClick(dateKey: string, info: CustodyDayInfo | null) {
    // Open day detail for any day with custody info
    if (info) {
      setDayDetail({ isOpen: true, dateKey, dayInfo: info });
    }
  }

  return (
    <>
      <CalendarGrid
        initialYear={initialYear}
        initialMonth={initialMonth}
        custodyMap={custodyMap}
        parentColors={parentColors}
        currentUserId={currentUserId}
        groupId={groupId}
        onDayClick={handleDayClick}
        pendingSwapDates={pendingSwapDates}
      />

      <SwapBalanceCard
        balanceByUser={swapBalance.balanceByUser}
        totalSwapDays={swapBalance.totalSwapDays}
        parentColors={parentColors}
      />

      <WeekendPlanner weekends={weekends} currentUserId={currentUserId} />

      <SwapRequestList requests={swapRequests} currentUserId={currentUserId} />

      <CalendarExportButton groupId={groupId} />

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
      />
    </>
  );
}
