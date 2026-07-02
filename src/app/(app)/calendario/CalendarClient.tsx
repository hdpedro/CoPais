"use client";

import { useState, useMemo, useCallback, memo } from "react";
import { useI18n } from "@/i18n/provider";
import CalendarGrid from "./CalendarGrid";
import WeekendPlanner from "./WeekendPlanner";
import DayDetailSheet from "./DayDetailSheet";
import SwapRequestList from "./SwapRequestList";
import EventRequestList from "./EventRequestList";
import CalendarExportButton from "./CalendarExportButton";
import SwapBalanceCard from "./SwapBalanceCard";
import BalanceOperationList from "./BalanceOperationList";
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
  source?: "activity" | "event" | "appointment" | "birthday";
}

interface BalanceOperationData {
  id: string;
  operation_type: string;
  status: string;
  days: number;
  direction: string;
  related_date: string | null;
  notes: string | null;
  created_at: string;
  responded_at: string | null;
  proposed_by: string;
  target_user_id: string;
  proposer: { full_name: string } | null;
  target: { full_name: string } | null;
}

interface EffectiveBalanceData {
  effectiveByUser: Record<string, number>;
  friendlyConcessions: number;
  lastAgreementDate: string | null;
  pendingOperations: number;
}

interface CalendarClientProps {
  initialYear: number;
  initialMonth: number;
  deepLinkDay: string | null;
  deepLinkEventId: string | null;
  custodyMap: Record<string, CustodyDayInfo>;
  parentColors: ParentColorMap;
  currentUserId: string;
  currentUserRole: string;
  groupId: string;
  weekends: WeekendInfo[];
  swapBalance: SwapBalance;
  effectiveBalance: EffectiveBalanceData;
  balanceOperations: BalanceOperationData[];
  custodyChangeBanner: { childNames: string; parentName: string } | null;
  custodyEnabled: boolean;
  swapRequests: SwapRequest[];
  eventRequests: EventRequestData[];
  activities: Record<string, ActivityInfo[]>;
  memberNames: Record<string, string>;
}

interface EventRequestData {
  id: string;
  event_id: string;
  action_type: string;
  proposed_changes: Record<string, unknown> | null;
  original_snapshot: Record<string, unknown>;
  reason: string | null;
  status: string;
  created_at: string;
  requester_id: string;
  affected_user_ids: string[];
  requester: { full_name: string; avatar_url: string | null } | null;
}

export default memo(function CalendarClient({
  initialYear,
  initialMonth,
  deepLinkDay,
  deepLinkEventId,
  custodyMap,
  parentColors,
  currentUserId,
  // currentUserRole — available via props but not currently used
  groupId,
  weekends,
  swapBalance,
  effectiveBalance,
  balanceOperations,
  custodyChangeBanner,
  custodyEnabled,
  swapRequests,
  eventRequests,
  activities,
  memberNames,
}: CalendarClientProps) {
  const { t } = useI18n();
  // Deep link: auto-open DayDetailSheet when ?day= param is present
  const [dayDetail, setDayDetail] = useState<{
    isOpen: boolean;
    dateKey: string;
    dayInfo: CustodyDayInfo | null;
  }>(() => {
    if (deepLinkDay) {
      return { isOpen: true, dateKey: deepLinkDay, dayInfo: custodyMap[deepLinkDay] || null };
    }
    return { isOpen: false, dateKey: "", dayInfo: null };
  });

  // Parents who have custody days assigned. Com a guarda desligada o mapa só
  // tem dias EXPLÍCITOS (exceção/férias/troca) — não habilita o quick-swap.
  const isParentWithCustody = custodyEnabled && Object.values(custodyMap).some(
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
  // Defesa em profundidade: mostra o CTA sempre que a escala nao estiver
  // configurada (guarda desligada — mesmo com dias explicitos visiveis) ou
  // quando nao houver eventos visiveis. O ScheduleBuilder flipa a flag ao salvar.
  const showSetupCard = !custodyEnabled || Object.keys(custodyMap).length === 0;

  return (
    <>
      {showSetupCard && <EnableCustodyLink variant="setup" />}

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
        custodyMap={custodyMap}
        parentColors={parentColors}
        currentUserId={currentUserId}
        groupId={groupId}
        onDayClick={handleDayClick}
        pendingSwapDates={pendingSwapDates}
        activities={activities}
      />

      {hasCustodyData && (
        <SwapBalanceCard
          balanceByUser={effectiveBalance.effectiveByUser}
          rawBalanceByUser={swapBalance.balanceByUser}
          totalSwapDays={swapBalance.totalSwapDays}
          parentColors={parentColors}
          friendlyConcessions={effectiveBalance.friendlyConcessions}
          lastAgreementDate={effectiveBalance.lastAgreementDate}
          pendingOperations={effectiveBalance.pendingOperations}
          currentUserId={currentUserId}
          groupId={groupId}
          operations={balanceOperations}
        />
      )}

      {hasCustodyData && (
        <WeekendPlanner weekends={weekends} currentUserId={currentUserId} />
      )}

      {hasCustodyData && (
        <SwapRequestList requests={swapRequests} currentUserId={currentUserId} />
      )}

      <BalanceOperationList
        operations={balanceOperations.filter((op) => op.status === "pending")}
        currentUserId={currentUserId}
      />

      <EventRequestList requests={eventRequests} currentUserId={currentUserId} />

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
        activities={activities[dayDetail.dateKey] || []}
        memberNames={memberNames}
        autoExpandEventId={deepLinkEventId || undefined}
      />
    </>
  );
});
