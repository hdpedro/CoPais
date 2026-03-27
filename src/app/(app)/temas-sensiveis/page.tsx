import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getActiveGroup } from "@/lib/group-utils";
import SensitiveTopicsClient from "./SensitiveTopicsClient";

export default async function TemasRelevantesPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const activeGroup = await getActiveGroup(supabase, user.id);
  if (!activeGroup) redirect("/onboarding");
  const { groupId, isReadonly } = activeGroup;

  const { data: children } = await supabase
    .from("children")
    .select("id, full_name")
    .eq("group_id", groupId);

  const { data: notes } = await supabase
    .from("sensitive_notes")
    .select("*, children(full_name), profiles!sensitive_notes_created_by_fkey(full_name)")
    .eq("group_id", groupId)
    .order("is_urgent", { ascending: false })
    .order("created_at", { ascending: false });

  // Count non-readonly parents in the group
  const { data: members } = await supabase
    .from("group_members")
    .select("id")
    .eq("group_id", groupId)
    .neq("role", "readonly");

  const memberCount = members?.length ?? 0;

  return (
    <SensitiveTopicsClient
      groupId={groupId}
      isReadonly={isReadonly}
      childrenList={children || []}
      notes={notes || []}
      memberCount={memberCount}
      currentUserId={user.id}
    />
  );
}
