import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getActiveGroup } from "@/lib/group-utils";
import { getBrazilToday } from "@/lib/calendar-utils";
import { getDisplayName } from "@/lib/constants";
import {
  resolveRoutineOnDate,
  type RoutineSlot,
  type RoutineOverride,
} from "@/lib/care-routine-resolve";
import { resolveCustodyOnDate, type CustodyEvent } from "@/lib/custody-resolve";
import { buildChildJourney, type JourneyActivity, type JourneyItem } from "@/lib/care-routine-journey";
import JourneyTimeline from "./JourneyTimeline";

export default async function JornadaPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const activeGroup = await getActiveGroup(supabase, user.id);
  if (!activeGroup) redirect("/onboarding");
  const { groupId } = activeGroup;
  const today = getBrazilToday();
  const weekday = new Date(today + "T12:00:00").getDay();

  const [{ data: children }, { data: members }, { data: slotsRaw }, { data: overridesRaw }, { data: occ }, { data: custodyRaw }] =
    await Promise.all([
      supabase.from("children").select("id, full_name").eq("group_id", groupId).order("birth_date", { ascending: true }),
      supabase.from("group_members").select("user_id, profiles(display_name, full_name)").eq("group_id", groupId),
      supabase
        .from("care_routine_slots")
        .select("id, child_id, weekday, leg, pattern_type, responsible_id, time_of_day, label, week_parity")
        .eq("group_id", groupId)
        .eq("weekday", weekday)
        .eq("is_active", true),
      supabase
        .from("care_routine_overrides")
        .select("id, child_id, occurrence_date, leg, responsible_id")
        .eq("group_id", groupId)
        .eq("occurrence_date", today),
      supabase
        .from("calendar_occurrences")
        .select("child_id, child_activities!inner(name, category, time_start)")
        .eq("group_id", groupId)
        .eq("occurrence_date", today),
      supabase
        .from("custody_events")
        .select("id, child_id, start_date, end_date, responsible_user_id, custody_type, created_at")
        .eq("group_id", groupId)
        .lte("start_date", today)
        .gte("end_date", today),
    ]);

  const nameById = new Map<string, string>();
  for (const m of members ?? []) {
    const prof = (m as { profiles?: { display_name?: string | null; full_name?: string | null } | { display_name?: string | null; full_name?: string | null }[] }).profiles;
    const p = Array.isArray(prof) ? prof[0] : prof;
    nameById.set(m.user_id as string, getDisplayName(p?.display_name || p?.full_name || null, true));
  }
  const nameOf = (id: string | null | undefined) => (id ? nameById.get(id) ?? "" : "");

  const slots = (slotsRaw ?? []) as unknown as RoutineSlot[];
  const overrides = (overridesRaw ?? []) as unknown as RoutineOverride[];
  const custodyEvents = (custodyRaw ?? []) as unknown as CustodyEvent[];

  // Atividades de hoje por criança (com horário).
  const activitiesByChild = new Map<string, JourneyActivity[]>();
  for (const o of occ ?? []) {
    const act = Array.isArray(o.child_activities) ? o.child_activities[0] : o.child_activities;
    if (!act) continue;
    const childId = (o.child_id as string | null) ?? "__all__";
    const arr = activitiesByChild.get(childId) ?? [];
    arr.push({ name: act.name as string, time: (act.time_start as string | null) ?? null, category: (act.category as string) ?? "other" });
    activitiesByChild.set(childId, arr);
  }

  const custodyResolver = (cid: string, dk: string) =>
    resolveCustodyOnDate(custodyEvents, cid, dk)?.responsible_user_id ?? null;
  const journeys: { childId: string; childName: string; items: JourneyItem[] }[] = [];
  for (const c of children ?? []) {
    const childId = c.id as string;
    const resolved = resolveRoutineOnDate(slots, overrides, childId, today, custodyResolver);
    const custodyName = nameOf(resolveCustodyOnDate(custodyEvents, childId, today)?.responsible_user_id);
    const acts = [...(activitiesByChild.get(childId) ?? []), ...(activitiesByChild.get("__all__") ?? [])];
    const items = buildChildJourney({
      dropoff: resolved.dropoff ? { name: nameOf(resolved.dropoff.responsibleId), time: resolved.dropoff.time } : null,
      pickup: resolved.pickup ? { name: nameOf(resolved.pickup.responsibleId), time: resolved.pickup.time } : null,
      activities: acts,
      homeMorning: custodyName || null,
      homeEvening: custodyName || null,
    });
    journeys.push({ childId, childName: getDisplayName((c.full_name as string) || null, true), items });
  }

  return (
    <div className="max-w-lg mx-auto pb-24 px-4 pt-4 space-y-5">
      {journeys.map((j) => (
        <JourneyTimeline key={j.childId} childName={j.childName} items={j.items} />
      ))}
    </div>
  );
}
