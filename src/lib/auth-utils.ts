import { SupabaseClient } from "@supabase/supabase-js";

/**
 * Verifica se o usuario pertence ao grupo especificado.
 * Retorna o role do membro ou null se nao for membro.
 */
export async function verifyGroupMembership(
  supabase: SupabaseClient,
  groupId: string,
  userId: string
): Promise<{ role: string } | null> {
  const { data: membership } = await supabase
    .from("group_members")
    .select("role")
    .eq("group_id", groupId)
    .eq("user_id", userId)
    .single();

  return membership;
}
