import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getActiveGroup } from "@/lib/group-utils";
import { PARENT_COLORS, getDisplayName } from "@/lib/constants";
import {
  buildCustodyMap,
  getNextWeekends,
  formatDateKey,
  computeSwapBalance,
  getBrazilToday,
  type ParentColorMap,
  type CustodyEvent,
} from "@/lib/calendar-utils";
import { getOccurrences, parseDaysOfWeek, type ActivityRecurrence } from "@/lib/recurrence-utils";
import dynamic from "next/dynamic";
import CalendarHeader from "./CalendarHeader";

export const maxDuration = 60;

const CalendarClient = dynamic(() => import("./CalendarClient"), {
  loading: () => <div className="animate-pulse bg-gray-100 rounded-xl h-96" />,
});

export default async function CalendarPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const activeGroup = await getActiveGroup(supabase, user.id);
  if (!activeGroup) redirect("/onboarding");
  const { groupId } = activeGroup;

  // Compute date ranges for queries
  const todayParts = getBrazilToday().split("-").map(Number);
  const now = new Date(todayParts[0], todayParts[1] - 1, todayParts[2], 12, 0, 0);
  const threeMonthsAgo = new Date(todayParts[0], todayParts[1] - 1 - 3, 1);
  const threeMonthsAhead = new Date(todayParts[0], todayParts[1] - 1 + 4, 0);
  const rangeStart = formatDateKey(threeMonthsAgo);
  const rangeEnd = formatDateKey(threeMonthsAhead);

  // Run all Supabase queries in parallel
  const [
    { data: members },
    { data: events },
    { data: rawActivities },
    { data: socialEvents },
    { data: appointments },
    { data: swapRequests },
    { data: activityReports },
  ] = await Promise.all([
    supabase
      .from("group_members")
      .select("user_id, role, joined_at, profiles(full_name)")
      .eq("group_id", groupId)
      .order("joined_at", { ascending: true }),
    supabase
      .from("custody_events")
      .select("*, children(full_name), profiles!custody_events_responsible_user_id_fkey(full_name)")
      .eq("group_id", groupId)
      .gte("end_date", rangeStart)
      .lte("start_date", rangeEnd)
      .order("start_date"),
    supabase
      .from("child_activities")
      .select("id, name, category, recurrence_type, start_date, end_date, days_of_week, day_of_month, custom_interval, custom_unit, time_start, time_end, location, notes, child_id, teacher_name, class_name, room, responsible_id, children(full_name), activity_checklist_items(id, name, sort_order)")
      .eq("group_id", groupId)
      .eq("is_active", true),
    supabase
      .from("events")
      .select("id, title, description, event_date, event_time, location, child_id, status, all_day, end_date, assigned_to, category, children(full_name)")
      .eq("group_id", groupId)
      .neq("status", "cancelled")
      .gte("event_date", rangeStart)
      .lte("event_date", rangeEnd),
    supabase
      .from("medical_appointments")
      .select("id, title, appointment_type, appointment_date, location, child_id, status, children(full_name)")
      .eq("group_id", groupId)
      .eq("status", "scheduled")
      .gte("appointment_date", rangeStart + "T00:00:00-03:00")
      .lte("appointment_date", rangeEnd + "T23:59:59-03:00"),
    supabase
      .from("swap_requests")
      .select("*, requester:profiles!swap_requests_requester_id_fkey(full_name), target:profiles!swap_requests_target_user_id_fkey(full_name)")
      .eq("group_id", groupId)
      .in("status", ["pending", "approved"])
      .order("created_at", { ascending: false })
      .limit(10),
    supabase
      .from("activity_reports")
      .select("activity_id, occurrence_date, status, notes, child_mood, responsible_override, responsible_override_id, overrides")
      .eq("group_id", groupId)
      .gte("occurrence_date", rangeStart)
      .lte("occurrence_date", rangeEnd),
  ]);

  // Fetch checklist completions for the visible range
  const activityIds = (rawActivities || []).map((a: any) => a.id);
  let checklistCompletions: { activity_id: string; item_id: string; occurrence_date: string }[] = [];
  if (activityIds.length > 0) {
    const { data: completions } = await supabase
      .from("checklist_completions")
      .select("activity_id, item_id, occurrence_date")
      .in("activity_id", activityIds)
      .gte("occurrence_date", rangeStart)
      .lte("occurrence_date", rangeEnd);
    checklistCompletions = completions || [];
  }

  // Build completions lookup: "activityId:date" -> Set of completed item IDs
  const completionsLookup: Record<string, Set<string>> = {};
  for (const c of checklistCompletions) {
    const key = `${c.activity_id}:${c.occurrence_date}`;
    if (!completionsLookup[key]) completionsLookup[key] = new Set();
    completionsLookup[key].add(c.item_id);
  }

  // Assign distinct colors by join order
  const allColors = [
    PARENT_COLORS.primary,   // teal
    PARENT_COLORS.secondary, // coral/red
    "#8B5CF6",               // violet
    "#F59E0B",               // amber
    "#3B82F6",               // blue
    "#EC4899",               // pink
  ];
  const allMembersMap: ParentColorMap = {};
  let currentUserRole = "member";
  (members || []).forEach((m, i) => {
    const p = Array.isArray(m.profiles) ? m.profiles[0] : m.profiles;
    allMembersMap[m.user_id] = {
      name: getDisplayName(p?.full_name),
      color: allColors[i] || allColors[allColors.length - 1],
    };
    if (m.user_id === user.id) {
      currentUserRole = m.role;
    }
  });

  const custodyEvents = (events || []) as CustodyEvent[];
  const custodyMap = buildCustodyMap(custodyEvents, allMembersMap);

  // Convert map to serializable object for client
  const custodyMapObj: Record<string, { userId: string; userName: string; color: string }> = {};
  custodyMap.forEach((v, k) => { custodyMapObj[k] = v; });

  // Detect custody change for tomorrow (for banner)
  const todayKey = getBrazilToday();
  const tomorrowDate = new Date(todayKey + "T12:00:00");
  tomorrowDate.setDate(tomorrowDate.getDate() + 1);
  const tomorrowKey = formatDateKey(tomorrowDate);

  const todayCustody = custodyMap.get(todayKey);
  const tomorrowCustody = custodyMap.get(tomorrowKey);

  let custodyChangeBanner: { childNames: string; parentName: string } | null = null;
  if (todayCustody && tomorrowCustody && todayCustody.userId !== tomorrowCustody.userId) {
    // Find child names from events covering tomorrow
    const childNamesSet = new Set<string>();
    for (const evt of custodyEvents) {
      if (tomorrowKey >= evt.start_date && tomorrowKey <= evt.end_date) {
        const childName = (evt.children as { full_name: string } | null)?.full_name;
        if (childName) childNamesSet.add(childName.split(" ")[0]);
      }
    }
    custodyChangeBanner = {
      childNames: childNamesSet.size > 0 ? Array.from(childNamesSet).join(", ") : "a crianca",
      parentName: tomorrowCustody.userName.split(" ")[0],
    };
  }

  // Build parentColors with only members who have events (for legend)
  const usersWithEvents = new Set<string>();
  custodyEvents.forEach((evt) => usersWithEvents.add(evt.responsible_user_id));
  const parentColors: ParentColorMap = {};
  for (const userId of usersWithEvents) {
    if (allMembersMap[userId]) {
      parentColors[userId] = allMembersMap[userId];
    }
  }

  // Swap balance
  const swapBalance = computeSwapBalance(
    custodyEvents,
    allMembersMap,
    rangeStart,
    rangeEnd
  );

  // Weekend planner
  const weekends = getNextWeekends(8, custodyMap, user.id);

  // Build report lookup: "activityId:date" -> report info
  const reportLookup: Record<string, { status: string; notes: string | null; child_mood: string | null; responsible_override?: string | null; responsible_override_id?: string | null; overrides?: Record<string, unknown> | null }> = {};
  if (activityReports) {
    for (const r of activityReports) {
      reportLookup[`${r.activity_id}:${r.occurrence_date}`] = {
        status: r.status,
        notes: r.notes,
        child_mood: r.child_mood,
        responsible_override: (r as any).responsible_override || null,
        responsible_override_id: (r as any).responsible_override_id || null,
        overrides: (r as any).overrides || null,
      };
    }
  }

  // Build memberNames lookup for assigned_to resolution
  const memberNames: Record<string, string> = {};
  for (const [uid, info] of Object.entries(allMembersMap)) {
    memberNames[uid] = info.name;
  }

  // Build activity occurrences map for the visible range
  const activityDateMap: Record<string, { id: string; name: string; category: string; time_start: string | null; time_end?: string | null; location: string | null; childName: string; checklistCount: number; description?: string | null; all_day?: boolean; assigned_to_name?: string | null; report?: { status: string; notes: string | null; child_mood: string | null; responsible_override?: string | null; responsible_override_id?: string | null } | null; recurrence_type?: string; teacher_name?: string | null; class_name?: string | null; room?: string | null; responsible_id?: string | null; responsible_name?: string | null; checklistItems?: { id: string; name: string; completed: boolean }[] }[]> = {};
  if (rawActivities) {
    for (const act of rawActivities) {
      const recurrence: ActivityRecurrence = {
        recurrence_type: act.recurrence_type as any,
        start_date: act.start_date,
        end_date: act.end_date,
        days_of_week: parseDaysOfWeek(act.days_of_week),
        day_of_month: act.day_of_month,
        custom_interval: act.custom_interval || 1,
        custom_unit: (act.custom_unit as any) || "week",
      };
      const occurrences = getOccurrences(recurrence, rangeStart, rangeEnd);
      const childName = (act.children as any)?.full_name?.split(" ")[0] || "Todos";
      const rawChecklistItems = ((act.activity_checklist_items as any[]) || []).sort((a: any, b: any) => (a.sort_order || 0) - (b.sort_order || 0));
      const checklistCount = rawChecklistItems.length;
      const responsibleName = (act as any).responsible_id ? (memberNames[(act as any).responsible_id] || null) : null;
      for (const dateKey of occurrences) {
        const report = reportLookup[`${act.id}:${dateKey}`] || null;
        // Skip cancelled occurrences (single-day deletions)
        if (report?.status === "cancelled") continue;
        if (!activityDateMap[dateKey]) activityDateMap[dateKey] = [];
        // Build checklist items with completion status for this date
        const completedSet = completionsLookup[`${act.id}:${dateKey}`] || new Set<string>();
        const checklistItems = rawChecklistItems.map((item: any) => ({
          id: item.id,
          name: item.name,
          completed: completedSet.has(item.id),
        }));
        // Apply per-occurrence overrides if present
        const ov = report?.overrides as Record<string, unknown> | null | undefined;
        activityDateMap[dateKey].push({
          id: act.id,
          name: (ov?.name as string) || act.name,
          category: act.category,
          time_start: ov?.time_start !== undefined ? (ov.time_start as string | null) : act.time_start,
          time_end: ov?.time_end !== undefined ? (ov.time_end as string | null) : ((act as any).time_end || null),
          location: ov?.location !== undefined ? (ov.location as string | null) : act.location,
          childName,
          checklistCount,
          description: ov?.notes !== undefined ? (ov.notes as string | null) : ((act as any).notes || null),
          report,
          recurrence_type: act.recurrence_type,
          teacher_name: ov?.teacher_name !== undefined ? (ov.teacher_name as string | null) : ((act as any).teacher_name || null),
          class_name: ov?.class_name !== undefined ? (ov.class_name as string | null) : ((act as any).class_name || null),
          room: ov?.room !== undefined ? (ov.room as string | null) : ((act as any).room || null),
          responsible_id: ov?.responsible_id !== undefined ? (ov.responsible_id as string | null) : ((act as any).responsible_id || null),
          responsible_name: ov?.responsible_id ? (memberNames[ov.responsible_id as string] || null) : responsibleName,
          checklistItems,
        });
      }
    }
  }

  // Social events (from events table) — also show as dots on calendar
  if (socialEvents) {
    for (const evt of socialEvents) {
      const dateKey = evt.event_date;
      if (!activityDateMap[dateKey]) activityDateMap[dateKey] = [];
      const childName = (evt.children as any)?.full_name?.split(" ")[0] || "Todos";
      const assignedName = evt.assigned_to ? memberNames[evt.assigned_to] || null : null;
      activityDateMap[dateKey].push({
        id: evt.id,
        name: evt.title,
        category: evt.category || "evento",
        time_start: evt.event_time,
        location: evt.location,
        childName,
        checklistCount: 0,
        description: evt.description || null,
        all_day: evt.all_day || false,
        assigned_to_name: assignedName,
      });
    }
  }

  // Medical appointments — show as health pills on calendar
  if (appointments) {
    for (const apt of appointments) {
      const dateKey = apt.appointment_date?.split("T")[0];
      if (!dateKey) continue;
      if (!activityDateMap[dateKey]) activityDateMap[dateKey] = [];
      const childName = (apt.children as any)?.full_name?.split(" ")[0] || "";
      const time = apt.appointment_date?.split("T")[1]?.slice(0, 5) || null;
      activityDateMap[dateKey].push({
        id: apt.id,
        name: apt.title || "Consulta",
        category: "health",
        time_start: time,
        location: apt.location,
        childName,
        checklistCount: 0,
      });
    }
  }

  return (
    <div className="space-y-4 pb-20">
      {/* Header */}
      <CalendarHeader isReadonly={currentUserRole === "readonly"} />

      {/* Client wrapper for interactive parts */}
      <CalendarClient
        initialYear={now.getFullYear()}
        initialMonth={now.getMonth()}
        custodyMap={custodyMapObj}
        parentColors={parentColors}
        currentUserId={user.id}
        currentUserRole={currentUserRole}
        groupId={groupId}
        weekends={weekends}
        swapBalance={swapBalance}
        custodyChangeBanner={custodyChangeBanner}
        swapRequests={(swapRequests || []).map((r) => {
          const requesterRaw = Array.isArray(r.requester) ? r.requester[0] : r.requester;
          const targetRaw = Array.isArray(r.target) ? r.target[0] : r.target;
          return {
            id: r.id,
            original_date: r.original_date,
            proposed_date: r.proposed_date,
            reason: r.reason,
            status: r.status,
            created_at: r.created_at,
            requester: requesterRaw ? { full_name: requesterRaw.full_name || "Usuario" } : { full_name: "Usuario" },
            target: targetRaw ? { full_name: targetRaw.full_name || "Usuario" } : { full_name: "Usuario" },
            requester_id: r.requester_id,
            target_user_id: r.target_user_id,
          };
        })}
        activities={activityDateMap}
        memberNames={memberNames}
      />
    </div>
  );
}
