"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export async function updateProfile(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Nao autenticado" };

  const fullName = (formData.get("fullName") as string)?.trim();
  if (!fullName || fullName.length < 2) {
    return { error: "Nome deve ter pelo menos 2 caracteres" };
  }

  const { error } = await supabase
    .from("profiles")
    .update({ full_name: fullName })
    .eq("id", user.id);

  if (error) {
    return { error: "Erro ao atualizar perfil" };
  }

  revalidatePath("/perfil");
  revalidatePath("/dashboard");
  revalidatePath("/familia");
  revalidatePath("/chat");
  revalidatePath("/calendario");
  revalidatePath("/checkin");
  revalidatePath("/financeiro");

  return { success: true };
}
