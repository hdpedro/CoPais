import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getActiveGroup } from "@/lib/group-utils";
import AcordosClient from "./AcordosClient";

export default async function AcordosPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const activeGroup = await getActiveGroup(supabase, user.id);
  if (!activeGroup) redirect("/onboarding");
  const { groupId, isReadonly } = activeGroup;

  const { data: agreements } = await supabase
    .from("agreements")
    .select("*, profiles!agreements_created_by_fkey(full_name)")
    .eq("group_id", groupId)
    .order("is_non_negotiable", { ascending: false })
    .order("created_at", { ascending: false });

  return (
    <AcordosClient
      agreements={agreements || []}
      groupId={groupId}
      userId={user.id}
      isReadonly={isReadonly}
    />
  );
}
