import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getActiveGroup } from "@/lib/group-utils";
import { getBrazilToday } from "@/lib/calendar-utils";
import CheckinClient from "./CheckinClient";

export default async function CheckinPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const activeGroup = await getActiveGroup(supabase, user.id);
  if (!activeGroup) redirect("/onboarding");
  const { groupId, isReadonly } = activeGroup;

  const today = getBrazilToday();
  const todayParts = today.split("-").map(Number);
  const weekAgo = new Date(todayParts[0], todayParts[1] - 1, todayParts[2] - 7);
  const weekAgoStr = weekAgo.toLocaleDateString("sv-SE");

  // Run all three queries in parallel
  const [{ data: children }, { data: todayCheckins }, { data: recentCheckins }] = await Promise.all([
    supabase
      .from("children")
      .select("id, full_name")
      .eq("group_id", groupId),
    supabase
      .from("daily_checkins")
      .select("*, profiles!daily_checkins_logged_by_fkey(full_name), children(full_name)")
      .eq("group_id", groupId)
      .eq("checkin_date", today)
      .order("created_at", { ascending: false }),
    supabase
      .from("daily_checkins")
      .select("*, profiles!daily_checkins_logged_by_fkey(full_name), children(full_name)")
      .eq("group_id", groupId)
      .gte("checkin_date", weekAgoStr)
      .lt("checkin_date", today)
      .order("created_at", { ascending: false })
      .limit(20),
  ]);

  return (
    <CheckinClient
      groupId={groupId}
      isReadonly={isReadonly}
      childrenList={children || []}
      todayCheckins={todayCheckins || []}
      recentCheckins={recentCheckins || []}
      today={today}
    />
  );
}
