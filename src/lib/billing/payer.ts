import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Only legal guardians (profiles.role = 'parent') may start or cancel
 * a subscription for their group. Grandparents, caregivers, mediators
 * and lawyers can consume premium features but never hold the bill —
 * this preserves the "network multiplier stays free" principle.
 *
 * Checks BOTH the user's global role (profiles.role) AND that they
 * actually belong to the target group (group_members). Without the
 * membership check, a 'parent' profile could in theory pay for a group
 * they don't belong to.
 */
export async function canStartSubscription(
  supabase: SupabaseClient,
  userId: string,
  groupId: string
): Promise<{ allowed: boolean; reason?: string }> {
  const [profileRes, memberRes] = await Promise.all([
    supabase.from("profiles").select("role").eq("id", userId).maybeSingle(),
    supabase
      .from("group_members")
      .select("role")
      .eq("group_id", groupId)
      .eq("user_id", userId)
      .maybeSingle(),
  ]);

  if (!memberRes.data) {
    return { allowed: false, reason: "not_group_member" };
  }

  const profileRole = profileRes.data?.role;
  if (profileRole !== "parent") {
    return { allowed: false, reason: "not_legal_guardian" };
  }

  return { allowed: true };
}
