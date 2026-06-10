import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getActiveGroup } from "@/lib/group-utils";
import FamiliaClient from "./FamiliaClient";

async function cancelInviteAction(formData: FormData) {
  "use server";
  const inviteId = formData.get("inviteId") as string;
  const { createClient } = await import("@/lib/supabase/server");
  const supabase = await createClient();
  await supabase.from("invitations").update({ status: "revoked" }).eq("id", inviteId);
  const { revalidatePath } = await import("next/cache");
  revalidatePath("/familia");
  const { redirect } = await import("next/navigation");
  redirect("/familia?success=" + encodeURIComponent("Convite cancelado"));
}

export default async function FamiliaPage({
  searchParams,
}: {
  searchParams: Promise<{ success?: string; error?: string }>;
}) {
  const params = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Get user's active group
  const activeGroup = await getActiveGroup(supabase, user.id);
  if (!activeGroup) redirect("/onboarding");

  const { groupId, groupName } = activeGroup;
  const isAdmin = activeGroup.role === "admin";

  // Fetch created_by separately (needed to show "criador" badge)
  const { data: group } = await supabase
    .from("coparenting_groups")
    .select("id, name, created_by, arrangement")
    .eq("id", groupId)
    .single();
  const arrangement = ((group?.arrangement as string) ?? "rotating") as
    | "rotating"
    | "together"
    | "single"
    | "custom";

  // Get all members with profiles
  const { data: members } = await supabase
    .from("group_members")
    .select("*, profiles(id, full_name, email)")
    .eq("group_id", groupId)
    .order("joined_at");

  // Get children
  const { data: children } = await supabase
    .from("children")
    .select("id, full_name, birth_date")
    .eq("group_id", groupId);

  // Get pending invitations
  const { data: pendingInvites } = await supabase
    .from("invitations")
    .select("*")
    .eq("group_id", groupId)
    .eq("status", "pending")
    .order("created_at", { ascending: false });

  // Get accepted invitations (history)
  const { data: acceptedInvites } = await supabase
    .from("invitations")
    .select("*, profiles!invitations_accepted_by_fkey(full_name)")
    .eq("group_id", groupId)
    .in("status", ["accepted", "revoked"])
    .order("created_at", { ascending: false })
    .limit(10);

  // Check if current user is the only admin (needed for leave group logic)
  const adminCount = members?.filter((m) => m.role === "admin").length || 0;
  const isOnlyAdmin = isAdmin && adminCount <= 1;

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://kindar.com.br";

  const serializedMembers = (members || []).map((member) => {
    const profile = (Array.isArray(member.profiles) ? member.profiles[0] : member.profiles) as { id?: string; full_name?: string; email?: string } | null;
    return {
      id: member.id,
      user_id: member.user_id,
      role: member.role,
      joined_at: member.joined_at,
      full_name: profile?.full_name || null,
      email: profile?.email || null,
    };
  });

  const serializedPending = (pendingInvites || []).map((invite) => ({
    id: invite.id,
    email: invite.email,
    role: invite.role,
    status: invite.status,
    token: invite.token,
    expires_at: invite.expires_at,
    accepted_at: invite.accepted_at,
    created_at: invite.created_at,
    accepted_name: null,
  }));

  const serializedAccepted = (acceptedInvites || []).map((invite) => {
    const inviteProfile = (Array.isArray(invite.profiles) ? invite.profiles[0] : invite.profiles) as { full_name?: string } | null;
    return {
      id: invite.id,
      email: invite.email,
      role: invite.role,
      status: invite.status,
      token: invite.token || "",
      expires_at: invite.expires_at,
      accepted_at: invite.accepted_at,
      created_at: invite.created_at,
      accepted_name: inviteProfile?.full_name?.split(" ")[0] || null,
    };
  });

  return (
    <FamiliaClient
      groupId={groupId}
      groupName={groupName}
      arrangement={arrangement}
      createdBy={group?.created_by || null}
      isAdmin={isAdmin}
      canEditArrangement={activeGroup.role !== "readonly"}
      isOnlyAdmin={isOnlyAdmin}
      currentUserId={user.id}
      members={serializedMembers}
      children={children || []}
      pendingInvites={serializedPending}
      acceptedInvites={serializedAccepted}
      appUrl={appUrl}
      successMessage={params.success ? decodeURIComponent(params.success) : undefined}
      errorMessage={params.error ? decodeURIComponent(params.error) : undefined}
      cancelInviteAction={cancelInviteAction}
    />
  );
}
