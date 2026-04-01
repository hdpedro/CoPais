import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getActiveGroup } from "@/lib/group-utils";
import { autoAcceptPendingInvitations } from "@/actions/invitation";
import { formatDateKey, computeSwapBalance, getBrazilNow, getBrazilToday, type CustodyEvent, type ParentColorMap } from "@/lib/calendar-utils";
// getOccurrences removed — occurrences are pre-computed in calendar_occurrences table
import { PARENT_COLORS, DAY_NAMES, MONTH_NAMES, getDisplayName } from "@/lib/constants";
import dynamic from "next/dynamic";
import type { DashboardClientProps } from "./DashboardClient";

// Increase Vercel function timeout for dashboard SSR (many parallel DB queries)
export const maxDuration = 60;

const DashboardClient = dynamic(() => import("./DashboardClient"), {
  loading: () => (
    <div className="space-y-4 animate-pulse">
      <div className="h-8 bg-gray-200 rounded w-48" />
      <div className="h-4 bg-gray-100 rounded w-64" />
      <div className="h-32 bg-gray-200 rounded-xl" />
      <div className="h-20 bg-gray-100 rounded-xl" />
    </div>
  ),
});

export default async function DashboardPage() {
  const nowMs = Date.now(); // eslint-disable-line react-hooks/purity
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // === BATCH 1: profile + activeGroup (parallel, only need user.id) ===
  const [{ data: profile }, activeGroup] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", user.id).single(),
    getActiveGroup(supabase, user.id),
  ]);

  if (!activeGroup) {
    // Try to auto-accept any pending invitation for this user's email
    // This handles the case where invite token was lost during signup redirect chain
    const accepted = await autoAcceptPendingInvitations();
    if (accepted) {
      // Reload page — now memberships will exist
      redirect("/dashboard");
    }
    redirect("/onboarding");
  }

  const { groupId, groupName, isReadonly, custodyEnabled } = activeGroup;

  // === BATCH 2: members + children (parallel, need groupId) ===
  const [{ data: members }, { data: children }] = await Promise.all([
    supabase.from("group_members").select("user_id, role, profiles(id, full_name, email)").eq("group_id", groupId).order("joined_at")
      .then(r => r, () => ({ data: [] as never[] })),
    supabase.from("children").select("*").eq("group_id", groupId)
      .then(r => r, () => ({ data: [] as never[] })),
  ]);

  const parentColors: ParentColorMap = {};
  members?.forEach((m, i) => {
    const p = m.profiles as unknown as { full_name: string | null } | null;
    parentColors[m.user_id] = {
      name: getDisplayName(p?.full_name, true),
      color: i === 0 ? PARENT_COLORS.primary : PARENT_COLORS.secondary,
    };
  });

  // === BATCH 3: ALL remaining queries in parallel (need groupId + user.id) ===
  // Use Brazil timezone to avoid UTC offset bugs (e.g. Saturday 21h BRT = Sunday UTC)
  const todayStr = getBrazilToday(); // "YYYY-MM-DD" in Brazil timezone
  const todayParts = todayStr.split("-").map(Number);
  const now = new Date(todayParts[0], todayParts[1] - 1, todayParts[2], 12, 0, 0);
  const today = todayStr;
  const monthStart = `${todayParts[0]}-${String(todayParts[1]).padStart(2, "0")}-01`;
  const nextMonth = new Date(todayParts[0], todayParts[1], 1);
  const monthEnd = `${nextMonth.getFullYear()}-${String(nextMonth.getMonth() + 1).padStart(2, "0")}-01`;
  const yesterday = new Date(now); yesterday.setDate(yesterday.getDate() - 1);
  const fourteenDays = new Date(now); fourteenDays.setDate(fourteenDays.getDate() + 14);
  const sevenDaysAhead = new Date(now); sevenDaysAhead.setDate(sevenDaysAhead.getDate() + 7);
  const threeMonthsAgo = new Date(todayParts[0], todayParts[1] - 1 - 3, 1);
  const threeMonthsAhead = new Date(todayParts[0], todayParts[1] - 1 + 4, 0);
  const weekStart = new Date(now);
  const dow = weekStart.getDay();
  weekStart.setDate(weekStart.getDate() - (dow === 0 ? 6 : dow - 1));
  const weekEnd = new Date(weekStart); weekEnd.setDate(weekEnd.getDate() + 6);
  // Pre-compute activity date range keys (needed for activities + social events queries below)
  const todayKey = todayStr;
  const tomorrowDate = new Date(now); tomorrowDate.setDate(tomorrowDate.getDate() + 1);
  const tomorrowKey = formatDateKey(tomorrowDate);
  const sevenDaysOut = new Date(now); sevenDaysOut.setDate(sevenDaysOut.getDate() + 7);
  const sevenDaysKey = formatDateKey(sevenDaysOut);

  // Consolidated: fetch ALL custody_events for the broadest range (3 months) in a single query,
  // then filter in-memory for today, future, upcoming, and week views.
  const [
    { data: allCustodyEvents },
    { data: monthExpenses },
    { data: pendingSwaps },
    { data: activeMedications },
    { data: criticalAllergies },
    { data: upcomingAppointments },
    { data: activeIllnesses },
    { data: recentCheckins },
    { data: pendingExpenses },
    { data: openDecisions },
    { data: activityOccurrences },
    { data: dashSocialEvents },
    { data: pastOccurrences },
  ] = await Promise.all([
    // Single custody_events query covering 3-month range (replaces 5 separate queries)
    // Skip entirely when custody is not enabled (saves a DB query)
    custodyEnabled
      ? supabase.from("custody_events")
          .select("id, start_date, end_date, responsible_user_id, child_id, custody_type, notes, group_id, created_by, children(full_name), profiles!custody_events_responsible_user_id_fkey(full_name)")
          .eq("group_id", groupId).gte("end_date", formatDateKey(threeMonthsAgo))
          .lte("start_date", formatDateKey(threeMonthsAhead)).order("start_date")
          .then(r => r, () => ({ data: [] as never[] }))
      : Promise.resolve({ data: [] as never[] }),
    // Monthly expenses
    supabase.from("expenses")
      .select("amount, paid_by, status, split_ratio")
      .eq("group_id", groupId).gte("expense_date", monthStart).lt("expense_date", monthEnd)
      .then(r => r, () => ({ data: [] as never[] })),
    // Pending swaps (skip when custody not enabled)
    custodyEnabled
      ? supabase.from("swap_requests")
          .select("id, status, created_at, original_date, proposed_date, reason, type, requester_id, target_user_id, requester:profiles!swap_requests_requester_id_fkey(full_name)")
          .eq("group_id", groupId).eq("status", "pending").eq("target_user_id", user.id)
          .order("created_at", { ascending: false }).limit(3)
          .then(r => r, () => ({ data: [] as never[] }))
      : Promise.resolve({ data: [] as never[] }),
    // Active medications
    supabase.from("active_medications")
      .select("id, name, dosage, frequency, child_id, children(full_name)")
      .eq("group_id", groupId).eq("status", "active")
      .order("created_at", { ascending: false }).limit(5)
      .then(r => r, () => ({ data: [] as never[] })),
    // Critical allergies
    supabase.from("child_allergies")
      .select("id, name, severity, allergy_type, child_id, children(full_name)")
      .eq("group_id", groupId).in("severity", ["severe", "moderate"]).limit(5)
      .then(r => r, () => ({ data: [] as never[] })),
    // Upcoming appointments
    supabase.from("medical_appointments")
      .select("id, title, appointment_date, status, child_id, children(full_name), medical_professionals(name, specialty)")
      .eq("group_id", groupId).eq("status", "scheduled")
      .gte("appointment_date", now.toISOString()).lte("appointment_date", sevenDaysAhead.toISOString())
      .order("appointment_date").limit(3)
      .then(r => r, () => ({ data: [] as never[] })),
    // Active illnesses
    supabase.from("illness_episodes")
      .select("id, title, symptoms, start_date, child_id, children(full_name)")
      .eq("group_id", groupId).eq("status", "active")
      .order("start_date", { ascending: false }).limit(3)
      .then(r => r, () => ({ data: [] as never[] })),
    // Recent check-ins
    supabase.from("daily_checkins")
      .select("id, category, title, notes, checkin_date, created_at, child_id, logged_by, children(full_name), profiles!daily_checkins_logged_by_fkey(full_name)")
      .eq("group_id", groupId).gte("checkin_date", formatDateKey(yesterday))
      .order("created_at", { ascending: false }).limit(4)
      .then(r => r, () => ({ data: [] as never[] })),
    // Pending expenses awaiting MY approval (created by others, status=pending)
    supabase.from("expenses")
      .select("id, description, amount, category, expense_date, paid_by, profiles!expenses_paid_by_fkey(full_name)")
      .eq("group_id", groupId).eq("status", "pending").neq("paid_by", user.id)
      .order("created_at", { ascending: false }).limit(5)
      .then(r => r, () => ({ data: [] as never[] })),
    // Open decisions (for pending decisions widget)
    supabase.from("decisions")
      .select("id, title, category, deadline, status")
      .eq("group_id", groupId).eq("status", "aberta")
      .order("created_at", { ascending: false })
      .limit(20)
      .then(r => r, () => ({ data: [] as never[] })),
    // Activity occurrences for today through 7 days ahead (pre-computed, no runtime recurrence)
    supabase
      .from("calendar_occurrences")
      .select("occurrence_date, activity_id, child_activities!inner(id, name, category, time_start, time_end, location, child_id, children(full_name), activity_checklist_items(id, name))")
      .eq("group_id", groupId)
      .gte("occurrence_date", todayKey)
      .lte("occurrence_date", sevenDaysKey)
      .limit(100)
      .then(r => r, () => ({ data: [] as never[] })),
    // Social events for today/tomorrow/upcoming (moved from sequential to parallel)
    supabase
      .from("events")
      .select("id, title, event_date, event_time, location, child_id, status, children(full_name)")
      .eq("group_id", groupId)
      .neq("status", "cancelled")
      .gte("event_date", todayKey)
      .lte("event_date", sevenDaysKey)
      .then(r => r, () => ({ data: [] as never[] })),
    // Past activity occurrences for pending reports (last 7 days, excluding today)
    supabase
      .from("calendar_occurrences")
      .select("occurrence_date, activity_id, child_activities!inner(id, name, category, child_id, children(full_name))")
      .eq("group_id", groupId)
      .gte("occurrence_date", formatDateKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7)))
      .lt("occurrence_date", todayKey)
      .limit(200)
      .then(r => r, () => ({ data: [] as never[] })),
  ]);

  // Filter decisions where user hasn't voted yet
  const openDecisionIds = (openDecisions || []).map(d => d.id);
  const { data: decisionVotesForUser } = openDecisionIds.length > 0
    ? await supabase
        .from("decision_votes")
        .select("decision_id")
        .eq("user_id", user.id)
        .in("decision_id", openDecisionIds)
    : { data: [] };
  const votedDecisionIds = new Set((decisionVotesForUser || []).map(v => v.decision_id));
  const pendingDecisionsList = (openDecisions || []).filter(d => !votedDecisionIds.has(d.id));

  // Derive specific views from the single custody_events fetch
  const safeAllCustody = allCustodyEvents || [];
  const todayEvents = safeAllCustody.filter(
    (e) => e.start_date <= today && e.end_date >= today
  );
  const futureEvents = safeAllCustody
    .filter((e) => e.start_date > today)
    .slice(0, 5);
  const upcomingEvents = safeAllCustody.filter(
    (e) => e.start_date >= today && e.start_date <= formatDateKey(fourteenDays) && e.custody_type !== "regular"
  ).slice(0, 4);
  const swapEvents = safeAllCustody;
  const weekEvents = children && children.length > 0
    ? safeAllCustody.filter(
        (e) => e.child_id === children[0].id && e.start_date <= formatDateKey(weekEnd) && e.end_date >= formatDateKey(weekStart)
      )
    : null;

  // Process activities from pre-computed calendar_occurrences (no runtime recurrence expansion)

  interface DashActivityItem {
    id: string;
    name: string;
    category: string;
    time_start: string | null;
    time_end?: string | null;
    location: string | null;
    children: { full_name: string | null } | { full_name: string | null }[] | null;
    activity_checklist_items: { id: string; name: string }[];
  }

  const tomorrowActivities: DashActivityItem[] = [];
  const todayActivities: DashActivityItem[] = [];
  const upcomingActivities: { act: DashActivityItem; date: string; dayLabel: string }[] = [];
  const dayAfterTomorrowKey = formatDateKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 2));

  for (const occ of activityOccurrences || []) {
    const act = Array.isArray(occ.child_activities) ? occ.child_activities[0] : occ.child_activities;
    if (!act) continue;
    const dateKey = occ.occurrence_date;
    const dashAct: DashActivityItem = {
      id: act.id,
      name: act.name,
      category: act.category,
      time_start: act.time_start,
      time_end: act.time_end,
      location: act.location,
      children: act.children,
      activity_checklist_items: act.activity_checklist_items || [],
    };

    if (dateKey === todayKey) {
      const actTime = act.time_end || act.time_start;
      if (actTime) {
        const [h, m] = actTime.split(":").map(Number);
        const actEndMinutes = h * 60 + (m || 0);
        const nowMinutes = now.getHours() * 60 + now.getMinutes();
        if (actEndMinutes >= nowMinutes) todayActivities.push(dashAct);
      } else {
        todayActivities.push(dashAct);
      }
    } else if (dateKey === tomorrowKey) {
      tomorrowActivities.push(dashAct);
    } else if (dateKey >= dayAfterTomorrowKey) {
      const d = new Date(dateKey + "T12:00:00");
      upcomingActivities.push({ act: dashAct, date: dateKey, dayLabel: `${DAY_NAMES[d.getDay()]} ${d.getDate()}` });
    }
  }

  if (dashSocialEvents) {
    for (const evt of dashSocialEvents) {
      const fakeAct = {
        id: evt.id,
        name: evt.title,
        category: "evento",
        time_start: evt.event_time,
        location: evt.location,
        children: evt.children,
        activity_checklist_items: [],
      };
      if (evt.event_date === todayKey) {
        // Only show today's events that haven't ended
        if (evt.event_time) {
          const [h, m] = evt.event_time.split(":").map(Number);
          if (h * 60 + (m || 0) >= now.getHours() * 60 + now.getMinutes()) todayActivities.push(fakeAct);
        } else {
          todayActivities.push(fakeAct);
        }
      }
      else if (evt.event_date === tomorrowKey) tomorrowActivities.push(fakeAct);
      else {
        const d = new Date(evt.event_date + "T12:00:00");
        upcomingActivities.push({ act: fakeAct, date: evt.event_date, dayLabel: `${DAY_NAMES[d.getDay()]} ${d.getDate()}` });
      }
    }
  }

  const hasTomorrowActivities = tomorrowActivities.length > 0;
  const hasTodayActivities = todayActivities.length > 0;
  const hasUpcomingActivities = upcomingActivities.length > 0;

  // Compute pending activity reports from pre-computed past occurrences (no runtime recurrence)
  const pendingReportPairs: { activityId: string; activityName: string; category: string; childName: string; occurrenceDate: string }[] = [];
  for (const occ of pastOccurrences || []) {
    const act = Array.isArray(occ.child_activities) ? occ.child_activities[0] : occ.child_activities;
    if (!act) continue;
    pendingReportPairs.push({
      activityId: act.id,
      activityName: act.name,
      category: act.category,
      childName: (act.children as unknown as { full_name: string | null } | null)?.full_name?.split(" ")[0] || "",
      occurrenceDate: occ.occurrence_date,
    });
  }

  // Fetch existing reports to filter out already-reported ones
  const sevenDaysAgoKey = formatDateKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7));
  const yesterdayKey2 = formatDateKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1));
  let pendingReportsFinal: typeof pendingReportPairs = [];
  if (pendingReportPairs.length > 0) {
    const reportActIds = [...new Set(pendingReportPairs.map((p) => p.activityId))];
    const { data: existingReportsData } = await supabase
      .from("activity_reports")
      .select("activity_id, occurrence_date")
      .eq("group_id", groupId)
      .in("activity_id", reportActIds)
      .gte("occurrence_date", sevenDaysAgoKey)
      .lte("occurrence_date", yesterdayKey2);

    const reportedSet = new Set(
      (existingReportsData || []).map((r: { activity_id: string; occurrence_date: string }) => `${r.activity_id}:${r.occurrence_date}`)
    );
    pendingReportsFinal = pendingReportPairs.filter(
      (p) => !reportedSet.has(`${p.activityId}:${p.occurrenceDate}`)
    );
  }

  // Process today custody
  const todayCustodyByChild: Record<string, { responsibleId: string; responsibleName: string; isWithMe: boolean; endDate: string; custodyType: string }> = {};
  if (todayEvents.length > 0) {
    for (const event of todayEvents) {
      const childId = event.child_id;
      if (!childId || todayCustodyByChild[childId]) continue;
      const responsibleName = getDisplayName((event.profiles as unknown as { full_name: string | null } | null)?.full_name, true);
      todayCustodyByChild[childId] = {
        responsibleId: event.responsible_user_id,
        responsibleName,
        isWithMe: event.responsible_user_id === user.id,
        endDate: event.end_date,
        custodyType: event.custody_type,
      };
    }
  }
  const hasTodayCustody = Object.keys(todayCustodyByChild).length > 0;

  // Streak (uses todayCustody result — one extra query only if needed)
  let streakDays = 0;
  let streakTotal = 0;
  if (hasTodayCustody && children && children.length > 0) {
    const firstChild = children[0];
    const custody = todayCustodyByChild[firstChild.id];
    if (custody) {
      const { data: streakEvents } = await supabase
        .from("custody_events")
        .select("start_date, end_date")
        .eq("group_id", groupId)
        .eq("child_id", firstChild.id)
        .eq("responsible_user_id", custody.responsibleId)
        .lte("start_date", today)
        .gte("end_date", today)
        .order("start_date", { ascending: false })
        .limit(1);

      if (streakEvents && streakEvents.length > 0) {
        const startDate = new Date(streakEvents[0].start_date + "T12:00:00");
        const endDate = new Date(streakEvents[0].end_date + "T12:00:00");
        const todayDate = new Date(today + "T12:00:00");
        streakTotal = Math.round((endDate.getTime() - startDate.getTime()) / 86400000) + 1;
        streakDays = Math.round((todayDate.getTime() - startDate.getTime()) / 86400000) + 1;
      }
    }
  }

  const nextSwapEvent = futureEvents?.find((e) => {
    const todayInfo = todayCustodyByChild[e.child_id];
    return todayInfo ? e.responsible_user_id !== todayInfo.responsibleId : true;
  });

  // Process financial (exclude rejected expenses, consistent with Financeiro page)
  let myTotal = 0;
  let otherTotal = 0;
  let myShouldPay = 0;
  let otherName = "";
  if (monthExpenses) {
    for (const exp of monthExpenses) {
      if (exp.status === "rejected") continue;
      const amount = Number(exp.amount);
      if (exp.paid_by === user.id) myTotal += amount;
      else {
        otherTotal += amount;
        if (!otherName && parentColors[exp.paid_by]) otherName = parentColors[exp.paid_by].name;
      }
      // Calculate what user should pay based on split_ratio
      const sr = exp.split_ratio as Record<string, number> | null;
      if (sr && sr[user.id] !== undefined) {
        myShouldPay += (sr[user.id] / 100) * amount;
      } else {
        myShouldPay += amount / 2; // default 50/50
      }
    }
  }
  if (!otherName) {
    const otherMember = members?.find((m) => m.user_id !== user.id);
    otherName = parentColors[otherMember?.user_id || ""]?.name || "Outro";
  }
  const totalMonth = myTotal + otherTotal;
  const balance = myTotal - myShouldPay;

  // Health alerts flag
  const hasHealthAlerts = (activeMedications && activeMedications.length > 0) ||
    (criticalAllergies && criticalAllergies.length > 0) ||
    (upcomingAppointments && upcomingAppointments.length > 0) ||
    (activeIllnesses && activeIllnesses.length > 0);

  // UI constants
  const displayFullName = getDisplayName(profile?.full_name);
  const nameParts = displayFullName.split(" ");
  // Handle prefixes like "Dr.", "Dra.", "Sr.", "Sra." — use prefix + next word
  const prefixes = ["dr.", "dra.", "sr.", "sra.", "prof."];
  const firstName = nameParts.length > 1 && prefixes.includes(nameParts[0].toLowerCase())
    ? `${nameParts[0]} ${nameParts[1]}`
    : nameParts[0] || "Pai";
  const brazilNow = getBrazilNow();
  const hour = brazilNow.getHours();
  const greetingKey: "morning" | "afternoon" | "evening" = hour < 12 ? "morning" : hour < 18 ? "afternoon" : "evening";

  const dayNamesShort = [...DAY_NAMES];

  const dayNames = ["Domingo", "Segunda", "Terca", "Quarta", "Quinta", "Sexta", "Sabado"];
  const monthNames = MONTH_NAMES.map((m) => m.toLowerCase());
  const todayDateObj = brazilNow;
  const formattedDate = `${dayNames[todayDateObj.getDay()]}, ${todayDateObj.getDate()} de ${monthNames[todayDateObj.getMonth()]}`;

  const firstChild = children && children.length > 0 ? children[0] : null;
  const firstCustody = firstChild ? todayCustodyByChild[firstChild.id] : null;
  const custodySummary = firstCustody
    ? `${firstChild!.full_name?.split(" ")[0]} com ${firstCustody.isWithMe ? "voce" : firstCustody.responsibleName} hoje`
    : null;

  // End date label for hero
  const endDateLabel = firstCustody ? (() => {
    const end = new Date(firstCustody.endDate + "T12:00:00");
    return `${firstCustody.custodyType === "regular" ? "regular" : firstCustody.custodyType} - ${dayNamesShort[end.getDay()].toLowerCase()}`;
  })() : "";

  // Week view
  const wLabels = ["S", "T", "Q", "Q", "S", "S", "D"];
  const weekDaysData: DashboardClientProps["weekDays"] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(weekStart);
    d.setDate(weekStart.getDate() + i);
    weekDaysData.push({
      dateKey: formatDateKey(d),
      label: wLabels[i],
      dayNum: d.getDate(),
      isToday: formatDateKey(d) === today,
    });
  }

  // Week custody map
  const weekCustodyEntries: DashboardClientProps["weekCustodyMap"] = [];
  if (weekEvents) {
    for (const ev of weekEvents) {
      const s = new Date(ev.start_date + "T12:00:00");
      const e = new Date(ev.end_date + "T12:00:00");
      for (let d = new Date(s); d <= e; d.setDate(d.getDate() + 1)) {
        weekCustodyEntries.push({
          dateKey: formatDateKey(d),
          responsibleId: ev.responsible_user_id,
          color: parentColors[ev.responsible_user_id]?.color || PARENT_COLORS.primary,
        });
      }
    }
  }

  // Parent color entries for legend
  const parentColorEntries = Object.entries(parentColors).slice(0, 2).map(([uid, { name, color }]) => ({ uid, name, color }));

  // Swap balance
  const custodyEvents = (swapEvents || []) as unknown as CustodyEvent[];
  const swapBalance = computeSwapBalance(custodyEvents, parentColors, formatDateKey(threeMonthsAgo), formatDateKey(threeMonthsAhead));
  const mySwapDays = swapBalance.balanceByUser[user.id] || 0;
  const myColor = parentColors[user.id]?.color || PARENT_COLORS.primary;
  const otherColor = parentColors[members?.find(m => m.user_id !== user.id)?.user_id || ""]?.color || PARENT_COLORS.secondary;

  // Format next swap date
  const formatSwapDate = (dateStr: string) => {
    const d = new Date(dateStr + "T12:00:00");
    return `${dayNamesShort[d.getDay()]} ${d.getDate()}/${d.getMonth() + 1}`;
  };

  // === BUILD SERIALIZABLE PROPS ===

  // Pending swaps
  const pendingSwapsProps: DashboardClientProps["pendingSwaps"] = (pendingSwaps || []).map((swap) => {
    const requesterName = getDisplayName((swap.requester as unknown as { full_name: string | null } | null)?.full_name, true);
    const swapDate = new Date(swap.original_date + "T12:00:00");
    return {
      id: swap.id,
      requesterName,
      dateLabel: `${dayNamesShort[swapDate.getDay()]}, ${swapDate.getDate()}/${swapDate.getMonth() + 1}`,
      originalDate: swap.original_date,
    };
  });

  // Next swap label
  const nextSwapLabel = nextSwapEvent
    ? `${formatSwapDate(nextSwapEvent.start_date)} \u00B7 ${getDisplayName((nextSwapEvent.profiles as unknown as { full_name: string | null } | null)?.full_name, true)}`
    : null;

  // Hero firstCustody
  const firstCustodyProp = firstCustody ? {
    childFirstName: firstChild!.full_name?.split(" ")[0] || "",
    responsibleName: firstCustody.responsibleName,
    isWithMe: firstCustody.isWithMe,
    endDate: firstCustody.endDate,
    custodyType: firstCustody.custodyType,
  } : null;

  // Illnesses
  const illnessProps: DashboardClientProps["activeIllnesses"] = (activeIllnesses || []).map((illness) => {
    const childName = (illness.children as unknown as { full_name: string | null } | null)?.full_name?.split(" ")[0] || "Crianca";
    const startDate = new Date(illness.start_date + "T12:00:00");
    const daysAgo = Math.round((nowMs - startDate.getTime()) / 86400000);
    const symptoms = (illness.symptoms as string[])?.slice(0, 3).join(", ") || "";
    return { id: illness.id, childName, title: illness.title, daysAgo, symptoms };
  });

  // Medications
  const medicationProps: DashboardClientProps["activeMedications"] = (activeMedications || []).map((m) => ({
    id: m.id,
    name: m.name,
    childName: (m.children as unknown as { full_name: string | null } | null)?.full_name?.split(" ")[0] || "",
  }));

  // Allergies
  const allergyProps: DashboardClientProps["criticalAllergies"] = (criticalAllergies || []).map((a) => ({
    id: a.id,
    name: a.name,
    severity: a.severity,
  }));

  // Appointments
  const appointmentProps: DashboardClientProps["upcomingAppointments"] = (upcomingAppointments || []).map((appt) => {
    const childName = (appt.children as unknown as { full_name: string | null } | null)?.full_name?.split(" ")[0] || "";
    const profName = (appt.medical_professionals as unknown as { name: string | null; specialty: string | null } | null)?.name || "";
    const specialty = (appt.medical_professionals as unknown as { name: string | null; specialty: string | null } | null)?.specialty || "";
    const apptDate = new Date(appt.appointment_date);
    const isToday = formatDateKey(apptDate) === today;
    const isTomorrow = formatDateKey(apptDate) === tomorrowKey;
    const timeStr = apptDate.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
    return {
      id: appt.id,
      title: appt.title || specialty,
      childName,
      profName,
      timeStr,
      isToday,
      isTomorrow,
      dateLabel: `${dayNamesShort[apptDate.getDay()]} ${apptDate.getDate()}/${apptDate.getMonth() + 1}`,
    };
  });

  // Activities mapper
  const mapActivity = (act: DashActivityItem) => ({
    id: act.id,
    name: act.name,
    category: act.category,
    childName: (act.children as unknown as { full_name: string | null } | null)?.full_name?.split(" ")[0] || "",
    timeStr: act.time_start ? act.time_start.slice(0, 5) : "",
    location: act.location || "",
    checklistItems: (act.activity_checklist_items || []).map((i) => i.name),
  });

  const todayActivitiesProps = todayActivities.map(mapActivity);
  const tomorrowActivitiesProps = tomorrowActivities.map(mapActivity);
  const upcomingActivitiesProps: DashboardClientProps["upcomingActivitiesList"] = upcomingActivities.map(({ act, date, dayLabel }) => ({
    act: mapActivity(act),
    date,
    dayLabel,
  }));

  // Pending expenses
  const pendingExpenseProps: DashboardClientProps["pendingExpenses"] = (pendingExpenses || []).map((exp) => {
    const paidByName = getDisplayName((exp.profiles as unknown as { full_name: string | null } | null)?.full_name, true);
    const expDate = new Date(exp.expense_date + "T12:00:00");
    return {
      id: exp.id,
      description: exp.description,
      amount: Number(exp.amount),
      category: exp.category,
      paidByName,
      dateLabel: `${expDate.getDate()}/${expDate.getMonth() + 1}`,
    };
  });

  // Upcoming custody events for agenda
  const upcomingEventsProps: DashboardClientProps["upcomingEvents"] = (upcomingEvents || []).map((event) => {
    const rid = event.responsible_user_id;
    const isMe = rid === user.id;
    const rName = getDisplayName((event.profiles as unknown as { full_name: string | null } | null)?.full_name, true);
    const color = parentColors[rid]?.color || PARENT_COLORS.secondary;
    const eDate = new Date(event.start_date + "T12:00:00");
    const childName = (event.children as unknown as { full_name: string | null } | null)?.full_name?.split(" ")[0] || "";
    const hasNote = event.notes && !event.notes.includes("Gerado pela escala");
    return {
      id: event.id,
      responsibleId: rid,
      isMe,
      responsibleName: rName,
      color,
      custodyType: event.custody_type,
      childName,
      notes: hasNote ? event.notes : null,
      dateDayShort: dayNamesShort[eDate.getDay()].substring(0, 3).toLowerCase(),
      dateNum: eDate.getDate(),
    };
  });

  // Child cards
  const birthMonthNames = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
  const childCards: DashboardClientProps["childCards"] = (children || []).map((child) => {
    const custody = todayCustodyByChild[child.id];
    const age = Math.floor((nowMs - new Date(child.birth_date).getTime()) / (365.25 * 24 * 60 * 60 * 1000));
    const birthDate = new Date(child.birth_date);
    const childCheckin = recentCheckins?.find((ci) => (ci.children as unknown as { full_name: string | null } | null)?.full_name === child.full_name);
    const checkinIsToday = childCheckin ? childCheckin.checkin_date === today : false;
    return {
      id: child.id,
      fullName: child.full_name || "",
      firstName: child.full_name?.split(" ")[0] || "",
      initial: child.full_name?.charAt(0).toUpperCase() || "",
      age,
      birthLabel: `${birthMonthNames[birthDate.getMonth()]}/${birthDate.getFullYear()}`,
      custodyInfo: custody ? { responsibleName: custody.responsibleName, isWithMe: custody.isWithMe } : null,
      checkinTitle: childCheckin ? childCheckin.title : null,
      checkinIsToday,
    };
  });

  // Determine if the group has a custody schedule configured
  const hasCustody = safeAllCustody.some((e) => e.custody_type === "regular");

  // === CONTEXT-AWARE SECTION ORDERING ===
  // Prioritize sections based on what matters RIGHT NOW for this user.
  // Each section has a priority (lower = more important). Show top N, collapse rest.
  type SectionId = "swapAlerts" | "hero" | "weekStrip" | "healthAlerts" | "activities" | "pendingExpenses" | "pendingDecisions" | "pendingReports" | "financial" | "agenda" | "quickActions" | "childCards" | "swapBalance" | "invite" | "custodyActivation";

  const sectionPriorities: { id: SectionId; priority: number; hasData: boolean }[] = [
    // P1: Urgent — needs immediate action
    { id: "swapAlerts", priority: 1, hasData: custodyEnabled && hasCustody && pendingSwapsProps.length > 0 },
    { id: "healthAlerts", priority: hasHealthAlerts && illnessProps.some(i => i.daysAgo <= 2) ? 2 : 5, hasData: !!hasHealthAlerts },
    { id: "pendingExpenses", priority: 3, hasData: pendingExpenseProps.length > 0 },
    { id: "pendingDecisions", priority: pendingDecisionsList.some(d => d.deadline && new Date(d.deadline + "T23:59:59").getTime() - now.getTime() < 3 * 86400000) ? 3 : 7, hasData: pendingDecisionsList.length > 0 },

    // P2: Context — what's happening today/tomorrow
    { id: "hero", priority: 4, hasData: true }, // always show
    { id: "weekStrip", priority: 4, hasData: true }, // always show
    { id: "activities", priority: 4, hasData: hasTodayActivities || hasTomorrowActivities || hasUpcomingActivities },

    // P3: Informational — useful but not urgent
    { id: "pendingReports", priority: 8, hasData: pendingReportsFinal.length > 0 },
    { id: "financial", priority: 9, hasData: true },
    { id: "agenda", priority: 9, hasData: upcomingEventsProps.length > 0 || hasTodayActivities || hasTomorrowActivities },
    { id: "quickActions", priority: 10, hasData: !isReadonly },

    // P4: Low priority — accessible but not prominent
    { id: "childCards", priority: 11, hasData: (children?.length || 0) > 0 },
    { id: "swapBalance", priority: 12, hasData: custodyEnabled && hasCustody },
    { id: "invite", priority: 13, hasData: (members?.length || 0) < 2 },
    { id: "custodyActivation", priority: 14, hasData: !custodyEnabled && (members?.length || 0) >= 2 },
  ];

  // Filter to sections with data, sort by priority
  const visibleSections = sectionPriorities
    .filter(s => s.hasData)
    .sort((a, b) => a.priority - b.priority)
    .map(s => s.id);

  const clientProps: DashboardClientProps = {
    custodyEnabled,
    groupId,
    hasCustody,
    greeting: greetingKey,
    firstName,
    formattedDate,
    custodySummary,
    pendingSwaps: pendingSwapsProps,
    hasTodayCustody,
    firstChildName: firstChild?.full_name?.split(" ")[0] || null,
    firstCustody: firstCustodyProp,
    nextSwapLabel,
    streakDays,
    streakTotal,
    otherColor,
    myColor,
    groupName,
    hasChildren: !!(children && children.length > 0),
    endDateLabel,
    weekDays: weekDaysData,
    weekCustodyMap: weekCustodyEntries,
    parentColorEntries,
    hasHealthAlerts: !!hasHealthAlerts,
    activeIllnesses: illnessProps,
    activeMedications: medicationProps,
    criticalAllergies: allergyProps,
    upcomingAppointments: appointmentProps,
    hasTomorrowActivities,
    hasTodayActivities,
    hasUpcomingActivities,
    tomorrowActivities: tomorrowActivitiesProps,
    todayActivities: todayActivitiesProps,
    upcomingActivitiesList: upcomingActivitiesProps,
    pendingExpenses: pendingExpenseProps,
    balance,
    totalMonth,
    myTotal,
    otherTotal,
    otherName,
    upcomingEvents: upcomingEventsProps,
    isReadonly,
    childCards,
    mySwapDays,
    memberCount: members?.length || 0,
    userId: user.id,
    parentColors,
    pendingDecisions: pendingDecisionsList.map(d => ({
      id: d.id,
      title: d.title,
      category: d.category,
      deadline: d.deadline,
    })),
    visibleSections,
    pendingReports: pendingReportsFinal.slice(0, 5).map((pr) => {
      const occDate = new Date(pr.occurrenceDate + "T12:00:00");
      const daysAgo = Math.round((now.getTime() - occDate.getTime()) / 86400000);
      return {
        activityId: pr.activityId,
        activityName: pr.activityName,
        category: pr.category,
        childName: pr.childName,
        occurrenceDate: pr.occurrenceDate,
        dateLabel: `${DAY_NAMES[occDate.getDay()]} ${occDate.getDate()}/${occDate.getMonth() + 1}`,
        daysAgo,
      };
    }),
  };

  return <DashboardClient {...clientProps} />;
}
