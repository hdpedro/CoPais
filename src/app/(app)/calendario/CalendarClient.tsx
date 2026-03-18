"use client";

import { useState } from "react";
import CalendarGrid from "./CalendarGrid";
import WeekendPlanner from "./WeekendPlanner";
import SwapRequestModal from "./SwapRequestModal";
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
  const [swapModal, setSwapModal] = useState<{
    isOpen: boolean;
    dateKey: string;
    dayInfo: CustodyDayInfo | null;
  }>({ isOpen: false, dateKey: "", dayInfo: null });

  // Parents who have custody days assigned
  const isParentWithCustody = Object.values(custodyMap).some(
    (d) => d.userId === currentUserId
  );

  function handleDayClick(dateKey: string, info: CustodyDayInfo | null) {
    // Parents: can request swap for days assigned to the other parent
    // Non-parents (grandparents, etc.): can request a visit for any assigned day
    if (info && info.userId !== currentUserId) {
      setSwapModal({ isOpen: true, dateKey, dayInfo: info });
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
      />

      <SwapBalanceCard
        balanceByUser={swapBalance.balanceByUser}
        totalSwapDays={swapBalance.totalSwapDays}
        parentColors={parentColors}
      />

      <WeekendPlanner weekends={weekends} currentUserId={currentUserId} />

      <SwapRequestList requests={swapRequests} currentUserId={currentUserId} />

      <CalendarExportButton groupId={groupId} />

      <SwapRequestModal
        isOpen={swapModal.isOpen}
        onClose={() => setSwapModal({ isOpen: false, dateKey: "", dayInfo: null })}
        selectedDate={swapModal.dateKey}
        dayInfo={swapModal.dayInfo}
        groupId={groupId}
        currentUserId={currentUserId}
        isVisitRequest={!isParentWithCustody}
      />
    </>
  );
}
