import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getActiveGroup } from "@/lib/group-utils";
import InviteClient from "./InviteClient";

export default async function SendInvitePage({
  searchParams,
}: {
  searchParams: Promise<{ success?: string; token?: string; error?: string }>;
}) {
  const params = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const activeGroup = await getActiveGroup(supabase, user.id);

  if (!activeGroup || activeGroup.role !== "admin") {
    return (
      <InviteClient
        isAdminDenied={true}
        groupId=""
        groupName=""
        allInvites={[]}
        inviteToken={undefined}
        inviteSuccess={false}
        inviteDeleted={false}
        inviteLink={null}
        error={undefined}
      />
    );
  }

  const { groupId, groupName } = activeGroup;

  // Fetch all invitations (pending, accepted, expired, revoked)
  const { data: allInvites } = await supabase
    .from("invitations")
    .select("id, email, role, token, created_at, expires_at, status")
    .eq("group_id", groupId)
    .in("status", ["pending", "accepted"])
    .order("created_at", { ascending: false });

  const inviteToken = params.token;
  const inviteSuccess = params.success === "true";
  const inviteDeleted = params.success === "deleted";
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://kindar.com.br";
  const inviteLink = inviteToken ? `${appUrl}/convite/${inviteToken}` : null;

  return (
    <InviteClient
      isAdminDenied={false}
      groupId={groupId}
      groupName={groupName}
      allInvites={allInvites || []}
      inviteToken={inviteToken}
      inviteSuccess={inviteSuccess}
      inviteDeleted={inviteDeleted}
      inviteLink={inviteLink}
      error={params.error}
    />
  );
}
