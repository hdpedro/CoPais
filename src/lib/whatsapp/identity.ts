/* ------------------------------------------------------------------ */
/* WhatsApp Identity Resolver                                         */
/* Resolves phone number to Kindar user profile and group              */
/* ------------------------------------------------------------------ */

import { SupabaseClient } from "@supabase/supabase-js";
import { hashPhone, normalizePhone } from "./signature";
import { WAPhoneLink } from "./types";

export interface ResolvedIdentity {
  userId: string;
  groupId: string;
  phoneLink: WAPhoneLink;
}

export interface IdentityResult {
  resolved: ResolvedIdentity | null;
  needsLinking: boolean;
  needsVerification: boolean;
  needsGroupSelection: boolean;
  groups?: Array<{ id: string; name: string }>;
}

/**
 * Resolve a WhatsApp phone number to a Kindar user identity.
 */
export async function resolveIdentity(
  supabase: SupabaseClient,
  phoneFrom: string
): Promise<IdentityResult> {
  const phone = normalizePhone(phoneFrom);
  const hash = hashPhone(phone);

  // Lookup phone link
  const { data: link } = await supabase
    .from("whatsapp_phone_links")
    .select("id, user_id, phone_number, phone_hash, verified_at, active_group_id, is_active")
    .eq("phone_hash", hash)
    .eq("is_active", true)
    .single();

  if (!link) {
    return { resolved: null, needsLinking: true, needsVerification: false, needsGroupSelection: false };
  }

  if (!link.verified_at) {
    return { resolved: null, needsLinking: false, needsVerification: true, needsGroupSelection: false };
  }

  // If has an active group, resolve immediately
  if (link.active_group_id) {
    return {
      resolved: {
        userId: link.user_id,
        groupId: link.active_group_id,
        phoneLink: link as WAPhoneLink,
      },
      needsLinking: false,
      needsVerification: false,
      needsGroupSelection: false,
    };
  }

  // No active group — check how many groups the user belongs to
  const { data: memberships } = await supabase
    .from("group_members")
    .select("group_id, coparenting_groups(id, name)")
    .eq("user_id", link.user_id);

  const groups = (memberships || [])
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((m: any) => ({
      id: m.group_id,
      name: m.coparenting_groups?.name || "Grupo",
    }));

  if (groups.length === 0) {
    return { resolved: null, needsLinking: true, needsVerification: false, needsGroupSelection: false };
  }

  if (groups.length === 1) {
    // Auto-select the only group
    await supabase
      .from("whatsapp_phone_links")
      .update({ active_group_id: groups[0].id })
      .eq("id", link.id);

    return {
      resolved: {
        userId: link.user_id,
        groupId: groups[0].id,
        phoneLink: link as WAPhoneLink,
      },
      needsLinking: false,
      needsVerification: false,
      needsGroupSelection: false,
    };
  }

  // Multiple groups — user needs to select
  return {
    resolved: null,
    needsLinking: false,
    needsVerification: false,
    needsGroupSelection: true,
    groups,
  };
}

/**
 * Set the active group for a WhatsApp phone link.
 */
export async function setActiveGroup(
  supabase: SupabaseClient,
  phoneFrom: string,
  groupId: string
): Promise<boolean> {
  const phone = normalizePhone(phoneFrom);
  const hash = hashPhone(phone);

  const { error } = await supabase
    .from("whatsapp_phone_links")
    .update({ active_group_id: groupId })
    .eq("phone_hash", hash)
    .eq("is_active", true);

  return !error;
}
