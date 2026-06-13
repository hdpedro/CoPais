"use client";

import { useMemo, useState, useEffect } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useI18n } from "@/i18n/provider";
import ChildAvatarWeb from "@/components/ui/ChildAvatarWeb";
import { ACTIVITY_CATEGORIES } from "@/lib/constants";
import type { ParentColorMap } from "@/lib/calendar-utils";
import { trackEvent, EVENTS } from "@/lib/analytics";

const QuickActionsModal = dynamic(() => import("@/components/QuickActionsModal"), { ssr: false });
// ShareActivityButton removed — activities section simplified
import CustodyActivationCard from "@/components/CustodyActivationCard";
import RoutineTodayCard, { type HeroCustodyContext, type HeroFamilyDayContext } from "./RoutineTodayCard";
import type { RoutineToday } from "@/lib/care-routine-resolve";
import type { JourneyItem } from "@/lib/care-routine-journey";
import BriefingAttention from "./BriefingAttention";
import { selectHeroKind, type AttentionItem } from "@/lib/briefing";
import { QUICK_ACTIONS_CATALOG, DEFAULT_QUICK_ACTIONS, type QuickActionDef } from "@/lib/constants";
import OnboardingChecklist from "@/components/OnboardingChecklist";

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
  photoUrl: string | null;
  age: number;
  birthLabel: string; // "Mar/2020"
  custodyInfo: { responsibleName: string; isWithMe: boolean } | null;
  checkinTitle: string | null;
  checkinIsToday: boolean;
}

interface ChildHealthSummary {
  childId: string;
  childName: string;
  childPhotoUrl: string | null;
  status: "healthy" | "monitoring" | "treatment";
  statusLabel: string;
  detail: string;
  activeMedication: string | null;
  nextAction: string | null;
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
  // Herói de guarda agregado: 1 filho (single), todos com o mesmo
  // responsável (together) ou divididos entre responsáveis (split).
  custodyHero:
    | { mode: "single" | "together"; responsibleName: string; isWithMe: boolean; childName: string | null; showStreak: boolean }
    | { mode: "split"; groups: { responsibleName: string; isWithMe: boolean; colorHex: string; childNames: string[] }[] }
    | null;

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
  quickActionsConfig: { primary: string; secondary: string[] } | null;

  // Children
  childCards: ChildCard[];

  // Swap balance
  mySwapDays: number;

  // Health block
  childHealthSummaries: ChildHealthSummary[];
  childHealthOverflow: number;
  hasAnyCriticalChild: boolean;

  // Invite
  memberCount: number;

  // Onboarding
  onboardingStep: number;

  // Deep link dates
  todayDate: string;
  tomorrowDate: string;

  // Type config for custody labels
  userId: string;
  parentColors: ParentColorMap;

  // Context-aware section ordering (computed server-side)
  visibleSections: string[];

  // Collab Foundation — Fase 1. Unread count of school_logs for the
  // current user, used to surface "Escola · N novos" when > 0.
  schoolUnreadCount: number;
  // Fase 1B. Unread count of expenses (status pending / cancel_pending)
  // que precisam de atenção do user.
  expensesUnreadCount: number;
  // Fase 3 (migration 00080). Unread count agregado dos 5 record_types
  // de Saúde — consultas, doenças, medicamentos, alergias, vacinas.
  // Tile consolidada "Saúde · N novos" no dashboard.
  saudeUnreadCount: number;

  // === SAÚDE PREVENTIVA (Motor de Vacinas — migration 00082) ===
  // Pendências reais agregadas (overdue + due_soon) somando todas crianças do grupo.
  // Tile separada da saudeUnread porque essa é AÇÃO (motor), aquela é AWARENESS.
  vaccinePendingCount: number;
  vaccineNextDue: { dueDate: string; vaccineName: string } | null;

