"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { captureServerEvent } from "@/lib/posthog-server";

export async function createInvitation(formData: FormData) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const groupId = formData.get("groupId") as string;
  const email = formData.get("email") as string;
  const role = (formData.get("role") as string) || "parent";
  const returnTo = (formData.get("returnTo") as string) || "/convite/enviar";

  // Check if user is admin of the group
  const { data: membership } = await supabase
    .from("group_members")
    .select("role")
    .eq("group_id", groupId)
    .eq("user_id", user.id)
    .single();

  if (!membership || membership.role !== "admin") {
    redirect(returnTo + "?error=" + encodeURIComponent("Apenas administradores podem convidar membros"));
  }

  const { data: invitation, error } = await supabase
    .from("invitations")
    .insert({
      group_id: groupId,
      invited_by: user.id,
      email,
      role,
      group_role: role === "mediator" || role === "lawyer" ? "readonly" : "member",
    })
    .select()
    .single();

  if (error) {
    redirect(returnTo + "?error=" + encodeURIComponent(error.message));
  }

  captureServerEvent(user.id, "invitation_sent", {
    group_id: groupId,
    role,
  });

  redirect(returnTo + "?success=true&token=" + invitation.token);
}

export async function acceptInvitation(token: string) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Find the invitation
  const { data: invitation, error: invError } = await supabase
    .from("invitations")
    .select("*")
    .eq("token", token)
    .eq("status", "pending")
    .single();

  if (invError || !invitation) {
    redirect("/login?error=" + encodeURIComponent("Convite invalido ou expirado"));
  }

  // Check if expired
  if (new Date(invitation.expires_at) < new Date()) {
    redirect("/login?error=" + encodeURIComponent("Este convite expirou"));
  }

  // Add user to group
  const { error: memberError } = await supabase.from("group_members").insert({
    group_id: invitation.group_id,
    user_id: user.id,
    role: invitation.group_role,
  });

  if (memberError) {
    if (memberError.code === "23505") {
      redirect("/dashboard");
    }
    redirect("/dashboard?error=" + encodeURIComponent(memberError.message));
  }

  // Update invitation status
  await supabase
    .from("invitations")
    .update({
      status: "accepted",
      accepted_by: user.id,
      accepted_at: new Date().toISOString(),
    })
    .eq("id", invitation.id);

  // Update user profile role only if not already set (avoid overwriting existing role)
  const { data: currentProfile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (!currentProfile?.role || currentProfile.role === "parent") {
    await supabase
      .from("profiles")
      .update({ role: invitation.role })
      .eq("id", user.id);
  }

  captureServerEvent(user.id, "invitation_accepted", {
    group_id: invitation.group_id,
    role: invitation.role,
  });

  redirect("/dashboard");
}

/**
 * Auto-accept any pending invitations that match the user's email.
 * This handles the case where a user signs up via invite link but the
 * invite token is lost during Supabase's email confirmation redirect chain.
 * Returns true if an invitation was accepted (caller should redirect to /dashboard).
 */
export async function autoAcceptPendingInvitations(): Promise<boolean> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !user.email) return false;

  // Use service role to bypass RLS and find invitations by email
  const serviceSupabase = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Find pending invitations for this user's email
  const { data: invitations } = await serviceSupabase
    .from("invitations")
    .select("*")
    .eq("email", user.email)
    .eq("status", "pending")
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: true })
    .limit(1);

  if (!invitations || invitations.length === 0) return false;

  const invitation = invitations[0];

  // Check if user is already in this group
  const { data: existingMembership } = await serviceSupabase
    .from("group_members")
    .select("id")
    .eq("group_id", invitation.group_id)
    .eq("user_id", user.id)
    .single();

  if (existingMembership) {
    // Already a member, just mark invitation as accepted
    await serviceSupabase
      .from("invitations")
      .update({
        status: "accepted",
        accepted_by: user.id,
        accepted_at: new Date().toISOString(),
      })
      .eq("id", invitation.id);
    return true;
  }

  // Add user to group
  const { error: memberError } = await serviceSupabase
    .from("group_members")
    .insert({
      group_id: invitation.group_id,
      user_id: user.id,
      role: invitation.group_role || "member",
    });

  if (memberError) {
    console.error("Auto-accept invitation error:", memberError.message);
    return false;
  }

  // Update invitation status
  await serviceSupabase
    .from("invitations")
    .update({
      status: "accepted",
      accepted_by: user.id,
      accepted_at: new Date().toISOString(),
    })
    .eq("id", invitation.id);

  // Update user profile role
  const { data: currentProfile } = await serviceSupabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (!currentProfile?.role || currentProfile.role === "parent") {
    await serviceSupabase
      .from("profiles")
      .update({ role: invitation.role })
      .eq("id", user.id);
  }

  captureServerEvent(user.id, "invitation_auto_accepted", {
    group_id: invitation.group_id,
    role: invitation.role,
  });

  return true;
}
