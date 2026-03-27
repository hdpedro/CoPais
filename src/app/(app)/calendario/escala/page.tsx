import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getActiveGroup } from "@/lib/group-utils";
import dynamic from "next/dynamic";
import EscalaHeader from "./EscalaHeader";

const ScheduleBuilder = dynamic(() => import("./ScheduleBuilder"), {
  loading: () => <div className="animate-pulse bg-gray-100 rounded-xl h-96" />,
});

export default async function SchedulePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const activeGroup = await getActiveGroup(supabase, user.id);
  if (!activeGroup) redirect("/onboarding");
  if (activeGroup.isReadonly) redirect("/dashboard");
  const { groupId } = activeGroup;

  const { data: children } = await supabase
    .from("children")
    .select("id, full_name")
    .eq("group_id", groupId);

  const { data: members } = await supabase
    .from("group_members")
    .select("user_id, role, profiles(full_name)")
    .eq("group_id", groupId)
    .order("joined_at", { ascending: true });

  // Only the two co-parents participate in the custody schedule
  const parentMembers = (members || [])
    .filter((m) => m.role === "admin" || m.role === "member")
    .slice(0, 2);

  const membersList = parentMembers.map((m, i) => ({
    user_id: m.user_id,
    full_name: (Array.isArray(m.profiles) ? m.profiles[0] : m.profiles)?.full_name || "Usuario",
    color: i === 0 ? "#5B9E85" : "#D4735A",
  }));

  // Check if there's already a schedule configured (any regular events)
  const { data: existingEvents } = await supabase
    .from("custody_events")
    .select("id")
    .eq("group_id", groupId)
    .eq("custody_type", "regular")
    .limit(1);

  const hasExistingSchedule = (existingEvents || []).length > 0;

  // Try to load saved schedule configuration first
  let existingPattern: (string | null)[] | null = null;
  let existingStartDate: string | null = null;

  const { data: savedSchedule } = await supabase
    .from("custody_schedules")
    .select("pattern, start_date")
    .eq("group_id", groupId)
    .limit(1)
    .single();

  if (savedSchedule) {
    existingPattern = savedSchedule.pattern as (string | null)[];
    existingStartDate = savedSchedule.start_date;
  } else if (hasExistingSchedule) {
    // Fallback: reconstruct pattern from events
    const { data: scheduleEvents } = await supabase
      .from("custody_events")
      .select("start_date, end_date, responsible_user_id")
      .eq("group_id", groupId)
      .eq("custody_type", "regular")
      .order("start_date", { ascending: true });

    if (scheduleEvents && scheduleEvents.length > 0) {
      existingStartDate = scheduleEvents[0].start_date;
      const originDate = new Date(existingStartDate + "T12:00:00");

      const patternMap = new Map<number, string>();
      const fmt = (d: Date) => {
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, "0");
        const day = String(d.getDate()).padStart(2, "0");
        return `${y}-${m}-${day}`;
      };

      for (let dayIdx = 0; dayIdx < 14; dayIdx++) {
        const targetDate = new Date(originDate);
        targetDate.setDate(targetDate.getDate() + dayIdx);
        const targetDateStr = fmt(targetDate);

        for (const evt of scheduleEvents) {
          if (targetDateStr >= evt.start_date && targetDateStr <= evt.end_date) {
            patternMap.set(dayIdx, evt.responsible_user_id);
            break;
          }
        }
      }

      existingPattern = Array.from({ length: 14 }, (_, i) => patternMap.get(i) || null);
    }
  }

  // Count total events for display
  const { count: eventCount } = await supabase
    .from("custody_events")
    .select("id", { count: "exact", head: true })
    .eq("group_id", groupId)
    .eq("custody_type", "regular")
    .eq("notes", "Gerado pela escala quinzenal");

  return (
    <div className="max-w-lg mx-auto pb-20">
      <EscalaHeader
        hasExistingSchedule={hasExistingSchedule}
        eventCount={eventCount || 0}
        groupId={groupId}
      />

      <ScheduleBuilder
        groupId={groupId}
        children={children || []}
        members={membersList}
        currentUserId={user.id}
        hasExistingSchedule={hasExistingSchedule}
        initialPattern={existingPattern}
        initialStartDate={existingStartDate}
      />
    </div>
  );
}
