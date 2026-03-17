import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { PARENT_COLORS } from "@/lib/constants";
import {
  buildCustodyMap,
  getNextWeekends,
  formatDateKey,
  type ParentColorMap,
  type CustodyEvent,
} from "@/lib/calendar-utils";
import CalendarClient from "./CalendarClient";

export default async function CalendarPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: memberships } = await supabase
    .from("group_members")
    .select("group_id")
    .eq("user_id", user.id);

  if (!memberships || memberships.length === 0) redirect("/onboarding");
  const groupId = memberships[0].group_id;

  // Get all members ordered by join date (for color assignment)
  const { data: members } = await supabase
    .from("group_members")
    .select("user_id, role, joined_at, profiles(full_name)")
    .eq("group_id", groupId)
    .order("joined_at", { ascending: true });

  // Assign colors by join order
  const colors = [PARENT_COLORS.primary, PARENT_COLORS.secondary];
  const parentColors: ParentColorMap = {};
  (members || []).forEach((m, i) => {
    const p = Array.isArray(m.profiles) ? m.profiles[0] : m.profiles;
    parentColors[m.user_id] = {
      name: p?.full_name || "Usuario",
      color: colors[i] || colors[1],
    };
  });

  // Get custody events (wide range for weekend planner)
  const now = new Date();
  const threeMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 3, 1);
  const threeMonthsAhead = new Date(now.getFullYear(), now.getMonth() + 4, 0);

  const { data: events } = await supabase
    .from("custody_events")
    .select("*, children(full_name), profiles!custody_events_responsible_user_id_fkey(full_name)")
    .eq("group_id", groupId)
    .gte("end_date", formatDateKey(threeMonthsAgo))
    .lte("start_date", formatDateKey(threeMonthsAhead))
    .order("start_date");

  const custodyEvents = (events || []) as CustodyEvent[];
  const custodyMap = buildCustodyMap(custodyEvents, parentColors);

  // Convert map to serializable object for client
  const custodyMapObj: Record<string, { userId: string; userName: string; color: string }> = {};
  custodyMap.forEach((v, k) => { custodyMapObj[k] = v; });

  // Weekend planner
  const weekends = getNextWeekends(8, custodyMap, user.id);

  // Swap requests
  const { data: swapRequests } = await supabase
    .from("swap_requests")
    .select("*, requester:profiles!swap_requests_requester_id_fkey(full_name), target:profiles!swap_requests_target_user_id_fkey(full_name)")
    .eq("group_id", groupId)
    .in("status", ["pending", "approved"])
    .order("created_at", { ascending: false })
    .limit(10);

  return (
    <div className="space-y-4 pb-20">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-dark">Calendario</h1>
        <div className="flex gap-2">
          <Link
            href="/calendario/escala"
            className="px-4 py-2 bg-white text-primary text-sm font-semibold rounded-lg border border-primary hover:bg-primary/5 transition-colors"
          >
            Escala
          </Link>
          <Link
            href="/calendario/novo"
            className="px-4 py-2 bg-primary text-white text-sm font-semibold rounded-lg hover:bg-primary-dark transition-colors"
          >
            + Evento
          </Link>
        </div>
      </div>

      {/* Client wrapper for interactive parts */}
      <CalendarClient
        initialYear={now.getFullYear()}
        initialMonth={now.getMonth()}
        custodyMap={custodyMapObj}
        parentColors={parentColors}
        currentUserId={user.id}
        groupId={groupId}
        weekends={weekends}
        swapRequests={(swapRequests || []).map((r) => ({
          id: r.id,
          original_date: r.original_date,
          proposed_date: r.proposed_date,
          reason: r.reason,
          status: r.status,
          created_at: r.created_at,
          requester: Array.isArray(r.requester) ? r.requester[0] : r.requester,
          target: Array.isArray(r.target) ? r.target[0] : r.target,
          requester_id: r.requester_id,
          target_user_id: r.target_user_id,
        }))}
      />
    </div>
  );
}
