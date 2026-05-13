import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getActiveGroup } from "@/lib/group-utils";
import ConviteClient from "./ConviteClient";

export default async function OnboardingConvitePage({
  searchParams,
}: {
  searchParams: Promise<{ success?: string; token?: string; error?: string }>;
}) {
  const params = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Get user's group (just created in step 1)
  const activeGroup = await getActiveGroup(supabase, user.id);
  if (!activeGroup || activeGroup.role !== "admin") {
    redirect("/onboarding");
  }

  const groupId = activeGroup.groupId;
  const groupName = activeGroup.groupName;

  // Check if invite was already created
  const inviteToken = params.token || null;
  const inviteSuccess = params.success === "true";
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://kindar.com.br";
  const inviteLink = inviteToken ? `${appUrl}/convite/${inviteToken}` : null;

  return (
    <ConviteClient
      groupId={groupId}
      groupName={groupName}
      inviteSuccess={inviteSuccess}
      inviteLink={inviteLink}
      errorParam={params.error || null}
    />
  );
}
