import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createIllnessEpisode } from "@/actions/health";
import { getBrazilToday } from "@/lib/calendar-utils";
import { getActiveGroup } from "@/lib/group-utils";
import DoencaNovaClient from "./DoencaNovaClient";

export default async function NovaDoencaPage({
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

  const today = getBrazilToday();

  return (
    <DoencaNovaClient
      groupId={groupId}
      children={children || []}
      today={today}
      error={params.error}
      createAction={createIllnessEpisode}
    />
  );
}