  // === ROTINA DE LEVA & BUSCA (migrations 00112-00114) ===
  // Rotina de hoje já resolvida server-side (quem leva / quem busca) + a forma
  // da família (drives onde o card aparece) + se há rotina montada (empty-state).
  routineToday: RoutineToday;
  routineArrangement: "rotating" | "together" | "single" | "custom";
  hasRoutineSlots: boolean;
  // Trocas de hoje + ciência bilateral (Foundation collab care_routine_override).
  routineCaregivers: { id: string; name: string }[];
  routineAwaitingTheirAck: boolean;
  routinePendingAck: { fromName: string; overrideIds: string[] } | null;
  // "Buscou?" (Fase 2): status registrado por "childId:leg" hoje (done/missed).
  routineLogsToday: Record<string, "done" | "missed">;
  // Briefing in-app "Amanhã" (Fase 2): resumo compacto da rotina de amanhã.
  routineTomorrowSummary: string | null;
  heroTimeline: JourneyItem[];
  /** Pais separados: contexto do Herói de Guarda universal (null = rotina). */
  custodyContext: HeroCustodyContext | null;
  /** Família intacta/solo: voz de presença pro arco quando não há rotina. */
  familyDayContext: HeroFamilyDayContext | null;
  // Briefing v2.0 — "Sua Atenção": régua já priorizada no server (composeAttention).
  briefingAttention: AttentionItem[];
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
    // (firstCustody/nextSwapLabel/streakDays/streakTotal/endDateLabel seguem
    //  no contrato de props — o card universal recebe via custodyContext.)
    otherColor,
    myColor,
    groupName,
    hasChildren,
    custodyHero,
    routineToday,
    routineArrangement,
    hasRoutineSlots,
    routineCaregivers,
    routineAwaitingTheirAck,
    routinePendingAck,
    routineLogsToday,
    routineTomorrowSummary,
    heroTimeline,
    custodyContext,
    familyDayContext,
    briefingAttention,
    // weekDays, weekCustodyMap, parentColorEntries — removed with weekStrip
    // hasHealthAlerts, activeIllnesses, activeMedications, criticalAllergies, upcomingAppointments — replaced by healthBlock
    hasTomorrowActivities,
    hasTodayActivities,
    // hasUpcomingActivities, upcomingActivitiesList — removed, only today+tomorrow shown
    tomorrowActivities,
    todayActivities,
    // pendingExpenses, pendingDecisions, pendingReports — movidos pra Sua Atenção
    // upcomingEvents — removed with agenda
    isReadonly,
    childCards,
    // mySwapDays — removed with swapBalance
    childHealthSummaries,
    childHealthOverflow,
    hasAnyCriticalChild,
    memberCount,
    onboardingStep,
    todayDate,
    tomorrowDate,
    visibleSections,
    quickActionsConfig,
    schoolUnreadCount,
    expensesUnreadCount,
    saudeUnreadCount,
    vaccinePendingCount,
    vaccineNextDue,
  } = props;

  // Snapshot the user's unread state on each dashboard mount. PostHog
  // groups same-value events into a single funnel step, so this gives
  // "% of days a user had pending context" without instrumenting every screen.
  useEffect(() => {
    trackEvent(EVENTS.UNREAD_COUNT, { record_type: "school_log", count: schoolUnreadCount });
  }, [schoolUnreadCount]);
  useEffect(() => {
    trackEvent(EVENTS.UNREAD_COUNT, { record_type: "expense", count: expensesUnreadCount });
  }, [expensesUnreadCount]);
  useEffect(() => {
    // Single aggregate event pra Saúde — não emitimos 5 (um por record_type)
    // porque a UI tem 1 tile só. Dashboard com 5 eventos por mount infla
    // o PostHog ingest sem ganho analítico relevante na Fase 3.
    trackEvent(EVENTS.UNREAD_COUNT, { record_type: "saude_aggregate", count: saudeUnreadCount });
  }, [saudeUnreadCount]);

  // Resolve quick actions from user config or defaults
  const qaConfig = quickActionsConfig ?? { primary: DEFAULT_QUICK_ACTIONS.primary, secondary: [...DEFAULT_QUICK_ACTIONS.secondary] };
  const catalogMap: Record<string, QuickActionDef> = Object.fromEntries(QUICK_ACTIONS_CATALOG.map((a) => [a.id, a]));
  const primaryAction = catalogMap[qaConfig.primary] ?? catalogMap[DEFAULT_QUICK_ACTIONS.primary];
  const secondaryActions = qaConfig.secondary
    .filter((id) => id !== qaConfig.primary && catalogMap[id])
    .map((id) => catalogMap[id])
    .slice(0, 6);

  const [showQAModal, setShowQAModal] = useState(false);

  const greetingText =
    greeting === "morning"
      ? t("dashboard.goodMorning")
      : greeting === "afternoon"
        ? t("dashboard.goodAfternoon")
        : t("dashboard.goodEvening");

  // decisionCatIcons/decisionCatColors/reportCatIcons \u2014 movidos pra Sua Aten\u00E7\u00E3o (lookups das se\u00E7\u00F5es unificadas)

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

  // renderedPendingExpenses / renderedPendingDecisions — movidos pra Sua Atenção

  // nowMs ainda é usado pelo tile de vacina (cálculo de dias até a próxima dose).
  const nowMs = Date.now(); // eslint-disable-line react-hooks/purity

  // UM herói por forma de família ("é um OU outro" — dono 10/jun): rotating
  // com guarda hoje → Herói de Guarda; together/single (ou rotating sem guarda
  // resolvida hoje) → card da Rotina com o arco. Nunca os dois empilhados.
  const heroKind = selectHeroKind({
    arrangement: routineArrangement,
    hasCustody: hasTodayCustody && !!custodyHero,
    hasRoutineSlots,
  });

  // (streakBarItems do herói antigo removido no cutover — a contagem vive no
  //  ritmo da semana do card universal: "3 de 7 consecutivos".)

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
    <div className="space-y-6 pb-4">

      {/* === GREETING (always visible) — editorial premium (Cormorant) === */}
      <div className="pt-1">
        <h1 className="font-display text-[32px] font-semibold text-[#2A2622] tracking-tight leading-[1.04]">
          {greetingText}, {firstName}
        </h1>
        <p className="text-[12.5px] text-[#9A8878] mt-1">
          {formattedDate}
          {custodySummary && <span> &middot; {custodySummary}</span>}
        </p>
      </div>

      {/* === ONBOARDING CHECKLIST === */}
      {onboardingStep < 4 && (
        <OnboardingChecklist
          step={onboardingStep}
          hasGroup={onboardingStep >= 1}
          hasChild={onboardingStep >= 2}
          hasInvite={onboardingStep >= 3}
        />
      )}

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

      {/* === HERO CARD === Herói de GUARDA (rotating/custom). together/single
           não têm seção hero (hasData=false no server) → o arco vem da seção
           careRoutine logo abaixo. */}
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
      ) : heroKind === "custody" && custodyContext ? (
        /* HERÓI DE GUARDA UNIVERSAL (cutover, dono 10/jun): o mesmo card dark
           premium da rotina, em modo guarda — voz com perspectiva + badge +
           arco com casas de guarda + ritmo da semana + próxima troca. O JSX
           do herói antigo vive no git (rollback = revert deste commit). */
        <RoutineTodayCard
          routineToday={routineToday}
          arrangement={routineArrangement}
          hasRoutineSlots={hasRoutineSlots}
          groupId={groupId}
          todayDate={todayDate}
          caregivers={routineCaregivers}
          awaitingTheirAck={routineAwaitingTheirAck}
          pendingAck={routinePendingAck}
          logsToday={routineLogsToday}
          tomorrowSummary={routineTomorrowSummary}
          dayCalm={briefingAttention.length === 0}
          heroTimeline={heroTimeline}
          custodyContext={custodyContext}
        />
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

      {/* === ROTINA DE LEVA & BUSCA / DIA EM FAMÍLIA — herói pra together/single
           (e complemento pra rotating sem guarda). familyDayContext só com evento
           hoje → arco + voz de presença; sem evento → empty-state ensina a montar
           rotina. "O herói é bonito demais pra ficar escondido" (dono 13/jun). === */}
      {show("careRoutine") && heroKind !== "custody" && (
        <RoutineTodayCard
          routineToday={routineToday}
          arrangement={routineArrangement}
          hasRoutineSlots={hasRoutineSlots}
          groupId={groupId}
          todayDate={todayDate}
          caregivers={routineCaregivers}
          awaitingTheirAck={routineAwaitingTheirAck}
          pendingAck={routinePendingAck}
          logsToday={routineLogsToday}
          tomorrowSummary={routineTomorrowSummary}
          dayCalm={briefingAttention.length === 0}
          heroTimeline={heroTimeline}
          familyDayContext={!hasRoutineSlots ? familyDayContext : null}
        />
      )}

      {/* === SUA ATENÇÃO (Briefing v2.0) — régua UNIFICADA ===
           Consolida o que antes vivia em 6 seções soltas (novidades de
           escola/despesa/saúde, despesas a aprovar, votos, relatos pendentes e
           reforços de vacina). Ungated (como o tile de vacina): aparece sempre
           que há item; ordem priorizada pelo motor (src/lib/briefing.ts). */}
      {briefingAttention.length > 0 && <BriefingAttention items={briefingAttention} />}

      {/* === CHILDREN === */}
      {show("childCards") && childCards.length > 0 && (
        <div className="space-y-3">
          {childCards.map((child) => (
            <Link key={child.id} href={`/criancas/${child.id}`} prefetch={false} className="block bg-white rounded-2xl p-4 shadow-sm border border-gray-100/80">
              {/* Header */}
              <div className="flex items-center gap-3 mb-3">
                <ChildAvatarWeb photoUrl={child.photoUrl} firstName={child.firstName} size={48} />
                <div>
                  <p className="font-display font-semibold text-[#2A2622] text-[18px] leading-tight">{child.firstName}</p>
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

      {/* === HEALTH BLOCK (per-child summary) === */}
      {show("healthBlock") && childHealthSummaries.length > 0 && (
        <div className={`rounded-2xl p-4 shadow-sm border ${hasAnyCriticalChild ? "border-red-200/60 bg-red-50/30" : "border-gray-100/80 bg-white"}`}>
          <div className="flex items-center justify-between mb-3">
            <p className="text-[10px] font-bold text-[#7A8C8B] uppercase tracking-wider flex items-center gap-1.5">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={hasAnyCriticalChild ? "#EF4444" : "#5B9E85"} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 12h-4l-3 9L9 3l-3 9H2"/>
              </svg>
              {t("nav.health")}
            </p>
            <Link href="/saude" prefetch={false} className="text-[10px] font-semibold text-[#D4735A]">
              {t("common.viewAll")}
            </Link>
          </div>
          <div className="space-y-2.5">
            {childHealthSummaries.map((child) => {
              const statusColors = {
                healthy: { bg: "bg-emerald-50", border: "border-emerald-200/60", dot: "bg-emerald-500", text: "text-emerald-700" },
                monitoring: { bg: "bg-amber-50", border: "border-amber-200/60", dot: "bg-amber-500", text: "text-amber-700" },
                treatment: { bg: "bg-red-50", border: "border-red-200/60", dot: "bg-red-500", text: "text-red-700" },
              };
              const colors = statusColors[child.status];
              return (
                <Link key={child.childId} href={`/saude?child=${child.childId}`} prefetch={false} className="block">
                  <div className={`${colors.bg} ${colors.border} border rounded-xl p-3 flex items-center gap-3`}>
                    <ChildAvatarWeb photoUrl={child.childPhotoUrl} firstName={child.childName} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className={`w-1.5 h-1.5 rounded-full ${colors.dot}`} />
                        <p className="font-display text-[15px] font-semibold text-[#2A2622]">{child.childName}</p>
                        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${colors.bg} ${colors.text} ml-auto`}>
                          {child.statusLabel}
                        </span>
                      </div>
                      <p className="text-[11px] text-[#7A8C8B] mt-0.5 truncate">{child.detail}</p>
                    </div>
                    {child.nextAction && (
                      <span className="text-[9px] font-bold px-2 py-1 rounded-lg bg-white shadow-sm text-[#D4735A] flex-shrink-0 whitespace-nowrap">
                        {child.nextAction}
                      </span>
                    )}
                  </div>
                </Link>
              );
            })}
            {childHealthOverflow > 0 && (
              <Link href="/saude" prefetch={false} className="block text-center py-1.5">
                <span className="text-[11px] font-semibold text-[#D4735A]">+{childHealthOverflow} crianças</span>
              </Link>
            )}
          </div>
        </div>
      )}

      {/* === ACTIVITIES (today + tomorrow only) === */}
      {show("activities") && (hasTodayActivities || hasTomorrowActivities) && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-bold text-[#D4735A] uppercase tracking-wider flex items-center gap-1.5">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#D4735A" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
              </svg>
              {t("dashboard.activities")}
            </p>
            <Link href="/atividades" prefetch={false} className="text-[10px] font-semibold text-[#D4735A]">
              {t("dashboard.viewAllFeminine")}
            </Link>
          </div>

          {/* Today */}
          {hasTodayActivities && (
            <>
              <p className="text-[10px] font-semibold text-[#5B9E85] uppercase tracking-wider pt-1">{t("dashboard.todayBadge")}</p>
              {renderedTodayActivities.map((act) => (
                <Link key={`today-${act.id}`} href={`/calendario?day=${todayDate}&eventId=${act.id}`} prefetch={false} className="block">
                  <div className="bg-white border border-gray-100/80 rounded-xl p-3 flex items-center gap-3">
                    <div className="w-9 h-9 bg-primary/10 rounded-lg flex items-center justify-center flex-shrink-0 text-base">
                      {act.catIcon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-semibold text-[#2C2C2C] truncate">{act.name}</p>
                      <p className="text-[11px] text-[#7A8C8B]">
                        {act.timeStr && <span className="font-medium text-[#2C2C2C]">{act.timeStr}</span>}
                        {act.childName && <> &middot; {act.childName}</>}
                        {act.location && <> &middot; {act.location}</>}
                      </p>
                    </div>
                  </div>
                </Link>
              ))}
            </>
          )}

          {/* Tomorrow */}
          {hasTomorrowActivities && (
            <>
              <p className="text-[10px] font-semibold text-[#D4735A] uppercase tracking-wider pt-1">{t("dashboard.tomorrowBadge")}</p>
              {renderedTomorrowActivities.map((act) => (
                <Link key={`tmrw-${act.id}`} href={`/calendario?day=${tomorrowDate}&eventId=${act.id}`} prefetch={false} className="block">
                  <div className="bg-white border border-gray-100/80 rounded-xl p-3 flex items-center gap-3">
                    <div className="w-9 h-9 bg-[#D4735A]/10 rounded-lg flex items-center justify-center flex-shrink-0 text-base">
                      {act.catIcon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-semibold text-[#2C2C2C] truncate">{act.name}</p>
                      <p className="text-[11px] text-[#7A8C8B]">
                        {act.timeStr && <span className="font-medium text-[#2C2C2C]">{act.timeStr}</span>}
                        {act.childName && <> &middot; {act.childName}</>}
                        {act.location && <> &middot; {act.location}</>}
                      </p>
                    </div>
                    {act.checklistItems.length > 0 && (
                      <span className="text-[9px] font-medium px-1.5 py-0.5 rounded-full bg-[#D4735A]/10 text-[#D4735A] flex-shrink-0">
                        {act.checklistItems.length} itens
                      </span>
                    )}
                  </div>
                </Link>
              ))}
            </>
          )}

        </div>
      )}

      {/* Pendências (escola/despesa/saúde, despesas, votos, relatos) → unificadas em "Sua Atenção" acima. Vacina segue no tile abaixo. */}

      {/* === SAÚDE PREVENTIVA — Motor Vacinal (migration 00082) ===
           Aparece quando há pendência REAL (overdue+due_soon). Paleta calma
           âmbar-suave (Apple Health-like), nunca alarmista. Tap → /saude/vacinas. */}
      {vaccinePendingCount > 0 && (
        <Link href="/saude/vacinas" prefetch={false} className="block">
          <div className="bg-gradient-to-br from-amber-50 to-orange-50/40 border border-amber-200/70 rounded-2xl p-3.5 flex items-center gap-3 hover:shadow-md transition-all">
            <div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 text-lg bg-white/80">
              💉
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-semibold text-[#2C2C2C]">
                {vaccinePendingCount === 1
                  ? t("health.vaccineEngine.statusOnePending")
                  : t("health.vaccineEngine.statusManyPending", { count: vaccinePendingCount })}
              </p>
              <p className="text-[11px] text-amber-700">
                {vaccineNextDue
                  ? (() => {
                      // Reutiliza nowMs já capturado em linha 419 (Date.now() é
                      // impure-no-render; o disable está só onde ela é lida).
                      const d = Math.ceil(
                        (new Date(vaccineNextDue.dueDate + "T12:00:00").getTime() - nowMs) / 86400000,
                      );
                      if (d <= 0)
                        return t("health.vaccineEngine.nextDueToday", { name: vaccineNextDue.vaccineName });
                      if (d === 1)
                        return t("health.vaccineEngine.nextDueTomorrow", { name: vaccineNextDue.vaccineName });
                      return t("health.vaccineEngine.nextDueInDays", {
                        name: vaccineNextDue.vaccineName,
                        count: String(d),
                      });
                    })()
                  : t("health.vaccineEngine.preventiveCareSubtitle")}
              </p>
            </div>
            <svg
              className="w-4 h-4 text-amber-600/60 flex-shrink-0"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </div>
        </Link>
      )}

      {/* Relatos pendentes → unificados em "Sua Atenção" acima. */}

      {/* === QUICK ACTIONS === */}
      {show("quickActions") && !isReadonly && (
      <div>
        <div className="flex items-center justify-between mb-3">
          <p className="text-[10px] font-semibold text-[#9CA3AF] uppercase tracking-wider">
            {t("dashboard.quickActions")}
          </p>
          <button
            onClick={() => setShowQAModal(true)}
            className="flex items-center gap-1 text-[10px] font-semibold text-[#D4735A] hover:opacity-75 transition-opacity"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
            </svg>
            {t("dashboard.editActionsHint")}
          </button>
        </div>

        {/* Primary action — dynamic */}
        <Link href={primaryAction.href} prefetch={false} className="block mb-3">
          <div
            className="rounded-2xl p-4 flex items-center gap-3 shadow-sm hover:opacity-90 transition-opacity active:scale-[0.99]"
            style={{ backgroundColor: primaryAction.color }}
          >
            <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center flex-shrink-0">
              <svg
                width="20" height="20" viewBox="0 0 24 24" fill="none"
                stroke="white" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
                dangerouslySetInnerHTML={{ __html: primaryAction.svgInner }}
              />
            </div>
            <div className="flex-1">
              <p className="text-[15px] font-bold text-white">{primaryAction.defaultLabel}</p>
              {primaryAction.id === "nova-despesa" && (
                <p className="text-[11px] text-white/70">{t("dashboard.registerSharedExpense")}</p>
              )}
            </div>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="opacity-50">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </div>
        </Link>

        {/* Secondary actions — dynamic grid */}
        {secondaryActions.length > 0 && (
          <div className="grid grid-cols-3 gap-2.5">
            {secondaryActions.map((action) => (
              <QuickActionButton key={action.id} action={action} />
            ))}
          </div>
        )}
      </div>
      )}

      {/* Quick Actions customization modal */}
      <QuickActionsModal
        isOpen={showQAModal}
        onClose={() => setShowQAModal(false)}
        initialPrimary={qaConfig.primary}
        initialSecondary={qaConfig.secondary}
      />

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
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  QuickActionButton — renders a catalog action as a grid tile       */
/* ------------------------------------------------------------------ */

function QuickActionButton({ action }: { action: QuickActionDef }) {
  return (
    <Link
      href={action.href}
      prefetch={false}
      className="flex flex-col items-center justify-center gap-2 bg-white rounded-2xl p-3 border border-gray-100/80 hover:shadow-sm transition-all active:scale-95 min-h-[76px]"
    >
      <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ backgroundColor: action.color + "10" }}>
        <svg
          width="18" height="18" viewBox="0 0 24 24" fill="none"
          stroke={action.color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"
          dangerouslySetInnerHTML={{ __html: action.svgInner }}
        />
      </div>
      <span className="text-[11px] font-medium text-[#2C2C2C] text-center leading-tight">{action.defaultLabel}</span>
    </Link>
  );
}
