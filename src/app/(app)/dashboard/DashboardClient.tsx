"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useI18n } from "@/i18n/provider";
import { EXPENSE_CATEGORIES, ACTIVITY_CATEGORIES } from "@/lib/constants";
import type { ParentColorMap } from "@/lib/calendar-utils";

const ActivityReportModal = dynamic(() => import("@/app/(app)/atividades/ActivityReportModal"), { ssr: false });
import ShareActivityButton from "@/components/ShareActivityButton";
import CustodyActivationCard from "@/components/CustodyActivationCard";

/* ------------------------------------------------------------------ */
/*  Serializable prop types (no functions, no Supabase, no Date)      */
/* ------------------------------------------------------------------ */

interface SwapAlert {
  id: string;
  requesterName: string;
  dateLabel: string; // e.g. "Seg, 12/3"
  originalDate: string;
}

interface CustodyChild {
  childFirstName: string;
  responsibleName: string;
  isWithMe: boolean;
  endDate: string;
  custodyType: string;
}

interface WeekDay {
  dateKey: string;
  label: string;
  dayNum: number;
  isToday: boolean;
}

interface WeekCustodyEntry {
  dateKey: string;
  responsibleId: string;
  color: string;
}

interface IllnessAlert {
  id: string;
  childName: string;
  title: string;
  daysAgo: number;
  symptoms: string;
}

interface MedicationAlert {
  id: string;
  name: string;
  childName: string;
}

interface AllergyAlert {
  id: string;
  name: string;
  severity: string;
}

interface AppointmentAlert {
  id: string;
  title: string;
  childName: string;
  profName: string;
  timeStr: string;
  isToday: boolean;
  isTomorrow: boolean;
  dateLabel: string; // e.g. "Seg 12/3"
}

interface ActivityItem {
  id: string;
  name: string;
  category: string;
  childName: string;
  timeStr: string;
  location: string;
  checklistItems: string[];
}

interface UpcomingActivityItem {
  act: ActivityItem;
  date: string;
  dayLabel: string;
}

interface PendingExpenseItem {
  id: string;
  description: string;
  amount: number;
  category: string;
  paidByName: string;
  dateLabel: string; // "12/3"
}

interface PendingDecisionItem {
  id: string;
  title: string;
  category: string;
  deadline: string | null;
}

interface PendingReportItem {
  activityId: string;
  activityName: string;
  category: string;
  childName: string;
  occurrenceDate: string;
  dateLabel: string;
  daysAgo: number;
}

interface UpcomingCustodyEvent {
  id: string;
  responsibleId: string;
  isMe: boolean;
  responsibleName: string;
  color: string;
  custodyType: string;
  childName: string;
  notes: string | null;
  dateDayShort: string; // e.g. "seg"
  dateNum: number;
}

interface ChildCard {
  id: string;
  fullName: string;
  firstName: string;
  initial: string;
  age: number;
  birthLabel: string; // "Mar/2020"
  custodyInfo: { responsibleName: string; isWithMe: boolean } | null;
  checkinTitle: string | null;
  checkinIsToday: boolean;
}

export interface DashboardClientProps {
  // Feature flags
  custodyEnabled: boolean;
  groupId: string;
  // Custody schedule
  hasCustody: boolean;
  // Greeting
  greeting: "morning" | "afternoon" | "evening";
  firstName: string;
  formattedDate: string;
  custodySummary: string | null;

  // Swap alerts
  pendingSwaps: SwapAlert[];

  // Hero card
  hasTodayCustody: boolean;
  firstChildName: string | null;
  firstCustody: CustodyChild | null;
  nextSwapLabel: string | null; // e.g. "Seg 12/3 · Ana"
  streakDays: number;
  streakTotal: number;
  otherColor: string;
  myColor: string;
  groupName: string;
  hasChildren: boolean;
  endDateLabel: string;

  // Week strip
  weekDays: WeekDay[];
  weekCustodyMap: WeekCustodyEntry[];
  parentColorEntries: { uid: string; name: string; color: string }[];

  // Health
  hasHealthAlerts: boolean;
  activeIllnesses: IllnessAlert[];
  activeMedications: MedicationAlert[];
  criticalAllergies: AllergyAlert[];
  upcomingAppointments: AppointmentAlert[];

  // Activities
  hasTomorrowActivities: boolean;
  hasTodayActivities: boolean;
  hasUpcomingActivities: boolean;
  tomorrowActivities: ActivityItem[];
  todayActivities: ActivityItem[];
  upcomingActivitiesList: UpcomingActivityItem[];

  // Pending expenses
  pendingExpenses: PendingExpenseItem[];

  // Pending decisions
  pendingDecisions: PendingDecisionItem[];

  // Pending activity reports
  pendingReports: PendingReportItem[];

  // Financial
  balance: number;
  totalMonth: number;
  myTotal: number;
  otherTotal: number;
  otherName: string;

  // Agenda sidebar events
  upcomingEvents: UpcomingCustodyEvent[];

  // Quick actions
  isReadonly: boolean;

  // Children
  childCards: ChildCard[];

  // Swap balance
  mySwapDays: number;

  // Invite
  memberCount: number;

  // Type config for custody labels
  userId: string;
  parentColors: ParentColorMap;

