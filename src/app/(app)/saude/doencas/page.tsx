import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { updateIllnessEpisode, addIllnessEvolution } from "@/actions/health";
import { getBrazilToday } from "@/lib/calendar-utils";
import { getActiveGroup } from "@/lib/group-utils";
import DoencasClient from "./DoencasClient";

export default async function DoencasPage({
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
  const { groupId, isReadonly } = activeGroup;

  const { data: episodes } = await supabase
    .from("illness_episodes")
    .select("id, title, status, severity, symptoms, start_date, end_date, diagnosis, notes, hospital_visit, hospital_name, child_id, created_by, children(full_name), profiles:created_by(full_name)")
    .eq("group_id", groupId)
    .order("start_date", { ascending: false })
    .limit(100);

  const activeEpisodes = (episodes || []).filter((e) => e.status === "active");
  const recoveredEpisodes = (episodes || []).filter((e) => e.status === "resolved");
  const today = getBrazilToday();

  return (
    <DoencasClient
      episodes={episodes || []}
      activeEpisodes={activeEpisodes}
      recoveredEpisodes={recoveredEpisodes}
      isReadonly={isReadonly}
      today={today}
      success={params.success}
      error={params.error}
      updateAction={updateIllnessEpisode}
      addEvolutionAction={addIllnessEvolution}
    />
  );
}
