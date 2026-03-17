"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

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

  const { error } = await supabase
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

export async function cancelInvitation(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const invitationId = formData.get("invitationId") as string;

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
