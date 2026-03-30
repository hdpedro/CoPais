import { createClient } from "@/lib/supabase/server";

export async function buildGroupContext(
  userId: string,
  groupId: string
): Promise<string> {
  const supabase = await createClient();

  // Fetch children and members in parallel
  const [childrenRes, membersRes] = await Promise.all([
    supabase
      .from("children")
      .select("id, full_name, date_of_birth")
      .eq("group_id", groupId),
    supabase
      .from("group_members")
      .select("user_id, role")
      .eq("group_id", groupId),
  ]);

  // Build member profiles from group_members
  const memberIds = (membersRes.data || []).map((m) => m.user_id);
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, full_name")
    .in("id", memberIds);

  const children = (childrenRes.data || []).map((c) => {
    const age = Math.floor(
      (Date.now() - new Date(c.date_of_birth).getTime()) /
        (365.25 * 24 * 60 * 60 * 1000)
    );
    return `${c.full_name} (${age} anos)`;
  });

  const members = (profiles || []).map(
    (p) => `${p.full_name}${p.id === userId ? " (você)" : ""}`
  );

  const today = new Date().toLocaleDateString("pt-BR", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return `Data atual: ${today}\nCrianças: ${children.join(", ")}\nMembros do grupo: ${members.join(", ")}`;
}
