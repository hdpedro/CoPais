import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";

export type ActiveGroupResult = {
  groupId: string;
  role: string;
  groupName: string;
  isReadonly: boolean;
  custodyEnabled: boolean;
  memberships: Array<{
    group_id: string;
    role: string;
    coparenting_groups: { id: string; name: string; custody_enabled: boolean };
  }>;
  hasMultipleGroups: boolean;
};

export async function getActiveGroup(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string
): Promise<ActiveGroupResult | null> {
  const { data: memberships } = await supabase
    .from("group_members")
    .select("group_id, role, coparenting_groups(id, name, custody_enabled)")
    .eq("user_id", userId);

  if (!memberships || memberships.length === 0) return null;

  const hasMultipleGroups = memberships.length > 1;
  let activeMembership = memberships[0];

  if (hasMultipleGroups) {
    const cookieStore = await cookies();
    const activeGroupId = cookieStore.get("activeGroupId")?.value;
    if (activeGroupId) {
      const found = memberships.find((m) => m.group_id === activeGroupId);
      if (found) activeMembership = found;
    }
  }

  const group = activeMembership.coparenting_groups as { id: string; name: string; custody_enabled: boolean } | null;

  return {
    groupId: activeMembership.group_id,
    role: activeMembership.role,
    groupName: group?.name || "Grupo",
    isReadonly: activeMembership.role === "readonly",
    custodyEnabled: group?.custody_enabled ?? true,
    memberships: memberships as ActiveGroupResult["memberships"],
    hasMultipleGroups,
  };
}
