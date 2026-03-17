"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function createCheckin(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Nao autenticado" };

  const groupId = formData.get("groupId") as string;
  const childId = formData.get("childId") as string;
  const category = formData.get("category") as string;
  const title = formData.get("title") as string;
  const description = formData.get("description") as string;

  if (!title?.trim()) return { error: "Titulo obrigatorio" };

  const { error } = await supabase.from("daily_checkins").insert({
    group_id: groupId,
    child_id: childId,
    logged_by: user.id,
    category,
    title: title.trim(),
    description: description?.trim() || null,
  });

  if (error) return { error: error.message };

  // Get child name for the chat message
  const { data: child } = await supabase
    .from("children")
    .select("full_name")
    .eq("id", childId)
    .single();

  const childName = child?.full_name || "crianca";
  const categoryIcons: Record<string, string> = {
    screen_time: "📱", food: "🍽️", sleep: "😴", mood: "😊",
    health: "🏥", activity: "⚽", school: "🎒", other: "📝",
  };
  const icon = categoryIcons[category] || "✅";

  // Send check-in to group chat so the other parent sees it
  let chatText = `${icon} Check-in: ${title.trim()}`;
  if (description?.trim()) chatText += ` — ${description.trim()}`;
  chatText += ` (${childName})`;

  await supabase.from("chat_messages").insert({
    group_id: groupId,
    sender_id: user.id,
    text: chatText,
  });

  revalidatePath("/checkin");
  revalidatePath("/chat");
  return { success: true };
}
