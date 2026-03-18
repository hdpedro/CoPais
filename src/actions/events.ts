"use server";

import { redirect } from "next/navigation";
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
  const title = formData.get("title") as string;
  const description = formData.get("description") as string;
  const eventDate = formData.get("eventDate") as string;
  const eventTime = formData.get("eventTime") as string;
  const location = formData.get("location") as string;

  // Handle image upload
  const image = formData.get("image") as File;
  let imageUrl: string | null = null;

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
  redirect("/eventos");
}
