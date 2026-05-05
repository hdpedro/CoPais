"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath, revalidateTag } from "next/cache";
import { QUICK_ACTIONS_CATALOG } from "@/lib/constants";

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

export async function updateQuickActions(primary: string, secondary: string[]) {
  const validIds = new Set(QUICK_ACTIONS_CATALOG.map((a) => a.id));

  if (!validIds.has(primary)) return { error: "Ação primária inválida" };

  const validSecondary = secondary.filter((id) => validIds.has(id) && id !== primary).slice(0, 6);

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Não autenticado" };

  const { error } = await supabase
    .from("profiles")
    .update({ quick_actions: { primary, secondary: validSecondary } })
    .eq("id", user.id);

  if (error) return { error: "Erro ao salvar preferências" };

  revalidateTag(`profile-${user.id}`, "max");
  revalidatePath("/dashboard");

  return { success: true };
}
