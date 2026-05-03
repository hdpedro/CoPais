"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createCheckin as createCheckinService } from "@/lib/services/checkin";

export async function createCheckin(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Nao autenticado" };

  const result = await createCheckinService(supabase, {
    userId: user.id,
    groupId: formData.get("groupId") as string,
    childId: (formData.get("childId") as string) || null,
    category: (formData.get("category") as string) || "other",
    title: (formData.get("title") as string) || "",
    description: (formData.get("description") as string) || null,
  });

  if (!result.ok) return { error: result.error };

  revalidatePath("/checkin");
  revalidatePath("/chat");
  return { success: true };
}
