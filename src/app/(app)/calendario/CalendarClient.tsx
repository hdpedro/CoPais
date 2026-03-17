"use client";

import { useState } from "react";
import CalendarGrid from "./CalendarGrid";
import WeekendPlanner from "./WeekendPlanner";
import SwapRequestModal from "./SwapRequestModal";
import SwapRequestList from "./SwapRequestList";
import CalendarExportButton from "./CalendarExportButton";
import type { CustodyDayInfo, ParentColorMap, WeekendInfo } from "@/lib/calendar-utils";

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
  groupId: string;
  weekends: WeekendInfo[];
  swapRequests: SwapRequest[];
}

export default function CalendarClient({
  initialYear,
  initialMonth,
  custodyMap,
  parentColors,
  currentUserId,
  groupId,
  weekends,
  swapRequests,
}: CalendarClientProps) {
  const [swapModal, setSwapModal] = useState<{
    isOpen: boolean;
    dateKey: string;
    dayInfo: CustodyDayInfo | null;
  }>({ isOpen: false, dateKey: "", dayInfo: null });

  function handleDayClick(dateKey: string, info: CustodyDayInfo | null) {
    // Only allow swap requests for days assigned to the other parent
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
      />
    </>
  );
}
