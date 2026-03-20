"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { verifyGroupMembership } from "@/lib/auth-utils";

export async function createEvent(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const groupId = formData.get("groupId") as string;

  // Verify user belongs to this group
  const membership = await verifyGroupMembership(supabase, groupId, user.id);
  if (!membership) {
    redirect("/dashboard?error=" + encodeURIComponent("Sem permissao para este grupo."));
  }

  const childId = formData.get("childId") as string;

  // Verify child belongs to group
  if (childId) {
    const { data: child } = await supabase.from("children").select("id").eq("id", childId).eq("group_id", groupId).single();
    if (!child) redirect("/eventos?error=" + encodeURIComponent("Crianca nao pertence a este grupo."));
  }

  const title = formData.get("title") as string;
  const description = formData.get("description") as string;
  const eventDate = formData.get("eventDate") as string;
  const eventTime = formData.get("eventTime") as string;
  const location = formData.get("location") as string;

  // Handle image upload (max 5MB)
  const image = formData.get("image") as File;
  let imageUrl: string | null = null;

  if (image && image.size > 5 * 1024 * 1024) {
    redirect("/eventos?error=" + encodeURIComponent("Imagem muito grande. Maximo 5MB."));
  }

  if (image && image.size > 0) {
    const fileName = `events/${groupId}/${Date.now()}-${image.name}`;
    const { error: uploadError } = await supabase.storage
      .from("documents")
      .upload(fileName, image);

    if (!uploadError) {
      const { data: urlData } = supabase.storage.from("documents").getPublicUrl(fileName);
      imageUrl = urlData.publicUrl;
    }
  }

  const { error } = await supabase.from("events").insert({
    group_id: groupId,
    child_id: childId || null,
    title,
    description: description || null,
    event_date: eventDate,
    event_time: eventTime || null,
    location: location || null,
    image_url: imageUrl,
    created_by: user.id,
  });

  if (error) redirect("/eventos?error=" + encodeURIComponent(error.message));
  revalidatePath("/eventos");
  redirect("/eventos");
}

export async function updateEvent(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const eventId = formData.get("eventId") as string;
  const groupId = formData.get("groupId") as string;

  const membership = await verifyGroupMembership(supabase, groupId, user.id);
  if (!membership) {
    redirect("/eventos?error=" + encodeURIComponent("Sem permissao."));
  }

  const childId = formData.get("childId") as string;
  const title = formData.get("title") as string;
  const description = formData.get("description") as string;
  const eventDate = formData.get("eventDate") as string;
  const eventTime = formData.get("eventTime") as string;
  const location = formData.get("location") as string;

  const { error } = await supabase.from("events").update({
    child_id: childId || null,
    title,
    description: description || null,
    event_date: eventDate,
    event_time: eventTime || null,
    location: location || null,
  }).eq("id", eventId).eq("group_id", groupId);

  if (error) redirect("/eventos?error=" + encodeURIComponent(error.message));
  revalidatePath("/eventos");
  redirect("/eventos");
}

export async function deleteEvent(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const eventId = formData.get("eventId") as string;
  const groupId = formData.get("groupId") as string;

  const membership = await verifyGroupMembership(supabase, groupId, user.id);
  if (!membership) {
    redirect("/eventos?error=" + encodeURIComponent("Sem permissao."));
  }

  const { error } = await supabase.from("events").delete()
    .eq("id", eventId).eq("group_id", groupId);

  if (error) redirect("/eventos?error=" + encodeURIComponent(error.message));
  revalidatePath("/eventos");
  redirect("/eventos");
}

export async function cancelEvent(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const eventId = formData.get("eventId") as string;
  const groupId = formData.get("groupId") as string;

  const membership = await verifyGroupMembership(supabase, groupId, user.id);
  if (!membership) {
    redirect("/eventos?error=" + encodeURIComponent("Sem permissao."));
  }

  const { error } = await supabase.from("events").update({ status: "cancelled" })
    .eq("id", eventId).eq("group_id", groupId);

  if (error) redirect("/eventos?error=" + encodeURIComponent(error.message));
  revalidatePath("/eventos");
  redirect("/eventos");
}
