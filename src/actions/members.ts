"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

export async function changeMemberRole(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const memberId = formData.get("memberId") as string;
  const groupId = formData.get("groupId") as string;
  const newRole = formData.get("newRole") as string;

  // Verify requester is admin
  const { data: requesterMembership } = await supabase
    .from("group_members")
    .select("role")
    .eq("group_id", groupId)
    .eq("user_id", user.id)
    .single();

  if (!requesterMembership || requesterMembership.role !== "admin") {
    redirect("/familia?error=" + encodeURIComponent("Apenas administradores podem alterar permissoes"));
  }

  // Cannot change own role
  if (memberId === user.id) {
    redirect("/familia?error=" + encodeURIComponent("Voce nao pode alterar seu proprio papel"));
  }

  // Validate role
  const validRoles = ["admin", "member", "readonly"];
  if (!validRoles.includes(newRole)) {
    redirect("/familia?error=" + encodeURIComponent("Papel invalido"));
  }

  const { error } = await supabase
    .from("group_members")
    .update({ role: newRole })
    .eq("group_id", groupId)
    .eq("user_id", memberId);

  if (error) {
    redirect("/familia?error=" + encodeURIComponent(error.message));
  }

  revalidatePath("/familia");
  redirect("/familia?success=" + encodeURIComponent("Papel atualizado com sucesso"));
}

export async function removeMember(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const memberId = formData.get("memberId") as string;
  const groupId = formData.get("groupId") as string;

  // Verify requester is admin
  const { data: requesterMembership } = await supabase
    .from("group_members")
    .select("role")
    .eq("group_id", groupId)
    .eq("user_id", user.id)
    .single();

  if (!requesterMembership || requesterMembership.role !== "admin") {
    redirect("/familia?error=" + encodeURIComponent("Apenas administradores podem remover membros"));
  }

  // Cannot remove self
  if (memberId === user.id) {
    redirect("/familia?error=" + encodeURIComponent("Voce nao pode se remover do grupo"));
  }

  // Use service role to bypass RLS (no DELETE policy on group_members table)
  const adminClient = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { error } = await adminClient
    .from("group_members")
    .delete()
    .eq("group_id", groupId)
    .eq("user_id", memberId);

  if (error) {
    redirect("/familia?error=" + encodeURIComponent(error.message));
  }

  revalidatePath("/familia");
  redirect("/familia?success=" + encodeURIComponent("Membro removido com sucesso"));
}

export async function leaveGroup(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const groupId = formData.get("groupId") as string;

  // Get current user's membership
  const { data: myMembership } = await supabase
    .from("group_members")
    .select("role")
    .eq("group_id", groupId)
    .eq("user_id", user.id)
    .single();

  if (!myMembership) {
    redirect("/familia?error=" + encodeURIComponent("Voce nao pertence a este grupo"));
  }

  // If user is admin, check if there's another admin in the group
  if (myMembership.role === "admin") {
    const { data: otherAdmins } = await supabase
      .from("group_members")
      .select("user_id")
      .eq("group_id", groupId)
      .eq("role", "admin")
      .neq("user_id", user.id);

    if (!otherAdmins || otherAdmins.length === 0) {
      redirect("/familia?error=" + encodeURIComponent("Voce e o unico administrador. Promova outro membro antes de sair."));
    }
  }

  // Use service role to bypass RLS for DELETE
  const adminClient = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { error } = await adminClient
    .from("group_members")
    .delete()
    .eq("group_id", groupId)
    .eq("user_id", user.id);

  if (error) {
    redirect("/familia?error=" + encodeURIComponent(error.message));
  }

  // Check if user has other groups
  const { data: otherGroups } = await supabase
    .from("group_members")
    .select("group_id")
    .eq("user_id", user.id);

  if (otherGroups && otherGroups.length > 0) {
    redirect("/dashboard");
  }

  redirect("/onboarding");
}

export async function cancelInvitation(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const invitationId = formData.get("invitationId") as string;

  // Fetch the invitation to verify admin access
  const { data: invitation } = await supabase
    .from("invitations")
    .select("id, group_id")
    .eq("id", invitationId)
    .single();

  if (!invitation) {
    redirect("/familia?error=" + encodeURIComponent("Convite nao encontrado"));
  }

  // Verify requester is admin of the group
  const { data: membership } = await supabase
    .from("group_members")
    .select("role")
    .eq("group_id", invitation.group_id)
    .eq("user_id", user.id)
    .single();

  if (!membership || membership.role !== "admin") {
    redirect("/familia?error=" + encodeURIComponent("Apenas administradores podem cancelar convites"));
  }

  const { error } = await supabase
    .from("invitations")
    .update({ status: "revoked" })
    .eq("id", invitationId);

  if (error) {
    redirect("/familia?error=" + encodeURIComponent(error.message));
  }

  revalidatePath("/familia");
  redirect("/familia?success=" + encodeURIComponent("Convite cancelado"));
}

export async function deleteInvitation(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const invitationId = formData.get("invitationId") as string;
  const returnTo = (formData.get("returnTo") as string) || "/convite/enviar";

  // Verify the invitation exists and belongs to a group where user is admin
  const { data: invitation } = await supabase
    .from("invitations")
    .select("id, group_id, status")
    .eq("id", invitationId)
    .single();

  if (!invitation) {
    redirect(returnTo + "?error=" + encodeURIComponent("Convite nao encontrado"));
  }

  // Only allow deleting pending/expired/revoked invitations (not accepted ones)
  if (invitation.status === "accepted") {
    redirect(returnTo + "?error=" + encodeURIComponent("Nao e possivel excluir um convite ja aceito"));
  }

  // Verify requester is admin of the group
  const { data: membership } = await supabase
    .from("group_members")
    .select("role")
    .eq("group_id", invitation.group_id)
    .eq("user_id", user.id)
    .single();

  if (!membership || membership.role !== "admin") {
    redirect(returnTo + "?error=" + encodeURIComponent("Apenas administradores podem excluir convites"));
  }

  // Use service role to bypass RLS (no DELETE policy on invitations table)
  const adminClient = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { error } = await adminClient
    .from("invitations")
    .delete()
    .eq("id", invitationId);

  if (error) {
    redirect(returnTo + "?error=" + encodeURIComponent(error.message));
  }

  revalidatePath("/convite/enviar");
  revalidatePath("/familia");
  redirect(returnTo + "?success=deleted");
}
