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

  // Parallel fetch: children + logs (now also brings priority)
  const [{ data: children }, { data: logs }] = await Promise.all([
    supabase
      .from("children")
      .select("id, full_name")
      .eq("group_id", groupId),
    supabase
      .from("school_logs")
      .select("id, child_id, title, description, log_type, log_date, completed, logged_by, subject, score, priority, children(full_name), profiles!school_logs_logged_by_fkey(full_name), events!school_log_id(event_time)")
      .eq("group_id", groupId)
      .order("log_date", { ascending: false })
      .limit(50),
  ]);

  // Collaborative reads — fetch ALL coparents' reads for these logs so
  // the UI can show "Visto por Amanda · 14:32" alongside "Não lido". One
  // query: relies on collab_reads RLS to let coparents see each other's
  // receipts (see migration 00077_collab_foundation.sql).
  const logIds = (logs || []).map((l) => l.id);
  const reads = logIds.length > 0
    ? (await supabase
        .from("collab_reads")
        .select("record_id, user_id, read_at")
        .eq("record_type", "school_log")
        .in("record_id", logIds)).data || []
    : [];

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
      priority: (log.priority as "info" | "important" | "urgent") ?? "info",
      event_time: ((eventsRow as { event_time?: string | null } | null)?.event_time ?? null),
      children: (Array.isArray(log.children) ? log.children[0] : log.children) as { full_name?: string } | null,
      profiles: (Array.isArray(log.profiles) ? log.profiles[0] : log.profiles) as { full_name?: string } | null,
    };
  });

  const serializedReads = (reads as Array<{ record_id: string; user_id: string; read_at: string }>).map((r) => ({
    log_id: r.record_id,
    user_id: r.user_id,
    read_at: r.read_at,
  }));

  return (
    <EscolaClient
      groupId={groupId}
      isReadonly={isReadonly}
      currentUserId={user.id}
      childrenList={children || []}
      logs={serializedLogs}
      reads={serializedReads}
      today={today}
    />
  );
}
