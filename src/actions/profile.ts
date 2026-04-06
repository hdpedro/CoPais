"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath, revalidateTag } from "next/cache";

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

  revalidateTag(`profile-${user.id}`, "max");
  revalidatePath("/perfil");
  revalidatePath("/dashboard");

  return { success: true };
}
