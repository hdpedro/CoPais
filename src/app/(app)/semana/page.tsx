import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getActiveGroup } from "@/lib/group-utils";
import { getBrazilToday, formatDateKey, type ParentColorMap } from "@/lib/calendar-utils";
import { PARENT_COLORS, getDisplayName } from "@/lib/constants";
import dynamic from "next/dynamic";

const WeeklySummaryClient = dynamic(() => import("./WeeklySummaryClient"), {
  loading: () => (
    <div className="space-y-4 animate-pulse">
      <div className="h-24 bg-gray-200 rounded-2xl" />
      <div className="h-20 bg-gray-100 rounded-2xl" />
      <div className="h-40 bg-gray-200 rounded-2xl" />
    </div>
  ),
});

export default async function SemanaPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const activeGroup = await getActiveGroup(supabase, user.id);
  if (!activeGroup) redirect("/onboarding");
  const { groupId, custodyEnabled } = activeGroup;

  // Date calculations (Brazil timezone)
  const todayStr = getBrazilToday();
  const todayParts = todayStr.split("-").map(Number);
  const now = new Date(todayParts[0], todayParts[1] - 1, todayParts[2], 12, 0, 0);

  // Week range: Monday to Sunday
  const weekStart = new Date(now);
  const dow = weekStart.getDay();
  weekStart.setDate(weekStart.getDate() - (dow === 0 ? 6 : dow - 1));
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 6);
  const weekStartKey = formatDateKey(weekStart);
  const weekEndKey = formatDateKey(weekEnd);

  // Members query (needed for parent colors)
  const { data: members } = await supabase
    .from("group_members")
    .select("user_id, role, profiles(id, full_name)")
    .eq("group_id", groupId)
    .order("joined_at");

  const parentColors: ParentColorMap = {};
  members?.forEach((m, i) => {
    const p = m.profiles as unknown as { full_name: string | null } | null;
    parentColors[m.user_id] = {
      name: getDisplayName(p?.full_name, true),
      color: i === 0 ? PARENT_COLORS.primary : PARENT_COLORS.secondary,
    };
  });

  // ALL data in a single parallel batch
  const [
    { data: children },
    { data: custodyEvents },
    { data: swapRequests },
    { data: activityOccurrences },
    { data: checkins },
    { data: activeIllnesses },
    { data: activeMeds },
    { data: appointments },
    { data: unreadMessages },
    { data: pendingDecisions },
  ] = await Promise.all([
    supabase.from("children")
      .select("id, full_name")
      .eq("group_id", groupId)
      .then(r => r, () => ({ data: [] as never[] })),

    custodyEnabled
      ? supabase.from("custody_events")
          .select("id, start_date, end_date, responsible_user_id, child_id, custody_type")
          .eq("group_id", groupId)
          .gte("end_date", weekStartKey)
          .lte("start_date", weekEndKey)
          .then(r => r, () => ({ data: [] as never[] }))
      : Promise.resolve({ data: [] as never[] }),

    custodyEnabled
      ? supabase.from("swap_requests")
          .select("id, status, original_date, proposed_date, type, requester_id, target_user_id")
          .eq("group_id", groupId).eq("status", "pending")
          .limit(5)
          .then(r => r, () => ({ data: [] as never[] }))
      : Promise.resolve({ data: [] as never[] }),

    supabase.from("calendar_occurrences")
      .select("id, occurrence_date, activity_id, child_activities(id, name, category, child_id, start_time, location)")
      .eq("group_id", groupId)
      .gte("occurrence_date", weekStartKey)
      .lte("occurrence_date", weekEndKey)
      .limit(100)
      .then(r => r, () => ({ data: [] as never[] })),

    supabase.from("daily_checkins")
      .select("id, checkin_date, child_id, category")
      .eq("group_id", groupId)
      .gte("checkin_date", weekStartKey)
      .lte("checkin_date", weekEndKey)
      .limit(50)
      .then(r => r, () => ({ data: [] as never[] })),

    supabase.from("illness_episodes")
      .select("id, title, child_id, status")
      .eq("group_id", groupId).eq("status", "active")
      .limit(10)
      .then(r => r, () => ({ data: [] as never[] })),

    supabase.from("active_medications")
      .select("id, name, child_id, status")
      .eq("group_id", groupId).eq("status", "active")
      .limit(20)
      .then(r => r, () => ({ data: [] as never[] })),

    supabase.from("medical_appointments")
      .select("id, title, appointment_date, child_id, status")
      .eq("group_id", groupId).eq("status", "scheduled")
      .gte("appointment_date", weekStart.toISOString())
      .lte("appointment_date", weekEnd.toISOString())
      .limit(10)
      .then(r => r, () => ({ data: [] as never[] })),

    supabase.from("chat_messages")
      .select("id", { count: "exact", head: true })
      .eq("group_id", groupId)
      .gte("created_at", weekStart.toISOString())
      .then(r => r, () => ({ data: null, count: 0 })),

    supabase.from("decisions")
      .select("id, title, category")
      .eq("group_id", groupId).eq("status", "aberta")
      .limit(5)
      .then(r => r, () => ({ data: [] as never[] })),
  ]);

  // Build week days
  const weekDays = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + i);
    const key = formatDateKey(d);
    const dayNames = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sab"];
    weekDays.push({
      dateKey: key,
      dayNum: d.getDate(),
      label: dayNames[d.getDay()],
      isToday: key === todayStr,
      isPast: key < todayStr,
    });
  }

  // Map custody to days
  const custodyByDay: Record<string, { responsibleId: string; color: string }> = {};
  if (custodyEvents) {
    for (const ev of custodyEvents) {
      const start = new Date(ev.start_date + "T12:00:00");
      const end = new Date(ev.end_date + "T12:00:00");
      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        const key = formatDateKey(d);
        if (key >= weekStartKey && key <= weekEndKey) {
          const pc = parentColors[ev.responsible_user_id];
          custodyByDay[key] = { responsibleId: ev.responsible_user_id, color: pc?.color || "#9CA3AF" };
        }
      }
    }
  }

  // Events per day
  const eventsByDay: Record<string, number> = {};
  const checkinsByDay: Record<string, boolean> = {};
  if (activityOccurrences) {
    for (const occ of activityOccurrences) {
      eventsByDay[occ.occurrence_date] = (eventsByDay[occ.occurrence_date] || 0) + 1;
    }
  }
  if (checkins) {
    for (const c of checkins) {
      checkinsByDay[c.checkin_date] = true;
    }
  }

  // Health by day (illness active = flag)
  const healthAlertDays = new Set<string>();
  if (activeIllnesses && activeIllnesses.length > 0) {
    // Mark all week days as health alert if there's an active illness
    weekDays.forEach(d => healthAlertDays.add(d.dateKey));
  }

  // Pending actions
  const pendingActions: Array<{ type: string; label: string; href: string; icon: string }> = [];
  if (activeMeds && activeMeds.length > 0) {
    pendingActions.push({ type: "health", label: "Confirmar medicamentos", href: "/saude/medicamentos", icon: "💊" });
  }
  // Check if today has no checkin
  const todayCheckin = checkins?.find(c => c.checkin_date === todayStr);
  if (!todayCheckin) {
    pendingActions.push({ type: "routine", label: "Registrar check-in de hoje", href: "/checkin", icon: "✅" });
  }
  if (pendingDecisions && pendingDecisions.length > 0) {
    pendingActions.push({ type: "routine", label: `${pendingDecisions.length} decisao(oes) pendente(s)`, href: "/decisoes", icon: "🗳️" });
  }

  // Child summaries
  const childSummaries = (children || []).map(child => {
    const childIllnesses = activeIllnesses?.filter(i => i.child_id === child.id) || [];
    const childMeds = activeMeds?.filter(m => m.child_id === child.id) || [];
    const childAppts = appointments?.filter(a => a.child_id === child.id) || [];
    const childActivities = activityOccurrences?.filter(o => {
      const act = o.child_activities as unknown as { child_id: string } | null;
      return act?.child_id === child.id;
    }) || [];
    const childCheckins = checkins?.filter(c => c.child_id === child.id) || [];

    const healthStatus = childIllnesses.length > 0 ? "sick" : childMeds.length > 0 ? "treatment" : "healthy";

    return {
      id: child.id,
      name: getDisplayName((child as unknown as { full_name: string }).full_name, true),
      healthStatus,
      appointmentsCount: childAppts.length,
      activitiesCount: childActivities.length,
      checkinsCount: childCheckins.length,
      medsCount: childMeds.length,
    };
  });

  // KPIs
  const totalEvents = activityOccurrences?.length || 0;
  const medsCount = activeMeds?.length || 0;
  const pendingCount = pendingActions.length + (swapRequests?.length || 0);
  const messagesCount = (unreadMessages as unknown as { count: number | null })?.count || 0;

  // Swap info
  const nextSwaps = (swapRequests || []).slice(0, 3).map(s => ({
    id: s.id,
    date: s.original_date,
    type: s.type,
    isIncoming: s.target_user_id === user.id,
  }));

  // Intelligent insight
  let insight = "";
  if (activeIllnesses && activeIllnesses.length > 0) {
    insight = "Atencao a saude esta semana — acompanhe a evolucao.";
  } else if (totalEvents > 10) {
    insight = "Semana intensa! Mantenha a organizacao para dar conta de tudo.";
  } else if (pendingCount === 0 && totalEvents <= 5) {
    insight = "Semana tranquila. Bom momento para qualidade de tempo.";
  } else if (pendingCount > 3) {
    insight = "Algumas pendencias abertas — resolva hoje para ficar em dia.";
  } else {
    insight = "Boa consistencia na rotina. Continuem assim!";
  }

  // Header mood
  let weekMood: "calm" | "busy" | "alert" = "calm";
  if (activeIllnesses && activeIllnesses.length > 0) weekMood = "alert";
  else if (totalEvents > 8 || pendingCount > 3) weekMood = "busy";

  return (
    <WeeklySummaryClient
      weekMood={weekMood}
      weekDays={weekDays}
      custodyByDay={custodyByDay}
      eventsByDay={eventsByDay}
      checkinsByDay={checkinsByDay}
      healthAlertDays={Array.from(healthAlertDays)}
      kpis={{ totalEvents, medsCount, pendingCount, messagesCount }}
      pendingActions={pendingActions.slice(0, 3)}
      childSummaries={childSummaries}
      nextSwaps={nextSwaps}
      custodyEnabled={custodyEnabled}
      insight={insight}
      parentColors={parentColors}
    />
  );
}
