import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/supabase/auth-helper";
import { getCachedMembers } from "@/lib/cached-queries";
import { getActiveGroup } from "@/lib/group-utils";
import { PARENT_COLORS, getDisplayName } from "@/lib/constants";
import {
  buildCustodyMap,
  getNextWeekends,
  formatDateKey,
  computeSwapBalance,
  getEffectiveBalance,
  getBrazilToday,
  type BalanceOperation,
  type ParentColorMap,
  type CustodyEvent,
} from "@/lib/calendar-utils";
// getOccurrences removed — occurrences are pre-computed in calendar_occurrences table
import { getBirthdayOccurrences, computeAgeOnDate } from "@/lib/birthday-utils";
import dynamic from "next/dynamic";
import CalendarHeader from "./CalendarHeader";

export const maxDuration = 60;

const CalendarClient = dynamic(() => import("./CalendarClient"), {
  loading: () => <div className="animate-pulse bg-gray-100 rounded-xl h-96" />,
});

export default async function CalendarPage({ searchParams }: { searchParams: Promise<{ day?: string; eventId?: string }> }) {
  const params = await searchParams;
  const { supabase, user } = await getSessionUser();
  if (!user) redirect("/login");

  const activeGroup = await getActiveGroup(supabase, user.id);
  if (!activeGroup) redirect("/onboarding");
  const { groupId, custodyEnabled } = activeGroup;

  // Compute date ranges for queries
  const todayParts = getBrazilToday().split("-").map(Number);
  const now = new Date(todayParts[0], todayParts[1] - 1, todayParts[2], 12, 0, 0);
  // Range: 1 month back + 12 months ahead (full year view)
  const threeMonthsAgo = new Date(todayParts[0], todayParts[1] - 1 - 1, 1);
  const threeMonthsAhead = new Date(todayParts[0], todayParts[1] - 1 + 13, 0);
  const rangeStart = formatDateKey(threeMonthsAgo);
  const rangeEnd = formatDateKey(threeMonthsAhead);

  // Run all Supabase queries in parallel
  const [
    members,
    { data: events },
    { data: rawActivities },
    { data: socialEvents },
    { data: appointments },
    { data: swapRequests },
    { data: eventRequests },
    { data: activityReports },
    { data: rawChecklistCompletions },
    { data: balanceOperations },
    { data: birthdayChildren },
  ] = await Promise.all([
    getCachedMembers(groupId),
    custodyEnabled
      ? supabase
          .from("custody_events")
          .select("id, start_date, end_date, responsible_user_id, child_id, custody_type, notes, group_id, created_by, children(full_name), profiles!custody_events_responsible_user_id_fkey(full_name)")
          .eq("group_id", groupId)
          .gte("end_date", rangeStart)
          .lte("start_date", rangeEnd)
          .order("start_date")
          .then(r => r, () => ({ data: [] as never[] }))
      : Promise.resolve({ data: [] as never[] }),
    supabase
      .from("calendar_occurrences")
      .select("occurrence_date, activity_id, child_activities!inner(id, name, category, recurrence_type, time_start, time_end, location, notes, child_id, teacher_name, class_name, room, responsible_id, children(full_name), activity_checklist_items(id, name, sort_order))")
      .eq("group_id", groupId)
      .gte("occurrence_date", rangeStart)
      .lte("occurrence_date", rangeEnd)
      .limit(500)
      .then(r => r, () => ({ data: [] as never[] })),
    supabase
      .from("events")
      .select("id, title, description, event_date, event_time, location, child_id, status, all_day, end_date, assigned_to, created_by, children(full_name)")
      .eq("group_id", groupId)
      .neq("status", "cancelled")
      .gte("event_date", rangeStart)
      .lte("event_date", rangeEnd)
      .limit(200)
      .then(r => r, () => ({ data: [] as never[] })),
    supabase
      .from("medical_appointments")
      .select("id, title, appointment_type, appointment_date, location, child_id, status, children(full_name)")
      .eq("group_id", groupId)
      .eq("status", "scheduled")
      .gte("appointment_date", rangeStart + "T00:00:00-03:00")
      .lte("appointment_date", rangeEnd + "T23:59:59-03:00")
      .then(r => r, () => ({ data: [] as never[] })),
    supabase
      .from("swap_requests")
      .select("id, original_date, proposed_date, reason, status, created_at, requester_id, target_user_id, requester:profiles!swap_requests_requester_id_fkey(full_name), target:profiles!swap_requests_target_user_id_fkey(full_name)")
      .eq("group_id", groupId)
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(10)
      .then(r => r, () => ({ data: [] as never[] })),
    supabase
      .from("event_requests")
      .select("id, event_id, action_type, proposed_changes, original_snapshot, reason, status, created_at, requester_id, affected_user_ids, requester:profiles!event_requests_requester_id_fkey(full_name, avatar_url)")
      .eq("group_id", groupId)
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(20)
      .then(r => r, () => ({ data: [] as never[] })),
    supabase
      .from("activity_reports")
      .select("activity_id, occurrence_date, status, notes, child_mood, responsible_override, overrides")
      .eq("group_id", groupId)
      .gte("occurrence_date", rangeStart)
      .lte("occurrence_date", rangeEnd)
      .limit(500)
      .then(r => r, () => ({ data: [] as never[] })),
    supabase
      .from("checklist_completions")
      .select("activity_id, item_id, occurrence_date, child_activities!inner(group_id)")
      .eq("child_activities.group_id", groupId)
      .gte("occurrence_date", rangeStart)
      .lte("occurrence_date", rangeEnd)
      .limit(1000)
      .then(r => r, () => ({ data: [] as never[] })),
    supabase
      .from("custody_balance_operations")
      .select("id, operation_type, status, days, direction, related_date, notes, created_at, responded_at, proposed_by, target_user_id, proposer:profiles!custody_balance_operations_proposed_by_fkey(full_name), target:profiles!custody_balance_operations_target_user_id_fkey(full_name)")
      .eq("group_id", groupId)
      .order("created_at", { ascending: false })
      .limit(50)
      .then(r => r, () => ({ data: [] as never[] })),
    supabase
      .from("children")
      .select("id, full_name, birth_date")
      .eq("group_id", groupId)
      .then(r => r, () => ({ data: [] as never[] })),
  ]);

  const checklistCompletions = (rawChecklistCompletions || []) as { activity_id: string; item_id: string; occurrence_date: string }[];

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

  const custodyEvents = (events || []) as unknown as CustodyEvent[];
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
      childNames: childNamesSet.size > 0 ? Array.from(childNamesSet).join(", ") : "a criança",
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

  // Swap balance (raw, from events)
  const swapBalance = computeSwapBalance(
    custodyEvents,
    allMembersMap,
    rangeStart,
    rangeEnd
  );

  // Balance operations ledger (approved + pending)
  const rawBalanceOps = (balanceOperations || []) as unknown as Array<{
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
    proposer: { full_name: string } | null | Array<{ full_name: string }>;
    target: { full_name: string } | null | Array<{ full_name: string }>;
  }>;

  const normalizedOps: BalanceOperation[] = rawBalanceOps.map((op) => ({
    id: op.id,
    operation_type: op.operation_type as BalanceOperation["operation_type"],
    proposed_by: op.proposed_by,
    target_user_id: op.target_user_id,
    status: op.status as BalanceOperation["status"],
    days: op.days,
    direction: op.direction as BalanceOperation["direction"],
    related_date: op.related_date,
    notes: op.notes,
    created_at: op.created_at,
    responded_at: op.responded_at,
  }));

  const effectiveBalance = getEffectiveBalance(swapBalance, normalizedOps);

  const balanceOpsList = rawBalanceOps.map((op) => {
    const proposerRaw = Array.isArray(op.proposer) ? op.proposer[0] : op.proposer;
    const targetRaw = Array.isArray(op.target) ? op.target[0] : op.target;
    return {
      id: op.id,
      operation_type: op.operation_type,
      status: op.status,
      days: op.days,
      direction: op.direction,
      related_date: op.related_date,
      notes: op.notes,
      created_at: op.created_at,
      responded_at: op.responded_at,
      proposed_by: op.proposed_by,
      target_user_id: op.target_user_id,
      proposer: proposerRaw ? { full_name: proposerRaw.full_name || "Usuário" } : null,
      target: targetRaw ? { full_name: targetRaw.full_name || "Usuário" } : null,
    };
  });

  // Weekend planner
  const weekends = getNextWeekends(8, custodyMap, user.id);

  // Build report lookup: "activityId:date" -> report info
  const reportLookup: Record<string, { status: string; notes: string | null; child_mood: string | null; responsible_override?: string | null; overrides?: Record<string, unknown> | null }> = {};
  if (activityReports) {
    for (const r of activityReports) {
      reportLookup[`${r.activity_id}:${r.occurrence_date}`] = {
        status: r.status,
        notes: r.notes,
        child_mood: r.child_mood,
        responsible_override: r.responsible_override || null,
        overrides: r.overrides || null,
      };
    }
  }

  // Build memberNames lookup for assigned_to resolution
  const memberNames: Record<string, string> = {};
  for (const [uid, info] of Object.entries(allMembersMap)) {
    memberNames[uid] = info.name;
  }

  // Build activity occurrences map from pre-computed calendar_occurrences table
  // No more runtime recurrence expansion — dates come straight from the DB
  type ActivityEntry = { id: string; name: string; category: string; time_start: string | null; time_end?: string | null; location: string | null; childName: string; checklistCount: number; description?: string | null; all_day?: boolean; assigned_to_name?: string | null; report?: { status: string; notes: string | null; child_mood: string | null; responsible_override?: string | null; responsible_override_id?: string | null } | null; recurrence_type?: string; teacher_name?: string | null; class_name?: string | null; room?: string | null; responsible_id?: string | null; responsible_name?: string | null; checklistItems?: { id: string; name: string; completed: boolean }[]; source?: "activity" | "event" | "appointment" | "birthday" };
  const activityDateMap: Record<string, ActivityEntry[]> = {};
  if (rawActivities) {
    for (const occ of rawActivities) {
      const dateKey = occ.occurrence_date;
      const act = Array.isArray(occ.child_activities) ? occ.child_activities[0] : occ.child_activities;
      if (!act) continue;

      const report = reportLookup[`${act.id}:${dateKey}`] || null;
      if (report?.status === "cancelled") continue;
      if (!activityDateMap[dateKey]) activityDateMap[dateKey] = [];

      const childName = (act.children as unknown as { full_name: string | null } | null)?.full_name?.split(" ")[0] || "Todos";
      const rawChecklistItems = ((act.activity_checklist_items as { id: string; name: string; sort_order: number }[]) || []).sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
      const checklistCount = rawChecklistItems.length;
      const responsibleName = act.responsible_id ? (memberNames[act.responsible_id as string] || null) : null;

      const completedSet = completionsLookup[`${act.id}:${dateKey}`] || new Set<string>();
      const checklistItems = rawChecklistItems.map((item) => ({
        id: item.id,
        name: item.name,
        completed: completedSet.has(item.id),
      }));

      const ov = report?.overrides as Record<string, unknown> | null | undefined;
      activityDateMap[dateKey].push({
        id: act.id,
        name: (ov?.name as string) || act.name,
        category: act.category,
        time_start: ov?.time_start !== undefined ? (ov.time_start as string | null) : act.time_start,
        time_end: ov?.time_end !== undefined ? (ov.time_end as string | null) : (act.time_end || null),
        location: ov?.location !== undefined ? (ov.location as string | null) : act.location,
        childName,
        checklistCount,
        description: ov?.notes !== undefined ? (ov.notes as string | null) : (act.notes || null),
        report,
        recurrence_type: act.recurrence_type,
        teacher_name: ov?.teacher_name !== undefined ? (ov.teacher_name as string | null) : (act.teacher_name || null),
        class_name: ov?.class_name !== undefined ? (ov.class_name as string | null) : (act.class_name || null),
        room: ov?.room !== undefined ? (ov.room as string | null) : (act.room || null),
        responsible_id: ov?.responsible_id !== undefined ? (ov.responsible_id as string | null) : (act.responsible_id || null),
        responsible_name: ov?.responsible_id ? (memberNames[ov.responsible_id as string] || null) : responsibleName,
        checklistItems,
        source: "activity" as const,
      });
    }
  }

  // Social events (from events table) — also show as dots on calendar
  if (socialEvents) {
    for (const evt of socialEvents) {
      const dateKey = evt.event_date;
      if (!activityDateMap[dateKey]) activityDateMap[dateKey] = [];
      const childName = (evt.children as unknown as { full_name: string | null } | null)?.full_name?.split(" ")[0] || "Todos";
      const assignedName = evt.assigned_to ? memberNames[evt.assigned_to] || null : null;
      activityDateMap[dateKey].push({
        id: evt.id,
        name: evt.title,
        category: "evento",
        time_start: evt.event_time,
        location: evt.location,
        childName,
        checklistCount: 0,
        description: evt.description || null,
        all_day: evt.all_day || false,
        assigned_to_name: assignedName,
        source: "event" as const,
      });
    }
  }

  // Medical appointments — show as health pills on calendar
  if (appointments) {
    for (const apt of appointments) {
      const dateKey = apt.appointment_date?.split("T")[0];
      if (!dateKey) continue;
      if (!activityDateMap[dateKey]) activityDateMap[dateKey] = [];
      const childName = (apt.children as unknown as { full_name: string | null } | null)?.full_name?.split(" ")[0] || "";
      const time = apt.appointment_date?.split("T")[1]?.slice(0, 5) || null;
      activityDateMap[dateKey].push({
        id: apt.id,
        name: apt.title || "Consulta",
        category: "health",
        time_start: time,
        location: apt.location,
        childName,
        checklistCount: 0,
        source: "appointment" as const,
      });
    }
  }

  // Children's birthdays — derived from children.birth_date.
  // Render as all-day pills on every birthday occurrence within the visible range.
  if (birthdayChildren) {
    for (const child of birthdayChildren as { id: string; full_name: string | null; birth_date: string | null }[]) {
      if (!child.birth_date) continue;
      const firstName = (child.full_name || "").split(" ")[0] || "criança";
      const occurrences = getBirthdayOccurrences(child.birth_date, rangeStart, rangeEnd);
      for (const dateKey of occurrences) {
        if (!activityDateMap[dateKey]) activityDateMap[dateKey] = [];
        const age = computeAgeOnDate(child.birth_date, dateKey);
        activityDateMap[dateKey].push({
          id: `birthday-${child.id}-${dateKey.slice(0, 4)}`,
          name: `🎂 Aniversário de ${firstName}`,
          category: "birthday",
          time_start: null,
          location: null,
          childName: firstName,
          checklistCount: 0,
          all_day: true,
          description: age >= 0 ? `${age} ${age === 1 ? "ano" : "anos"}` : null,
          source: "birthday" as const,
        });
      }
    }
  }

  return (
    <div className="space-y-4 pb-20">
      {/* Header */}
      <CalendarHeader isReadonly={currentUserRole === "readonly"} />

      {/* Client wrapper for interactive parts */}
      <CalendarClient
        initialYear={params.day ? parseInt(params.day.split("-")[0]) : now.getFullYear()}
        initialMonth={params.day ? parseInt(params.day.split("-")[1]) - 1 : now.getMonth()}
        deepLinkDay={params.day || null}
        deepLinkEventId={params.eventId || null}
        custodyMap={custodyMapObj}
        parentColors={parentColors}
        currentUserId={user.id}
        currentUserRole={currentUserRole}
        groupId={groupId}
        custodyEnabled={custodyEnabled}
        weekends={weekends}
        swapBalance={swapBalance}
        effectiveBalance={effectiveBalance}
        balanceOperations={balanceOpsList}
        custodyChangeBanner={custodyChangeBanner}
        eventRequests={(eventRequests || []).map((r: Record<string, unknown>) => {
          const requesterRaw = Array.isArray(r.requester) ? r.requester[0] : r.requester;
          return {
            id: r.id as string,
            event_id: r.event_id as string,
            action_type: r.action_type as string,
            proposed_changes: r.proposed_changes as Record<string, unknown> | null,
            original_snapshot: r.original_snapshot as Record<string, unknown>,
            reason: r.reason as string | null,
            status: r.status as string,
            created_at: r.created_at as string,
            requester_id: r.requester_id as string,
            affected_user_ids: r.affected_user_ids as string[],
            requester: requesterRaw ? { full_name: (requesterRaw as Record<string, unknown>).full_name as string || "Usuário", avatar_url: (requesterRaw as Record<string, unknown>).avatar_url as string | null } : null,
          };
        })}
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
            requester: requesterRaw ? { full_name: requesterRaw.full_name || "Usuário" } : { full_name: "Usuário" },
            target: targetRaw ? { full_name: targetRaw.full_name || "Usuário" } : { full_name: "Usuário" },
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
