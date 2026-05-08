import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getActiveGroup } from "@/lib/group-utils";
import { getBrazilToday } from "@/lib/calendar-utils";
import EscolaClient from "./EscolaClient";

export default async function EscolaPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const activeGroup = await getActiveGroup(supabase, user.id);
  if (!activeGroup) redirect("/onboarding");
  const { groupId, isReadonly } = activeGroup;

  // Parallel fetch: children + logs
  const [{ data: children }, { data: logs }] = await Promise.all([
    supabase
      .from("children")
      .select("id, full_name")
      .eq("group_id", groupId),
    supabase
      .from("school_logs")
      .select("id, child_id, title, description, log_type, log_date, completed, logged_by, subject, score, children(full_name), profiles!school_logs_logged_by_fkey(full_name), events!school_log_id(event_time)")
      .eq("group_id", groupId)
      .order("log_date", { ascending: false })
      .limit(50),
  ]);

  const today = getBrazilToday();

  const serializedLogs = (logs || []).map((log) => {
    const eventsRow = Array.isArray(log.events) ? log.events[0] : log.events;
    return {
      id: log.id,
      child_id: log.child_id,
      title: log.title,
      description: log.description,
      log_type: log.log_type,
      log_date: log.log_date,
      completed: log.completed ?? false,
      logged_by: log.logged_by,
      subject: log.subject ?? null,
      score: log.score ?? null,
      event_time: ((eventsRow as { event_time?: string | null } | null)?.event_time ?? null),
      children: (Array.isArray(log.children) ? log.children[0] : log.children) as { full_name?: string } | null,
      profiles: (Array.isArray(log.profiles) ? log.profiles[0] : log.profiles) as { full_name?: string } | null,
    };
  });

  return (
    <EscolaClient
      groupId={groupId}
      isReadonly={isReadonly}
      childrenList={children || []}
      logs={serializedLogs}
      today={today}
    />
  );
}