  // Context-aware section ordering (computed server-side)
  visibleSections: string[];
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function DashboardClient(props: DashboardClientProps) {
  const { t } = useI18n();

  const {
    custodyEnabled,
    groupId,
    hasCustody,
    greeting,
    firstName,
    formattedDate,
    custodySummary,
    pendingSwaps,
    hasTodayCustody,
    firstChildName,
    firstCustody,
    nextSwapLabel,
    streakDays,
    streakTotal,
    otherColor,
    myColor,
    groupName,
    hasChildren,
    endDateLabel,
    weekDays,
    weekCustodyMap,
    parentColorEntries,
    hasHealthAlerts,
    activeIllnesses,
    activeMedications,
    criticalAllergies,
    upcomingAppointments,
    hasTomorrowActivities,
    hasTodayActivities,
    hasUpcomingActivities,
    tomorrowActivities,
    todayActivities,
    upcomingActivitiesList,
    pendingExpenses,
    pendingDecisions,
    pendingReports,
    upcomingEvents,
    isReadonly,
    childCards,
    mySwapDays,
    memberCount,
    visibleSections,
  } = props;

  // Activity report modal state
  const [reportModal, setReportModal] = useState<{
    open: boolean;
    activityId: string;
    activityName: string;
    childName: string;
    occurrenceDate: string;
  }>({ open: false, activityId: "", activityName: "", childName: "", occurrenceDate: "" });

  const greetingText =
    greeting === "morning"
      ? t("dashboard.goodMorning")
      : greeting === "afternoon"
        ? t("dashboard.goodAfternoon")
        : t("dashboard.goodEvening");

  // Build weekCustody lookup (memoized to avoid rebuild on every render)
  const weekCustodyLookup = useMemo(() => {
    const lookup: Record<string, { responsibleId: string; color: string }> = {};
    for (const wc of weekCustodyMap) {
      lookup[wc.dateKey] = { responsibleId: wc.responsibleId, color: wc.color };
    }
    return lookup;
  }, [weekCustodyMap]);

  const typeConfig: Record<string, { label: string; color: string }> = useMemo(() => ({
    regular: { label: t("dashboard.typeRegular"), color: "#5B9E85" },
    swap: { label: t("dashboard.typeSwap"), color: "#D4735A" },
    holiday: { label: t("dashboard.typeHoliday"), color: "#8B5CF6" },
    vacation: { label: t("dashboard.typeVacation"), color: "#3B82F6" },
    special: { label: t("dashboard.typeSpecial"), color: "#F59E0B" },
  }), [t]);

  // Memoize decision category lookups (avoids recreating objects on every render)
  const decisionCatIcons: Record<string, string> = useMemo(() => ({
    escola: "\u{1F392}", saude: "\u{1F3E5}", atividade: "\u26BD",
    viagem: "\u2708\uFE0F", financeiro: "\u{1F4B0}", moradia: "\u{1F3E0}", outro: "\u{1F4CB}",
  }), []);
  const decisionCatColors: Record<string, string> = useMemo(() => ({
    escola: "#3B82F6", saude: "#EF4444", atividade: "#22C55E",
    viagem: "#8B5CF6", financeiro: "#F59E0B", moradia: "#5B9E85", outro: "#6B7280",
  }), []);

  // Memoize report category icon lookup
  const reportCatIcons: Record<string, string> = useMemo(() => ({
    esporte: "\u26BD", saude: "\u{1F3E5}", educacao: "\u{1F4DA}", lazer: "\u{1F3AE}",
    arte: "\u{1F3A8}", musica: "\u{1F3B5}", idioma: "\u{1F30D}", terapia: "\u{1F9E0}",
    evento: "\u{1F389}", other: "\u{1F4CB}",
  }), []);

  // Memoize rendered lists that involve .find() or computed logic
  const renderedTomorrowActivities = useMemo(() =>
    tomorrowActivities.map((act) => ({
      ...act,
      catIcon: ACTIVITY_CATEGORIES.find((c) => c.value === act.category)?.icon || "\u{1F4CB}",
    })),
    [tomorrowActivities]
  );

  const renderedTodayActivities = useMemo(() =>
    todayActivities.map((act) => ({
      ...act,
      catIcon: ACTIVITY_CATEGORIES.find((c) => c.value === act.category)?.icon || "\u{1F4CB}",
    })),
    [todayActivities]
  );

  const renderedPendingExpenses = useMemo(() =>
    pendingExpenses.map((exp) => ({
      ...exp,
      catIcon: EXPENSE_CATEGORIES.find((c) => c.value === exp.category)?.icon || "\u{1F4E6}",
    })),
    [pendingExpenses]
  );

  const nowMs = Date.now(); // eslint-disable-line react-hooks/purity
  const renderedPendingDecisions = useMemo(() =>
    pendingDecisions.slice(0, 3).map((dec) => {
      const icon = decisionCatIcons[dec.category] || "\u{1F4CB}";
      const color = decisionCatColors[dec.category] || "#D4735A";
      const hasDeadline = !!dec.deadline;
      let deadlineLabel = "";
      if (hasDeadline) {
        const dl = new Date(dec.deadline + "T23:59:59");
        const daysUntil = Math.ceil((dl.getTime() - nowMs) / 86400000);
        if (daysUntil < 0) deadlineLabel = t("decisions.deadlineExpired");
        else if (daysUntil <= 3) deadlineLabel = t("decisions.deadlineNear");
        else {
          const dlDate = new Date(dec.deadline + "T12:00:00");
          deadlineLabel = dlDate.toLocaleDateString("pt-BR", { day: "numeric", month: "short" });
        }
      }
      return { ...dec, icon, color, deadlineLabel, bgStyle: { backgroundColor: color + "15" } };
    }),
    [pendingDecisions, decisionCatIcons, decisionCatColors, t, nowMs]
  );

  const renderedUpcomingEvents = useMemo(() =>
    upcomingEvents.slice(0, 3).map((event) => {
      const tc = typeConfig[event.custodyType] || typeConfig.regular;
      const responsibleLabel = event.isMe
        ? t("dashboard.withYou")
        : `${t("dashboard.with")} ${event.responsibleName}`;
      const name = event.notes
        ? event.notes
        : event.childName
          ? `${event.childName} ${responsibleLabel}`
          : event.isMe
            ? t("dashboard.withYouCapital")
            : event.responsibleName;
      return {
        ...event,
        tc,
        displayName: name,
        bgStyle: { backgroundColor: event.color + "12" },
        dayStyle: { color: event.color + "99" },
        numStyle: { color: event.color },
        dotStyle: { backgroundColor: event.color },
      };
    }),
    [upcomingEvents, typeConfig, t]
  );

  // Memoize streak bar items to avoid inline style object recreation
  const streakBarItems = useMemo(() => {
    if (streakTotal <= 1 || !firstCustody) return [];
    return Array.from({ length: streakTotal }, (_, i) => ({
      key: i,
      style: {
        backgroundColor: i < streakDays
          ? (firstCustody.isWithMe ? "#D4735A" : otherColor)
          : "rgba(255,255,255,0.15)",
      },
    }));
  }, [streakTotal, streakDays, firstCustody, otherColor]);

  // Context-aware: show max N sections, hide rest behind "Ver mais"
  const MAX_VISIBLE = 7;
  const [showAll, setShowAll] = useState(false);
  const visibleSet = useMemo(() => {
    const shown = showAll ? visibleSections : visibleSections.slice(0, MAX_VISIBLE);
    return new Set(shown);
  }, [visibleSections, showAll]);
  const hasHiddenSections = visibleSections.length > MAX_VISIBLE;

  // Helper: only render section if it's in the visible set
  const show = (id: string) => visibleSet.has(id);

  return (
    <div className="space-y-5 pb-4">

      {/* === GREETING (always visible) === */}
      <div>
        <h1 className="text-[26px] font-bold text-[#2C2C2C] tracking-tight leading-tight">
          {greetingText}, {firstName}
        </h1>
        <p className="text-[13px] text-[#7A8C8B] mt-0.5">
          {formattedDate}
          {custodySummary && <span> &middot; {custodySummary}</span>}
        </p>
      </div>

      {/* === CUSTODY ACTIVATION CARD === */}
      {show("custodyActivation") && !custodyEnabled && memberCount >= 2 && firstChildName && (
        <CustodyActivationCard
          groupId={groupId}
          childName={firstChildName}
          memberCount={memberCount}
        />
      )}

      {/* === PRIORITY ALERTS === */}
      {show("swapAlerts") && custodyEnabled && hasCustody && pendingSwaps.length > 0 && (
        <div className="space-y-2">
          {pendingSwaps.map((swap) => (
            <Link key={swap.id} href="/calendario" prefetch={false} className="block">
              <div className="bg-[#D4735A]/[0.08] border border-[#D4735A]/20 rounded-2xl p-4 flex items-center gap-3">
                <div className="w-10 h-10 bg-[#D4735A]/10 rounded-full flex items-center justify-center flex-shrink-0">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#D4735A" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="17 1 21 5 17 9" /><path d="M3 11V9a4 4 0 014-4h14" /><polyline points="7 23 3 19 7 15" /><path d="M21 13v2a4 4 0 01-4 4H3" />
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-semibold text-[#2C2C2C]">
                    {t("dashboard.swapRequested", { name: swap.requesterName })}
                  </p>
                  <p className="text-[11px] text-[#7A8C8B]">
                    {swap.dateLabel} &middot; {t("dashboard.pending")}
                  </p>
                </div>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </div>
            </Link>
          ))}
        </div>
      )}

      {/* === HERO CARD === */}
      {!show("hero") ? null : !custodyEnabled || !hasCustody ? (
        <div className="rounded-2xl bg-[#2C2C2C] p-5 text-white">
          <h2 className="text-xl font-bold tracking-tight">
            {greetingText}, {firstName}
          </h2>
          <p className="text-white/50 text-[13px] mt-1">{groupName}</p>
          {custodyEnabled && hasChildren && (
            <Link href="/calendario/escala" prefetch={false} className="inline-flex items-center gap-2 mt-4 text-sm font-semibold text-[#2C2C2C] bg-white rounded-xl px-5 py-3 hover:bg-white/90 transition-colors active:scale-[0.98]">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
              </svg>
              {t("dashboard.setupSchedule")}
            </Link>
          )}
        </div>
      ) : hasTodayCustody && firstChildName && firstCustody ? (
        <div className="relative rounded-2xl overflow-hidden bg-[#2C2C2C] p-5 text-white">
          <div className="absolute inset-0 bg-gradient-to-br from-white/[0.04] to-transparent" />
          <div className="relative">
            {/* Top badges */}
            <div className="flex items-center justify-between mb-4">
              <span className="flex items-center gap-1.5 text-[11px] font-semibold bg-white/10 rounded-full px-3 py-1">
                <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                {t("dashboard.activeCustody")}
              </span>
              {nextSwapLabel && (
                <span className="text-[11px] text-white/50 uppercase tracking-wide font-medium">
                  {t("dashboard.nextSwap")}<br />
                  <span className="text-white/80">{nextSwapLabel}</span>
                </span>
              )}
            </div>

            {/* Main info */}
            <h2 className="text-[24px] font-bold tracking-tight leading-tight">
              <span className="text-[#D4735A]">{firstChildName}</span>{" "}
              {t("dashboard.childWith", {
                parent: firstCustody.isWithMe
                  ? t("dashboard.you")
                  : firstCustody.responsibleName,
              })}
            </h2>
            <p className="text-white/50 text-[13px] mt-1">
              {firstChildName} &middot; {endDateLabel}
            </p>

            {/* Progress bar */}
            {streakTotal > 1 && (
              <div className="mt-4">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[10px] text-white/40 uppercase tracking-wider font-medium">
                    {t("dashboard.day")}
                  </span>
                  <span className="text-[11px] text-white/60 font-medium">
                    {t("dashboard.consecutive", { current: streakDays, total: streakTotal })}
                  </span>
                </div>
                <div className="flex gap-1">
                  {streakBarItems.map((item) => (
                    <div
                      key={item.key}
                      className="h-2 rounded-full flex-1"
                      style={item.style}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="rounded-2xl bg-[#2C2C2C] p-5 text-white">
          <div className="flex items-center gap-2 mb-3">
            <span className="w-2 h-2 rounded-full bg-amber-400" />
            <span className="text-[11px] text-white/50 uppercase tracking-wider font-medium">
              {t("dashboard.noSchedule")}
            </span>
          </div>
          <h2 className="text-xl font-bold tracking-tight">
            {greetingText}, {firstName}
          </h2>
          <p className="text-white/50 text-[13px] mt-1">{groupName}</p>
          {hasChildren && !hasTodayCustody && (
            <Link href="/calendario/escala" prefetch={false} className="inline-flex items-center gap-2 mt-4 text-sm font-semibold text-[#2C2C2C] bg-white rounded-xl px-5 py-3 hover:bg-white/90 transition-colors active:scale-[0.98]">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
              </svg>
              {t("dashboard.setupSchedule")}
            </Link>
          )}
        </div>
      )}

      {/* === WEEK STRIP === */}
      {show("weekStrip") && <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100/80">
        <div className="flex justify-between">
          {weekDays.map((day) => {
            const wc = weekCustodyLookup[day.dateKey];
            return (
              <Link
                key={day.dateKey}
                href="/calendario"
                prefetch={false}
                className={`flex flex-col items-center gap-1.5 py-2 px-2 rounded-xl transition-all ${
                  day.isToday ? "bg-[#D4735A] text-white shadow-sm" : "text-[#7A8C8B] hover:bg-gray-50"
                }`}
              >
                <span className={`text-[10px] font-medium uppercase ${day.isToday ? "text-white/70" : ""}`}>
                  {day.label}
                </span>
                <span className={`text-[15px] font-bold ${day.isToday ? "text-white" : "text-[#2C2C2C]"}`}>
                  {day.dayNum}
                </span>
                {custodyEnabled && hasCustody && wc && !day.isToday && (
                  <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: wc.color }} />
                )}
                {day.isToday && <span className="w-1.5 h-1.5 rounded-full bg-white/70" />}
              </Link>
            );
          })}
        </div>
        {custodyEnabled && hasCustody && (
          <div className="flex items-center gap-4 mt-3 pt-2.5 border-t border-gray-100/80">
            {parentColorEntries.map((entry) => (
              <div key={entry.uid} className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: entry.color }} />
                <span className="text-[11px] text-[#7A8C8B] font-medium capitalize">{entry.name}</span>
              </div>
            ))}
          </div>
        )}
      </div>}

      {/* === HEALTH ALERTS === */}
      {show("healthAlerts") && hasHealthAlerts && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-bold text-[#EF4444] uppercase tracking-wider flex items-center gap-1.5">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#EF4444" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 12h-4l-3 9L9 3l-3 9H2"/>
              </svg>
              {t("nav.health")}
            </p>
            <Link href="/saude" prefetch={false} className="text-[10px] font-semibold text-[#D4735A]">
              {t("common.viewAll")}
            </Link>
          </div>

          {/* Active illness episodes */}
          {activeIllnesses.map((illness) => (
            <Link key={illness.id} href="/saude/doencas" prefetch={false} className="block">
              <div className="bg-red-50 border border-red-200/60 rounded-2xl p-3.5 flex items-center gap-3">
                <div className="w-9 h-9 bg-red-100 rounded-full flex items-center justify-center flex-shrink-0">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#EF4444" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 9v4"/><path d="M12 17h.01"/><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-semibold text-[#2C2C2C]">{illness.childName} — {illness.title}</p>
                  <p className="text-[11px] text-[#7A8C8B]">
                    {illness.daysAgo === 0
                      ? t("dashboard.today")
                      : t("dashboard.daysAgo", { count: illness.daysAgo })}
                    {illness.symptoms && <> &middot; {illness.symptoms}</>}
                  </p>
                </div>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
              </div>
            </Link>
          ))}

          {/* Active medications */}
          {activeMedications.length > 0 && (
            <Link href="/saude/medicamentos" prefetch={false} className="block">
              <div className="bg-amber-50 border border-amber-200/60 rounded-2xl p-3.5 flex items-center gap-3">
                <div className="w-9 h-9 bg-amber-100 rounded-full flex items-center justify-center flex-shrink-0">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#F59E0B" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                    <path d="M10.5 1.5H8.25A2.25 2.25 0 006 3.75v16.5a2.25 2.25 0 002.25 2.25h7.5A2.25 2.25 0 0018 20.25V3.75a2.25 2.25 0 00-2.25-2.25H13.5m-3 0V3h3V1.5m-3 0h3"/>
                    <line x1="9" y1="9" x2="15" y2="9"/><line x1="12" y1="6" x2="12" y2="12"/>
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-semibold text-[#2C2C2C]">
                    {t("dashboard.activeMedications", { count: activeMedications.length })}
                  </p>
                  <p className="text-[11px] text-[#7A8C8B] truncate">
                    {activeMedications.slice(0, 2).map((m) => `${m.name} (${m.childName})`).join(", ")}
                  </p>
                </div>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
              </div>
            </Link>
          )}

          {/* Critical allergies */}
          {criticalAllergies.length > 0 && (
            <Link href="/saude/alergias" prefetch={false} className="block">
              <div className="bg-orange-50 border border-orange-200/60 rounded-2xl p-3.5 flex items-center gap-3">
                <div className="w-9 h-9 bg-orange-100 rounded-full flex items-center justify-center flex-shrink-0">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#EA580C" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-semibold text-[#2C2C2C]">
                    {criticalAllergies.some(a => a.severity === "severe")
                      ? t("dashboard.severeAllergy")
                      : t("dashboard.moderateAllergy")}
                  </p>
                  <p className="text-[11px] text-[#7A8C8B] truncate">
                    {criticalAllergies.slice(0, 3).map((a) => a.name).join(", ")}
                  </p>
                </div>
                <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full flex-shrink-0 ${
                  criticalAllergies.some(a => a.severity === "severe")
                    ? "bg-red-100 text-red-700"
                    : "bg-amber-100 text-amber-700"
                }`}>
                  {criticalAllergies.some(a => a.severity === "severe")
                    ? t("dashboard.severe")
                    : t("dashboard.moderate")}
                </span>
              </div>
            </Link>
          )}

          {/* Upcoming appointments */}
          {upcomingAppointments.map((appt) => (
            <Link key={appt.id} href="/saude/consultas" prefetch={false} className="block">
              <div className="bg-blue-50 border border-blue-200/60 rounded-2xl p-3.5 flex items-center gap-3">
                <div className="w-9 h-9 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#3B82F6" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-semibold text-[#2C2C2C]">
                    {appt.title}{appt.childName ? ` — ${appt.childName}` : ""}
                  </p>
                  <p className="text-[11px] text-[#7A8C8B]">
                    {appt.isToday
                      ? t("dashboard.today")
                      : appt.isTomorrow
                        ? t("dashboard.tomorrowLabel")
                        : appt.dateLabel}{" "}
                    {t("dashboard.atTime", { time: appt.timeStr })}
                    {appt.profName && <> &middot; {appt.profName}</>}
                  </p>
                </div>
                {(appt.isToday || appt.isTomorrow) && (
                  <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full flex-shrink-0 ${appt.isToday ? "bg-blue-100 text-blue-700" : "bg-blue-50 text-blue-600"}`}>
                    {appt.isToday ? t("dashboard.todayBadge") : t("dashboard.tomorrowBadge")}
                  </span>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}

      {/* === ACTIVITIES (tomorrow + today) === */}
      {show("activities") && (hasTomorrowActivities || hasTodayActivities) && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-bold text-[#D4735A] uppercase tracking-wider flex items-center gap-1.5">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#D4735A" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
              {t("dashboard.activities")}
            </p>
            <Link href="/atividades" prefetch={false} className="text-[10px] font-semibold text-[#D4735A]">
              {t("dashboard.viewAllFeminine")}
            </Link>
          </div>

          {/* Tomorrow's activities (priority) */}
          {renderedTomorrowActivities.map((act) => {
            return (
              <Link key={act.id} href="/atividades" prefetch={false} className="block">
                <div className="bg-[#D4735A]/[0.06] border border-[#D4735A]/15 rounded-2xl p-3.5 flex items-center gap-3">
                  <div className="w-10 h-10 bg-[#D4735A]/10 rounded-xl flex items-center justify-center flex-shrink-0 text-lg">
                    {act.catIcon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-semibold text-[#2C2C2C]">
                      {t("dashboard.activityTomorrow", { name: act.name })}
                    </p>
                    <p className="text-[11px] text-[#7A8C8B]">
                      {act.childName}{act.timeStr && ` \u00B7 ${act.timeStr}`}{act.location && ` \u00B7 ${act.location}`}
                    </p>
                    {act.checklistItems.length > 0 && (
                      <p className="text-[10px] text-[#D4735A] font-medium mt-0.5">
                        {t("dashboard.prepare")}{" "}
                        {act.checklistItems.slice(0, 3).join(", ")}
                        {act.checklistItems.length > 3 ? ` +${act.checklistItems.length - 3}` : ""}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-[#D4735A]/10 text-[#D4735A]">
                      {t("dashboard.tomorrowBadge")}
                    </span>
                    <ShareActivityButton
                      size="sm"
                      activity={{
                        name: act.name,
                        category: act.category,
                        childName: act.childName,
                        timeStr: act.timeStr || "",
                        location: act.location || "",
                        checklistItems: act.checklistItems,
                        dateLabel: t("dashboard.tomorrowBadge"),
                      }}
                    />
                  </div>
                </div>
              </Link>
            );
          })}

          {/* Today's activities */}
          {renderedTodayActivities.map((act) => {
            return (
              <Link key={act.id} href="/atividades" prefetch={false} className="block">
                <div className="bg-primary/[0.06] border border-primary/15 rounded-2xl p-3.5 flex items-center gap-3">
                  <div className="w-10 h-10 bg-primary/10 rounded-xl flex items-center justify-center flex-shrink-0 text-lg">
                    {act.catIcon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-semibold text-[#2C2C2C]">
                      {t("dashboard.activityToday", { name: act.name })}
                    </p>
                    <p className="text-[11px] text-[#7A8C8B]">
                      {act.childName}{act.timeStr && ` \u00B7 ${act.timeStr}`}{act.location && ` \u00B7 ${act.location}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                      {t("dashboard.todayBadge")}
                    </span>
                    <ShareActivityButton
                      size="sm"
                      activity={{
                        name: act.name,
                        category: act.category,
                        childName: act.childName,
                        timeStr: act.timeStr || "",
                        location: act.location || "",
                        checklistItems: [],
                        dateLabel: t("dashboard.todayBadge"),
                      }}
                    />
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}

      {/* === PENDING EXPENSES AWAITING APPROVAL === */}
      {show("pendingExpenses") && pendingExpenses.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-bold text-[#D4735A] uppercase tracking-wider flex items-center gap-1.5">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#D4735A" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
              </svg>
              {t("dashboard.expensesToApprove")}
            </p>
            <Link href="/despesas" prefetch={false} className="text-[10px] font-semibold text-[#D4735A]">
              {t("dashboard.viewAllFeminine")}
            </Link>
          </div>
          {renderedPendingExpenses.map((exp) => {
            return (
              <Link key={exp.id} href="/despesas" prefetch={false} className="block">
                <div className="bg-[#D4735A]/[0.06] border border-[#D4735A]/15 rounded-2xl p-3.5 flex items-center gap-3">
                  <div className="w-9 h-9 bg-[#D4735A]/10 rounded-full flex items-center justify-center flex-shrink-0 text-lg">
                    {exp.catIcon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-semibold text-[#2C2C2C] truncate">{exp.description}</p>
                    <p className="text-[11px] text-[#7A8C8B]">{exp.paidByName} &middot; {exp.dateLabel}</p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-[14px] font-bold text-[#2C2C2C]">R$ {exp.amount.toFixed(2)}</p>
                    <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-[#D4735A]/10 text-[#D4735A]">
                      {t("dashboard.pendingBadge")}
                    </span>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}

      {/* === PENDING DECISIONS === */}
      {show("pendingDecisions") && pendingDecisions.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-bold text-[#D4735A] uppercase tracking-wider flex items-center gap-1.5">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#D4735A" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/>
              </svg>
              {t("dashboard.pendingDecisions")}
            </p>
            <Link href="/decisoes" prefetch={false} className="text-[10px] font-semibold text-[#D4735A]">
              {t("common.viewAll")}
            </Link>
          </div>
          {renderedPendingDecisions.map((dec) => {
            return (
              <Link key={dec.id} href={`/decisoes?tab=abertas&open=${dec.id}`} prefetch={false} className="block">
                <div className="bg-amber-50/60 border border-amber-200/60 rounded-2xl p-3.5 flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 text-lg" style={dec.bgStyle}>
                    {dec.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-semibold text-[#2C2C2C] truncate">{dec.title}</p>
                    {dec.deadlineLabel && (
                      <p className="text-[11px] text-[#7A8C8B]">{dec.deadlineLabel}</p>
                    )}
                  </div>
                  <span className="text-[9px] font-bold px-2.5 py-1 rounded-full bg-[#D4735A] text-white flex-shrink-0">
                    {t("dashboard.voteNow")}
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      )}

      {/* === PENDING ACTIVITY REPORTS === */}
      {show("pendingReports") && pendingReports.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-bold text-[#D4735A] uppercase tracking-wider flex items-center gap-1.5">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#D4735A" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>
              </svg>
              {t("activityReport.pendingReports")}
            </p>
            <Link href="/atividades" prefetch={false} className="text-[10px] font-semibold text-[#D4735A]">
              {t("common.viewAll")}
            </Link>
          </div>
          {pendingReports.slice(0, 3).map((pr) => {
            const icon = reportCatIcons[pr.category] || "\u{1F4CB}";
            return (
              <button
                key={`${pr.activityId}-${pr.occurrenceDate}`}
                onClick={() => setReportModal({
                  open: true,
                  activityId: pr.activityId,
                  activityName: pr.activityName,
                  childName: pr.childName,
                  occurrenceDate: pr.occurrenceDate,
                })}
                className="block w-full text-left"
              >
                <div className="bg-amber-50/60 border border-amber-200/60 rounded-2xl p-3.5 flex items-center gap-3 hover:bg-amber-50 transition-colors">
                  <div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 text-lg bg-amber-100/60">
                    {icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-semibold text-[#2C2C2C] truncate">{pr.activityName}</p>
                    <p className="text-[11px] text-[#7A8C8B]">
                      {pr.childName} &middot; {pr.dateLabel}
                      {pr.daysAgo > 0 && ` (${t("activityReport.daysAgo", { count: pr.daysAgo })})`}
                    </p>
                  </div>
                  <span className="text-[9px] font-bold px-2.5 py-1 rounded-full bg-amber-500 text-white flex-shrink-0">
                    {t("activityReport.reportNow")}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* === AGENDA (full width) === */}
      {show("agenda") && <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100/80">
          <div className="flex items-center justify-between mb-2">
            <p className="text-[10px] font-semibold text-[#9CA3AF] uppercase tracking-wider">
              {t("dashboard.agenda")}
            </p>
            <Link href="/calendario" prefetch={false} className="text-[10px] font-semibold text-[#D4735A]">
              {t("dashboard.viewMore")}
            </Link>
          </div>
          {(upcomingEvents.length > 0) || hasTodayActivities || hasTomorrowActivities || hasUpcomingActivities ? (
            <div className="space-y-2.5">
              {/* Custody events */}
              {renderedUpcomingEvents.map((event) => (
                  <Link key={event.id} href="/calendario" prefetch={false} className="flex items-center gap-2.5">
                    <div className="w-10 h-10 rounded-xl flex flex-col items-center justify-center flex-shrink-0" style={event.bgStyle}>
                      <span className="text-[9px] font-bold uppercase leading-none" style={event.dayStyle}>
                        {event.dateDayShort}
                      </span>
                      <span className="text-[14px] font-bold leading-tight" style={event.numStyle}>{event.dateNum}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-[#2C2C2C] text-[13px] truncate">{event.displayName}</p>
                      <p className="text-[10px] font-medium" style={{ color: event.tc.color }}>{event.tc.label}</p>
                    </div>
                    <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={event.dotStyle} />
                  </Link>
              ))}

              {/* Today's activities in agenda */}
              {renderedTodayActivities.slice(0, 2).map((act) => (
                  <Link key={`act-today-${act.id}`} href="/atividades" prefetch={false} className="flex items-center gap-2.5">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 bg-primary/10 text-base">
                      {act.catIcon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-[#2C2C2C] text-[13px] truncate">{act.name}</p>
                      <p className="text-[10px] text-[#7A8C8B]">{act.childName}{act.timeStr && ` \u00B7 ${act.timeStr}`}</p>
                    </div>
                    <span className="text-[8px] font-bold px-1.5 py-0.5 rounded-full bg-primary/10 text-primary flex-shrink-0">
                      {t("dashboard.todayBadge")}
                    </span>
                  </Link>
              ))}

              {/* Tomorrow's activities in agenda */}
              {renderedTomorrowActivities.slice(0, 2).map((act) => (
                  <Link key={`act-tmrw-${act.id}`} href="/atividades" prefetch={false} className="flex items-center gap-2.5">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 bg-[#D4735A]/10 text-base">
                      {act.catIcon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-[#2C2C2C] text-[13px] truncate">{act.name}</p>
                      <p className="text-[10px] text-[#7A8C8B]">{act.childName}{act.timeStr && ` \u00B7 ${act.timeStr}`}</p>
                    </div>
                    <span className="text-[8px] font-bold px-1.5 py-0.5 rounded-full bg-[#D4735A]/10 text-[#D4735A] flex-shrink-0">
                      {t("dashboard.tomorrowBadge")}
                    </span>
                  </Link>
              ))}

              {/* Upcoming activities (next 7 days) */}
              {!hasTodayActivities && !hasTomorrowActivities && upcomingActivitiesList.slice(0, 2).map(({ act, dayLabel }) => {
                const catIcon = ACTIVITY_CATEGORIES.find((c) => c.value === act.category)?.icon || "\u{1F4CB}";
                return (
                  <Link key={`act-up-${act.id}`} href="/atividades" prefetch={false} className="flex items-center gap-2.5">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 bg-[#D4735A]/10 text-base">
                      {catIcon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-[#2C2C2C] text-[13px] truncate">{act.name}</p>
                      <p className="text-[10px] text-[#7A8C8B]">{act.childName}{act.timeStr && ` \u00B7 ${act.timeStr}`}</p>
                    </div>
                    <span className="text-[8px] font-bold px-1.5 py-0.5 rounded-full bg-gray-100 text-[#7A8C8B] flex-shrink-0">{dayLabel}</span>
                  </Link>
                );
              })}
            </div>
          ) : (
            <p className="text-[12px] text-[#9CA3AF]">{t("dashboard.noEvents")}</p>
          )}
      </div>}

      {/* === QUICK ACTIONS === */}
      {show("quickActions") && !isReadonly && (
      <div>
        <p className="text-[10px] font-semibold text-[#9CA3AF] uppercase tracking-wider mb-3">
          {t("dashboard.quickActions")}
        </p>

        {/* Primary action - New expense */}
        <Link href="/despesas/nova" prefetch={false} className="block mb-3">
          <div className="bg-[#D4735A] rounded-2xl p-4 flex items-center gap-3 shadow-sm hover:bg-[#D4623E] transition-colors active:scale-[0.99]">
            <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center flex-shrink-0">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
              </svg>
            </div>
            <div className="flex-1">
              <p className="text-[15px] font-bold text-white">{t("dashboard.newExpense")}</p>
              <p className="text-[11px] text-white/70">{t("dashboard.registerSharedExpense")}</p>
            </div>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="opacity-50">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </div>
        </Link>

        {/* Secondary actions */}
        <div className="grid grid-cols-3 gap-2.5">
          <QuickAction label={t("dashboard.agenda")} href="/calendario" color="#5B9E85"
            icon={<><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></>}
          />
          <QuickAction label="Check-in" href="/checkin" color="#3B82F6"
            icon={<><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></>}
          />
          <QuickAction label={t("nav.documents")} href="/documentos" color="#F59E0B"
            icon={<><path d="M13 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V9z"/><polyline points="13 2 13 9 20 9"/></>}
          />
          <QuickAction label={t("nav.sectionFinancial")} href="/financeiro" color="#5B9E85"
            icon={<><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></>}
          />
          <QuickAction label={t("nav.agreements")} href="/acordos" color="#F59E0B"
            icon={<><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></>}
          />
          <QuickAction label={t("nav.health")} href="/saude" color="#EF4444"
            icon={<path d="M22 12h-4l-3 9L9 3l-3 9H2"/>}
          />
        </div>
      </div>
      )}

      {/* === CHILDREN === */}
      {show("childCards") && childCards.length > 0 && (
        <div className="space-y-3">
          {childCards.map((child) => (
            <Link key={child.id} href={`/criancas/${child.id}`} prefetch={false} className="block bg-white rounded-2xl p-4 shadow-sm border border-gray-100/80">
              {/* Header */}
              <div className="flex items-center gap-3 mb-3">
                <div className="w-12 h-12 bg-[#FFF3E0] rounded-full flex items-center justify-center flex-shrink-0">
                  <span className="text-[22px] font-bold text-[#D4735A]">
                    {child.initial}
                  </span>
                </div>
                <div>
                  <p className="font-bold text-[#2C2C2C] text-[15px]">{child.firstName}</p>
                  <p className="text-[11px] text-[#9CA3AF]">
                    {child.age} {child.age === 1 ? t("dashboard.yearOld") : t("dashboard.yearsOld")} &middot; {t("dashboard.bornIn")} {child.birthLabel}
                  </p>
                </div>
              </div>

              {/* Info rows */}
              <div className="space-y-2">
                {child.custodyInfo && (
                  <div className="flex items-center justify-between bg-[#EEECEA] rounded-xl px-3 py-2.5">
                    <div className="flex items-center gap-2">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={child.custodyInfo.isWithMe ? myColor : otherColor} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                        <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>
                      </svg>
                      <span className="text-[13px] text-[#2C2C2C]">
                        {t("dashboard.todayWith", {
                          name: child.custodyInfo.isWithMe
                            ? t("dashboard.you")
                            : child.custodyInfo.responsibleName,
                        })}
                      </span>
                    </div>
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-[#5B9E85]/10 text-[#5B9E85]">
                      {t("dashboard.active")}
                    </span>
                  </div>
                )}

                {child.checkinTitle && (
                  <div className="flex items-center justify-between bg-[#EEECEA] rounded-xl px-3 py-2.5">
                    <div className="flex items-center gap-2">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                        <path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>
                      </svg>
                      <span className="text-[13px] text-[#2C2C2C] truncate">{child.checkinTitle}</span>
                    </div>
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-[#7A8C8B]/10 text-[#7A8C8B]">
                      {child.checkinIsToday ? t("dashboard.today") : t("dashboard.yesterday")}
                    </span>
                  </div>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}

      {/* === SWAP BALANCE === */}
      {show("swapBalance") && custodyEnabled && hasCustody && <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100/80 flex items-center justify-between">
        <span className="text-[13px] text-[#7A8C8B]">{t("dashboard.swapBalance")}</span>
        <div className="text-right">
          <p className="text-xl font-bold text-[#2C2C2C]">
            {mySwapDays >= 0 ? "+" : ""}{mySwapDays}{" "}
            {Math.abs(mySwapDays) === 1 ? t("calendar.day") : t("calendar.days")}
          </p>
          {mySwapDays === 0 ? (
            <p className="text-[11px] text-emerald-600 font-medium">{t("dashboard.upToDate")} &#10003;</p>
          ) : mySwapDays > 0 ? (
            <p className="text-[11px] text-[#D4735A] font-medium">{t("dashboard.inYourFavor")}</p>
          ) : (
            <p className="text-[11px] text-amber-600 font-medium">{t("dashboard.youOweDays")}</p>
          )}
        </div>
      </div>}

      {/* === SHOW MORE === */}
      {hasHiddenSections && !showAll && (
        <button
          onClick={() => setShowAll(true)}
          className="w-full py-3 text-[13px] font-semibold text-[#D4735A] bg-white rounded-2xl shadow-sm border border-gray-100/80 hover:bg-gray-50 transition-colors"
        >
          {t("common.viewAll")} ({visibleSections.length - MAX_VISIBLE} {t("dashboard.moreSections")})
        </button>
      )}

      {/* === INVITE CO-PARENT === */}
      {show("invite") && memberCount < 2 && (
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100/80 text-center">
          <div className="w-14 h-14 bg-[#2C2C2C]/[0.06] rounded-2xl flex items-center justify-center mx-auto mb-3">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#2C2C2C" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
              <path d="M16 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="20" y1="8" x2="20" y2="14"/><line x1="23" y1="11" x2="17" y2="11"/>
            </svg>
          </div>
          <h3 className="text-[15px] font-bold text-[#2C2C2C] mb-1">{t("dashboard.inviteTitle")}</h3>
          <p className="text-[#7A8C8B] text-[13px] mb-4">{t("dashboard.inviteDescription")}</p>
          <Link href="/convite/enviar" prefetch={false} className="inline-block px-6 py-2.5 bg-[#2C2C2C] text-white font-semibold rounded-xl hover:bg-[#0D2525] transition-colors text-sm">
            {t("dashboard.sendInvite")}
          </Link>
        </div>
      )}

      {/* Activity Report Modal */}
      <ActivityReportModal
        isOpen={reportModal.open}
        onClose={() => setReportModal({ open: false, activityId: "", activityName: "", childName: "", occurrenceDate: "" })}
        activityId={reportModal.activityId}
        activityName={reportModal.activityName}
        childName={reportModal.childName}
        occurrenceDate={reportModal.occurrenceDate}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  QuickAction helper                                                 */
/* ------------------------------------------------------------------ */

function QuickAction({ label, href, color, icon }: { label: string; href: string; color: string; icon: React.ReactNode }) {
  return (
    <Link
      href={href}
      prefetch={false}
      className="flex flex-col items-center justify-center gap-2 bg-white rounded-2xl p-3 border border-gray-100/80 hover:shadow-sm transition-all active:scale-95 min-h-[76px]"
    >
      <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ backgroundColor: color + "10" }}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
          {icon}
        </svg>
      </div>
      <span className="text-[11px] font-medium text-[#2C2C2C]">{label}</span>
    </Link>
  );
}
