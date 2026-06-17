/* ------------------------------------------------------------------ */
/* services/checkin.ts                                                 */
/* Single source of truth for daily_checkins CRUD.                     */
/* Called by: actions/checkin.ts (PWA) and tools.ts:create_checkin.    */
/* Side-effect: posts a chat_messages row so the other parent sees it. */
/* ------------------------------------------------------------------ */

import { SupabaseClient } from "@supabase/supabase-js";
import { captureServerEvent } from "@/lib/posthog-server";

const VALID_CATEGORIES = [
  "screen_time",
  "food",
  "sleep",
  "mood",
  "health",
  "hygiene",
  "activity",
  "school",
  "other",
] as const;

export type CheckinCategory = (typeof VALID_CATEGORIES)[number];

export interface CreateCheckinInput {
  userId: string;
  groupId: string;
  childId?: string | null;
  category?: string;
  title: string;
  description?: string | null;
}

export type ServiceResult<T = Record<string, unknown>> =
  | { ok: true; data: T }
  | { ok: false; error: string; status: number };

const CATEGORY_ICONS: Record<string, string> = {
  screen_time: "📱",
  food: "🍽️",
  sleep: "😴",
  mood: "😊",
  health: "🏥",
  activity: "⚽",
  school: "🎒",
  other: "📝",
};

async function verifyMembership(
  supabase: SupabaseClient,
  groupId: string,
  userId: string,
): Promise<boolean> {
  const { data } = await supabase
    .from("group_members")
    .select("user_id")
    .eq("group_id", groupId)
    .eq("user_id", userId)
    .maybeSingle();
  return !!data;
}

async function verifyChildBelongsToGroup(
  supabase: SupabaseClient,
  childId: string,
  groupId: string,
): Promise<{ ok: boolean; fullName?: string }> {
  const { data } = await supabase
    .from("children")
    .select("id, full_name")
    .eq("id", childId)
    .eq("group_id", groupId)
    .maybeSingle();
  if (!data) return { ok: false };
  return { ok: true, fullName: data.full_name as string };
}

export async function createCheckin(
  supabase: SupabaseClient,
  input: CreateCheckinInput,
): Promise<ServiceResult<{ id: string }>> {
  const title = (input.title || "").trim();
  if (!title) return { ok: false, error: "Titulo obrigatorio", status: 400 };

  const isMember = await verifyMembership(supabase, input.groupId, input.userId);
  if (!isMember) {
    return { ok: false, error: "Sem permissao para este grupo.", status: 403 };
  }

  let childName = "crianca";
  if (input.childId) {
    const child = await verifyChildBelongsToGroup(supabase, input.childId, input.groupId);
    if (!child.ok) {
      return { ok: false, error: "Crianca nao pertence a este grupo.", status: 400 };
    }
    childName = child.fullName || childName;
  }

  const category =
    input.category && (VALID_CATEGORIES as readonly string[]).includes(input.category)
      ? input.category
      : "other";

  const description = input.description?.trim() || null;

  const { data, error } = await supabase
    .from("daily_checkins")
    .insert({
      group_id: input.groupId,
      child_id: input.childId || null,
      logged_by: input.userId,
      category,
      title: title.slice(0, 200),
      description,
    })
    .select("id")
    .single();

  if (error || !data) {
    return {
      ok: false,
      error: error?.message || "Falha ao registrar check-in.",
      status: 400,
    };
  }

  captureServerEvent(input.userId, "checkin_created", { category });

  // Best-effort chat broadcast to the group.
  try {
    const icon = CATEGORY_ICONS[category] || "✅";
    let chatText = `${icon} Check-in: ${title}`;
    if (description) chatText += ` — ${description}`;
    chatText += ` (${childName})`;

    await supabase.from("chat_messages").insert({
      group_id: input.groupId,
      sender_id: input.userId,
      text: chatText,
    });
  } catch (err) {
    console.error(
      "[SVC-CHECKIN] chat post error:",
      err instanceof Error ? err.message : err,
    );
  }

  return { ok: true, data: { id: data.id as string } };
}
