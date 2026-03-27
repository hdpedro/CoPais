import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getDisplayName } from "@/lib/constants";
import ProfileContent from "./ProfileContent";

export default async function ProfilePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  const { data: memberships } = await supabase
    .from("group_members")
    .select("group_id, role, coparenting_groups(name)")
    .eq("user_id", user.id);

  const displayName = getDisplayName(profile?.full_name) || "?";
  const createdAt = profile?.created_at
    ? new Date(profile.created_at).toLocaleDateString("pt-BR")
    : "—";

  const mappedMemberships = (memberships || []).map((m) => ({
    group_id: m.group_id,
    role: m.role,
    groupName: (m.coparenting_groups as any)?.name || "—",
  }));

  return (
    <ProfileContent
      displayName={displayName}
      email={user.email || ""}
      phone={profile?.phone}
      roleName={profile?.role || "parent"}
      createdAt={createdAt}
      currentName={profile?.full_name || ""}
      memberships={mappedMemberships}
    />
  );
}
