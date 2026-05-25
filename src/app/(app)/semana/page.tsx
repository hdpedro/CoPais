import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/supabase/auth-helper";
import { getActiveGroup } from "@/lib/group-utils";
import { getBrazilToday, formatDateKey, type ParentColorMap } from "@/lib/calendar-utils";
import { PARENT_COLORS, getDisplayName } from "@/lib/constants";
import dynamic from "next/dynamic";

const WeeklySummaryClient = dynamic(() => import("./WeeklySummaryClient"), {
  loading: () => (
    <div className="space-y-4 animate-pulse">
      <div className="h-28 bg-gray-200 rounded-2xl" />
      <div className="h-24 bg-gray-100 rounded-2xl" />
      <div className="h-40 bg-gray-200 rounded-2xl" />
    </div>
  ),
});

export default async function SemanaPage() {
  const { supabase, user } = await getSessionUser();
  if (!user) redirect("/login");

  const activeGroup = await getActiveGroup(supabase, user.id);
  if (!activeGroup) redirect("/onboarding");
  const { groupId, custodyEnabled } = activeGroup;

  const todayStr = getBrazilToday();
  const todayParts = todayStr.split("-").map(Number);
  const now = new Date(todayParts[0], todayParts[1] - 1, todayParts[2], 12, 0, 0);

  // Previous full week (Monday to Sunday)
  const weekEnd = new Date(now);
  const dow = weekEnd.getDay();
  // Go back to last Sunday
  weekEnd.setDate(weekEnd.getDate() - (dow === 0 ? 0 : dow));
  // weekStart = that Monday (6 days before Sunday)
  const weekStart = new Date(weekEnd);
  weekStart.setDate(weekStart.getDate() - 6);
  const weekStartKey = formatDateKey(weekStart);
  const weekEndKey = formatDateKey(weekEnd);

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

  // Single parallel batch — all data
  const [
    { data: children },
    { data: custodyEvents },
    { data: swapRequests },
    { data: activityOccurrences },
    { data: checkins },
    { data: activeIllnesses },
    { data: activeMeds },
    { data: appointments },
    messagesResult,
    { data: pendingDecisions },
  ] = await Promise.all([
    supabase.from("children").select("id, full_name").eq("group_id", groupId)
      .then(r => r, () => ({ data: [] as never[] })),
    custodyEnabled
      ? supabase.from("custody_events")
          .select("id, start_date, end_date, responsible_user_id, child_id, custody_type")
          .eq("group_id", groupId).gte("end_date", weekStartKey).lte("start_date", weekEndKey)
          .then(r => r, () => ({ data: [] as never[] }))
      : Promise.resolve({ data: [] as never[] }),
    custodyEnabled
      ? supabase.from("swap_requests")
          .select("id, status, original_date, proposed_date, type, requester_id, target_user_id")
          .eq("group_id", groupId).eq("status", "pending").limit(5)
          .then(r => r, () => ({ data: [] as never[] }))
      : Promise.resolve({ data: [] as never[] }),
    supabase.from("calendar_occurrences")
      .select("id, occurrence_date, activity_id, child_activities(id, name, category, child_id, time_start, location)")
      .eq("group_id", groupId).gte("occurrence_date", weekStartKey).lte("occurrence_date", weekEndKey).limit(100)
      .then(r => r, () => ({ data: [] as never[] })),
    supabase.from("daily_checkins")
      .select("id, checkin_date, child_id, category")
      .eq("group_id", groupId).gte("checkin_date", weekStartKey).lte("checkin_date", weekEndKey).limit(50)
      .then(r => r, () => ({ data: [] as never[] })),
    supabase.from("illness_episodes")
      .select("id, title, child_id, status, children(full_name)")
      .eq("group_id", groupId).eq("status", "active").limit(10)
      .then(r => r, () => ({ data: [] as never[] })),
    supabase.from("active_medications")
      .select("id, name, child_id, status, children(full_name)")
      .eq("group_id", groupId).eq("status", "active").limit(20)
      .then(r => r, () => ({ data: [] as never[] })),
    supabase.from("medical_appointments")
      .select("id, title, appointment_date, child_id, status")
      .eq("group_id", groupId).eq("status", "scheduled")
      .gte("appointment_date", weekStartKey).lte("appointment_date", weekEndKey + "T23:59:59").limit(10)
      .then(r => r, () => ({ data: [] as never[] })),
    supabase.from("chat_messages")
      .select("id", { count: "exact", head: true })
      .eq("group_id", groupId).gte("created_at", weekStartKey)
      .then(r => r, () => ({ data: null, count: 0 })),
    supabase.from("decisions")
      .select("id, title, category")
      .eq("group_id", groupId).eq("status", "aberta").limit(5)
      .then(r => r, () => ({ data: [] as never[] })),
  ]);

  // Week days
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

  // Custody by day
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

  // Events + checkins per day
  const eventsByDay: Record<string, number> = {};
  const checkinsByDay: Record<string, boolean> = {};
  if (activityOccurrences) {
    for (const occ of activityOccurrences) {
      eventsByDay[occ.occurrence_date] = (eventsByDay[occ.occurrence_date] || 0) + 1;
    }
  }
  if (checkins) {
    for (const c of checkins) { checkinsByDay[c.checkin_date] = true; }
  }

  const healthAlertDays = new Set<string>();
  if (activeIllnesses && activeIllnesses.length > 0) {
    weekDays.forEach(d => { if (!d.isPast) healthAlertDays.add(d.dateKey); });
  }

  // Pending actions with urgency
  const pendingActions: Array<{ type: string; label: string; href: string; icon: string; urgency: "high" | "medium" | "low" }> = [];
  if (activeIllnesses && activeIllnesses.length > 0) {
    const childName = getDisplayName((activeIllnesses[0].children as unknown as { full_name: string } | null)?.full_name, true);
    pendingActions.push({ type: "health", label: `Acompanhar saúde de ${childName}`, href: "/saude/doencas", icon: "🩺", urgency: "high" });
  }
  if (activeMeds && activeMeds.length > 0) {
    pendingActions.push({ type: "health", label: "Confirmar medicamentos do dia", href: "/saude/medicamentos", icon: "💊", urgency: "high" });
  }
  const todayCheckin = checkins?.find(c => c.checkin_date === todayStr);
  if (!todayCheckin) {
    pendingActions.push({ type: "routine", label: "Registrar check-in de hoje", href: "/checkin", icon: "✅", urgency: "medium" });
  }
  if (pendingDecisions && pendingDecisions.length > 0) {
    pendingActions.push({
      type: "routine",
      label: pendingDecisions.length === 1
        ? "1 decisão pendente"
        : `${pendingDecisions.length} decisões pendentes`,
      href: "/decisoes",
      icon: "🗳️",
      urgency: "medium",
    });
  }
  if (swapRequests && swapRequests.length > 0) {
    pendingActions.push({
      type: "custody",
      label: swapRequests.length === 1
        ? "1 troca de guarda pendente"
        : `${swapRequests.length} trocas de guarda pendentes`,
      href: "/calendario",
      icon: "🔄",
      urgency: "medium",
    });
  }

  // Child summaries with richer data
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

    // Find next activity name
    const futureActivities = childActivities.filter(o => o.occurrence_date >= todayStr);
    const nextActivity = futureActivities.length > 0
      ? (futureActivities[0].child_activities as unknown as { name: string } | null)?.name || null
      : null;

    // Illness name if sick
    const illnessName = childIllnesses.length > 0 ? childIllnesses[0].title : null;

    // Has any data this week?
    const hasActivity = childActivities.length > 0 || childCheckins.length > 0 || childAppts.length > 0;

    return {
      id: child.id,
      name: getDisplayName((child as unknown as { full_name: string }).full_name, true),
      healthStatus,
      appointmentsCount: childAppts.length,
      activitiesCount: childActivities.length,
      checkinsCount: childCheckins.length,
      medsCount: childMeds.length,
      nextActivity,
      illnessName,
      hasActivity,
    };
  });

  // KPIs
  const totalEvents = activityOccurrences?.length || 0;
  const totalCheckins = checkins?.length || 0;
  const medsCount = activeMeds?.length || 0;
  const pendingCount = pendingActions.length;
  const messagesCount = messagesResult?.count ?? 0;
  const appointmentsCount = appointments?.length || 0;

  // Count active days (days with at least one event or checkin)
  const activeDaysSet = new Set<string>();
  Object.keys(eventsByDay).forEach(k => activeDaysSet.add(k));
  Object.keys(checkinsByDay).forEach(k => activeDaysSet.add(k));
  const activeDays = activeDaysSet.size;

  // ─── INTELLIGENT HEADER ───
  const hasSickChild = childSummaries.some(c => c.healthStatus === "sick");
  const sickChildName = childSummaries.find(c => c.healthStatus === "sick")?.name || "";

  // Plural BR consistente — sem o anti-pattern "item(ns) pendente(s)". Bug
  // F#63 do E2E PRD 2026-05-25: header rendia "Semana equilibrada com 1
  // item(ns) pendente(s)" — singular e plural misturados via parênteses.
  const pendItems = pendingCount === 1 ? "1 item pendente" : `${pendingCount} itens pendentes`;
  const pendPluralOnly = pendingCount === 1 ? "1 pendência aberta" : `${pendingCount} pendências abertas`;

  let headerText = "";
  if (hasSickChild && pendingCount > 1) {
    headerText = `${pendingCount} pendências e atenção à saúde de ${sickChildName}`;
  } else if (hasSickChild) {
    headerText = `Atenção à saúde de ${sickChildName} esta semana`;
  } else if (pendingCount >= 3) {
    headerText = `${pendPluralOnly} que precisam de ação`;
  } else if (totalEvents > 10) {
    headerText = "Rotina intensa com múltiplas atividades";
  } else if (totalEvents >= 5) {
    headerText = "Semana ativa e bem organizada";
  } else if (pendingCount === 0 && totalEvents <= 3) {
    headerText = "Semana leve e organizada";
  } else if (pendingCount > 0) {
    headerText = `Semana equilibrada com ${pendItems}`;
  } else {
    headerText = "Rotina estável — tudo sob controle";
  }

  // ─── INTELLIGENT INSIGHT ───
  let insight = "";
  if (hasSickChild) {
    insight = `${sickChildName} apresentou sinais recentes — acompanhe de perto a evolução.`;
  } else if (totalEvents > 10 && activeDays >= 5) {
    insight = `Semana cheia com ${totalEvents} atividades em ${activeDays} dias. Priorizem descanso.`;
  } else if (totalCheckins >= 5) {
    insight = `Ótima consistência com ${totalCheckins} check-ins registrados. Continuem assim!`;
  } else if (pendingCount === 0 && totalEvents > 0) {
    insight = "Rotina estável e sem pendências — bom momento para qualidade de tempo.";
  } else if (totalEvents === 0 && totalCheckins === 0) {
    insight = "Semana com poucos registros. Mantenham o hábito de registrar a rotina.";
  } else if (pendingCount >= 3) {
    insight = `${pendingCount} itens aguardando ação — resolva hoje para manter o dia em ordem.`;
  } else if (medsCount > 0) {
    insight = `${medsCount} medicamento(s) ativo(s) esta semana. Não esqueçam as doses.`;
  } else {
    insight = "Boa consistência na rotina familiar. Continuem organizados!";
  }

  let weekMood: "calm" | "busy" | "alert" = "calm";
  if (hasSickChild) weekMood = "alert";
  else if (totalEvents > 8 || pendingCount > 3) weekMood = "busy";

  return (
    <WeeklySummaryClient
      weekMood={weekMood}
      headerText={headerText}
      weekDays={weekDays}
      custodyByDay={custodyByDay}
      eventsByDay={eventsByDay}
      checkinsByDay={checkinsByDay}
      healthAlertDays={Array.from(healthAlertDays)}
      kpis={{ totalEvents, totalCheckins, medsCount, pendingCount, messagesCount, appointmentsCount, activeDays }}
      pendingActions={pendingActions.slice(0, 3)}
      childSummaries={childSummaries}
      nextSwaps={(swapRequests || []).slice(0, 3).map(s => ({
        id: s.id, date: s.original_date, type: s.type,
        isIncoming: s.target_user_id === user.id,
      }))}
      custodyEnabled={custodyEnabled}
      insight={insight}
      parentColors={parentColors}
    />
  );
}
