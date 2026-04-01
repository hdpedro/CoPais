import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getActiveGroup } from "@/lib/group-utils";
import { DECISION_CATEGORIES, getDisplayName } from "@/lib/constants";
import DecisoesClient from "./DecisoesClient";

export default async function DecisoesPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; open?: string }>;
}) {
  const params = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const activeGroup = await getActiveGroup(supabase, user.id);
  if (!activeGroup) redirect("/onboarding");
  const { groupId, isReadonly } = activeGroup;

  const tab = params.tab || "abertas";
  const openDecisionId = params.open || null;

  // Fetch group members (separate query, no FK join)
  const { data: membersRaw, error: membersError } = await supabase
    .from("group_members")
    .select("user_id")
    .eq("group_id", groupId);

  if (membersError) console.error("Members query error:", membersError);

  // Fetch profiles for members separately
  const memberUserIds = (membersRaw || []).map(m => m.user_id);
  const { data: memberProfiles } = memberUserIds.length > 0
    ? await supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", memberUserIds)
    : { data: [] };

  const profileMap = new Map((memberProfiles || []).map(p => [p.id, getDisplayName(p.full_name)]));

  const membersList = memberUserIds.map(uid => ({
    user_id: uid,
    full_name: profileMap.get(uid) || "Usuario",
  }));

  // Fetch decisions WITHOUT FK join (more resilient)
  let decisionsQuery = supabase
    .from("decisions")
    .select("id, title, description, status, deadline, created_at, created_by, category")
    .eq("group_id", groupId)
    .order("created_at", { ascending: false })
    .limit(100);

  if (tab === "abertas") {
    decisionsQuery = decisionsQuery.eq("status", "aberta");
  } else if (tab === "resolvidas") {
    decisionsQuery = decisionsQuery.in("status", ["aprovada", "rejeitada", "expirada"]);
  }

  const { data: decisions, error: decisionsError } = await decisionsQuery;
  if (decisionsError) console.error("Decisions query error:", decisionsError);

  // Fetch all votes for these decisions
  const decisionIds = (decisions || []).map((d) => d.id);
  const { data: allVotes } = decisionIds.length > 0
    ? await supabase
        .from("decision_votes")
        .select("decision_id, user_id, vote")
        .in("decision_id", decisionIds)
    : { data: [] };

  // Fetch arguments for open decision (without FK join)
  let openDecisionArgs: Array<{ id: string; user_id: string; argument_type: string; text: string; user_name: string }> = [];
  if (openDecisionId) {
    const { data: args, error: argsError } = await supabase
      .from("decision_arguments")
      .select("id, user_id, argument_type, text")
      .eq("decision_id", openDecisionId)
      .order("created_at", { ascending: true });
    if (argsError) console.error("Arguments query error:", argsError);
    openDecisionArgs = (args || []).map(arg => ({
      ...arg,
      user_name: profileMap.get(arg.user_id) || "Usuario",
    }));
  }

  // Convert votes to a serializable map
  const votesMap: Record<string, Array<{ decision_id: string; user_id: string; vote: string }>> = {};
  (allVotes || []).forEach((v) => {
    if (!votesMap[v.decision_id]) votesMap[v.decision_id] = [];
    votesMap[v.decision_id].push(v);
  });

  // Convert profileMap to plain object for serialization
  const profileMapObj: Record<string, string> = {};
  profileMap.forEach((v, k) => { profileMapObj[k] = v; });

  return (
    <DecisoesClient
      decisions={decisions || []}
      membersList={membersList}
      userId={user.id}
      groupId={groupId}
      isReadonly={isReadonly}
      tab={tab}
      openDecisionId={openDecisionId}
      votesMap={votesMap}
      openDecisionArgs={openDecisionArgs}
      profileMap={profileMapObj}
      decisionCategories={DECISION_CATEGORIES as unknown as Array<{ value: string; label: string; icon: string }>}
    />
  );
}
