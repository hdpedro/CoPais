"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createClient as createSupabaseClient, SupabaseClient } from "@supabase/supabase-js";
import { verifyGroupMembership } from "@/lib/auth-utils";
import { postChatNotification } from "@/lib/chat-notify";
import { sendPushToUsers } from "@/lib/push";

/**
 * Count how many parents (non-readonly members) are in a group.
 */
async function countParentsInGroup(
  supabase: SupabaseClient<unknown>,
  groupId: string
): Promise<number> {
  const { data, error } = await supabase
    .from("group_members")
    .select("id")
    .eq("group_id", groupId)
    .neq("role", "readonly");

  if (error || !data) return 0;
  return data.length;
}

/**
 * Request deletion of a sensitive note.
 * - If only 1 parent in group: delete immediately.
 * - If 2+ parents: mark as deletion requested (needs approval from other parent).
 */
export async function requestDeletion(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const noteId = formData.get("noteId") as string;
  const groupId = formData.get("groupId") as string;

  if (!noteId || !groupId) {
    redirect("/temas-sensiveis?error=" + encodeURIComponent("Dados invalidos."));
  }

  const membership = await verifyGroupMembership(supabase, groupId, user.id);
  if (!membership || membership.role === "readonly") {
    redirect("/temas-sensiveis?error=" + encodeURIComponent("Sem permissao."));
  }

  // Verify the note belongs to this group
  const { data: note } = await supabase
    .from("sensitive_notes")
    .select("id, group_id")
    .eq("id", noteId)
    .eq("group_id", groupId)
    .single();

  if (!note) {
    redirect("/temas-sensiveis?error=" + encodeURIComponent("Registro nao encontrado."));
  }

  const parentCount = await countParentsInGroup(supabase, groupId);

  if (parentCount <= 1) {
    // Only 1 parent — delete immediately
    const adminClient = createSupabaseClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
    const { error } = await adminClient
      .from("sensitive_notes")
      .delete()
      .eq("id", noteId)
      .eq("group_id", groupId);

    if (error) {
      redirect("/temas-sensiveis?error=" + encodeURIComponent(error.message));
    }
  } else {
    // 2+ parents — mark as deletion requested
    const { error } = await supabase
      .from("sensitive_notes")
      .update({
        deletion_requested_by: user.id,
        deletion_requested_at: new Date().toISOString(),
      })
      .eq("id", noteId)
      .eq("group_id", groupId);

    if (error) {
      redirect("/temas-sensiveis?error=" + encodeURIComponent(error.message));
    }

    // Get requester name for notifications
    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name")
      .eq("id", user.id)
      .single();
    const requesterName = profile?.full_name?.split(" ")[0] || "Alguem";

    // Send push notification to other parents
    try {
      const { data: otherMembers } = await supabase
        .from("group_members")
        .select("user_id")
        .eq("group_id", groupId)
        .neq("user_id", user.id)
        .neq("role", "readonly");
      const otherIds = (otherMembers || []).map((m) => m.user_id);
      if (otherIds.length > 0) {
        await sendPushToUsers(otherIds, {
          title: "Solicitacao de exclusao",
          body: `${requesterName} solicitou a exclusao de um tema sensivel. Sua aprovacao e necessaria.`,
          url: "/temas-sensiveis",
        });
      }
    } catch { /* non-critical */ }

    // Post chat notification
    try {
      await postChatNotification(
        supabase,
        groupId,
        user.id,
        `${requesterName} solicitou a exclusao de um registro em Temas Sensiveis. Aprovacao necessaria.`
      );
    } catch { /* non-critical */ }
  }

  revalidatePath("/temas-sensiveis");
  redirect("/temas-sensiveis");
}

/**
 * Approve deletion — the OTHER parent approves the deletion request.
 * Verifies the approver is NOT the same person who requested.
 * Uses admin client for DELETE (bypass RLS).
 */
export async function approveDeletion(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const noteId = formData.get("noteId") as string;
  const groupId = formData.get("groupId") as string;

  if (!noteId || !groupId) {
    redirect("/temas-sensiveis?error=" + encodeURIComponent("Dados invalidos."));
  }

  const membership = await verifyGroupMembership(supabase, groupId, user.id);
  if (!membership || membership.role === "readonly") {
    redirect("/temas-sensiveis?error=" + encodeURIComponent("Sem permissao."));
  }

  // Fetch the note and verify deletion was requested by someone else
  const { data: note } = await supabase
    .from("sensitive_notes")
    .select("id, group_id, deletion_requested_by")
    .eq("id", noteId)
    .eq("group_id", groupId)
    .single();

  if (!note) {
    redirect("/temas-sensiveis?error=" + encodeURIComponent("Registro nao encontrado."));
  }

  if (!note.deletion_requested_by) {
    redirect("/temas-sensiveis?error=" + encodeURIComponent("Exclusao nao foi solicitada."));
  }

  if (note.deletion_requested_by === user.id) {
    redirect(
      "/temas-sensiveis?error=" +
        encodeURIComponent("Voce nao pode aprovar sua propria solicitacao.")
    );
  }

  // Use admin client to bypass RLS for deletion
  const adminClient = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { error } = await adminClient
    .from("sensitive_notes")
    .delete()
    .eq("id", noteId)
    .eq("group_id", groupId);

  if (error) {
    redirect("/temas-sensiveis?error=" + encodeURIComponent(error.message));
  }

  // Get approver name for notifications
  const { data: approverProfile } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", user.id)
    .single();
  const approverName = approverProfile?.full_name?.split(" ")[0] || "Alguem";

  // Notify requester that deletion was approved
  try {
    if (note.deletion_requested_by) {
      await sendPushToUsers([note.deletion_requested_by], {
        title: "Tema sensivel excluido",
        body: `${approverName} aprovou a exclusao do tema sensivel.`,
        url: "/temas-sensiveis",
      });
    }
  } catch { /* non-critical */ }

  try {
    await postChatNotification(
      supabase,
      groupId,
      user.id,
      `${approverName} aprovou a exclusao de um registro em Temas Sensiveis.`
    );
  } catch { /* non-critical */ }

  revalidatePath("/temas-sensiveis");
  redirect("/temas-sensiveis");
}

/**
 * Cancel a deletion request — sets deletion fields back to null.
 * Can be done by any parent in the group.
 */
export async function cancelDeletion(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const noteId = formData.get("noteId") as string;
  const groupId = formData.get("groupId") as string;

  if (!noteId || !groupId) {
    redirect("/temas-sensiveis?error=" + encodeURIComponent("Dados invalidos."));
  }

  const membership = await verifyGroupMembership(supabase, groupId, user.id);
  if (!membership || membership.role === "readonly") {
    redirect("/temas-sensiveis?error=" + encodeURIComponent("Sem permissao."));
  }

  const { error } = await supabase
    .from("sensitive_notes")
    .update({
      deletion_requested_by: null,
      deletion_requested_at: null,
    })
    .eq("id", noteId)
    .eq("group_id", groupId);

  if (error) {
    redirect("/temas-sensiveis?error=" + encodeURIComponent(error.message));
  }

  revalidatePath("/temas-sensiveis");
  redirect("/temas-sensiveis");
}
