import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAllergy } from "@/actions/health";
import { getActiveGroup } from "@/lib/group-utils";
import AllergyFormClient from "./AllergyFormClient";

export default async function NovaAlergiaPage({
  searchParams,
}: {
  searchParams: Promise<{ success?: string; error?: string }>;
}) {
  const params = await searchParams;
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
    .eq("group_id", groupId)
    .order("birth_date");

  return (
    <AllergyFormClient
      groupId={groupId}
      children={children || []}
      error={params.error}
      createAction={createAllergy}
    />
  );
}
