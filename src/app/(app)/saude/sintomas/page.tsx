import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getActiveGroup } from "@/lib/group-utils";
import SintomasClient from "./SintomasClient";

export default async function SintomasPage({
  searchParams,
}: {
  searchParams: Promise<{ crianca?: string }>;
}) {
  const params = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const activeGroup = await getActiveGroup(supabase, user.id);
  if (!activeGroup) redirect("/onboarding");
  const { groupId, isReadonly } = activeGroup;

  const { data: children } = await supabase
    .from("children")
    .select("id, full_name, birth_date")
    .eq("group_id", groupId)
    .order("birth_date");

  if (!children || children.length === 0) redirect("/saude");

  const selectedChildId =
    params.crianca && children.find((c) => c.id === params.crianca)
      ? params.crianca
      : children[0].id;

  // Fetch symptoms + active episodes in parallel
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const [{ data: entries }, { data: activeEpisodes }] = await Promise.all([
    supabase
      .from("symptom_entries")
      .select("id, symptom_type, temperature, intensity, notes, recorded_at, illness_episode_id, created_by, profiles(full_name)")
      .eq("child_id", selectedChildId)
      .gte("recorded_at", sevenDaysAgo.toISOString())
      .order("recorded_at", { ascending: false })
      .limit(100),
    supabase
      .from("illness_episodes")
      .select("id, title")
      .eq("child_id", selectedChildId)
      .eq("status", "active"),
  ]);

  return (
    <SintomasClient
      childrenList={children}
      selectedChildId={selectedChildId}
      selectedChildName={
        children.find((c) => c.id === selectedChildId)!.full_name
      }
      selectedChildBirthDate={
        children.find((c) => c.id === selectedChildId)!.birth_date
      }
      entries={(entries || []).map((e) => ({
        ...e,
        authorName:
          (e.profiles as unknown as { full_name: string } | null)
            ?.full_name || null,
      }))}
      activeEpisodes={activeEpisodes || []}
      groupId={groupId}
      isReadonly={isReadonly}
    />
  );
}
