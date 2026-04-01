import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getActiveGroup } from "@/lib/group-utils";
import ChildrenClient from "./ChildrenClient";

export default async function ChildrenPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const activeGroup = await getActiveGroup(supabase, user.id);
  if (!activeGroup) redirect("/onboarding");
  const { groupId, isReadonly } = activeGroup;

  const { data: children } = await supabase
    .from("children")
    .select("id, full_name, birth_date, gender, photo_url, blood_type, notes")
    .eq("group_id", groupId)
    .order("full_name");

  return (
    <ChildrenClient
      childrenList={children || []}
      isReadonly={isReadonly}
    />
  );
}
