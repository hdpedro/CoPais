import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getActiveGroup } from "@/lib/group-utils";
import { getUserSubscription, type PlanTier } from "@/lib/subscription";
import dynamic from "next/dynamic";

const PrescriptionParserClient = dynamic(() => import("./PrescriptionParserClient"), {
  loading: () => <div className="animate-pulse bg-gray-100 rounded-xl h-96" />,
});

interface PageProps {
  searchParams: Promise<{ crianca?: string }>;
}

export default async function ReceitaPage({ searchParams }: PageProps) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const activeGroup = await getActiveGroup(supabase, user.id);
  if (!activeGroup) redirect("/onboarding");
  if (activeGroup.isReadonly) redirect("/dashboard");
  const { groupId } = activeGroup;

  const params = await searchParams;

  const [{ data: children }, subscription] = await Promise.all([
    supabase.from("children").select("id, full_name, birth_date").eq("group_id", groupId).order("birth_date"),
    getUserSubscription(supabase, user.id),
  ]);

  const childId = params.crianca || (children && children.length > 0 ? children[0].id : null);
  if (!childId || !children || children.length === 0) {
    redirect("/saude");
  }

  const selectedChild = children.find((c) => c.id === childId) || children[0];

  // Fetch active episodes for linking
  const { data: activeEpisodes } = await supabase
    .from("illness_episodes")
    .select("id, title")
    .eq("child_id", childId)
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(10);

  return (
    <div className="max-w-lg mx-auto pb-20">
      <PrescriptionParserClient
        groupId={groupId}
        childId={childId}
        childName={selectedChild.full_name?.split(" ")[0] || "Crianca"}
        childBirthDate={selectedChild.birth_date || ""}
        tier={subscription.tier as PlanTier}
        activeEpisodes={(activeEpisodes || []).map((e) => ({ id: e.id, title: e.title }))}
      />
    </div>
  );
}
