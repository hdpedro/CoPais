import { SupabaseClient } from "@supabase/supabase-js";

/**
 * Posts a system-style message to the group chat so both parents see important updates.
 * Uses the sender_id of the user who triggered the action.
 */
export async function postChatNotification(
  supabase: SupabaseClient,
  groupId: string,
  senderId: string,
  message: string,
  channelSlug?: string
) {
  try {
    // Find channel_id if slug provided, otherwise find "geral"
    let channelId = null;
    const { data: channel } = await supabase
      .from("chat_channels")
      .select("id")
      .eq("group_id", groupId)
      .eq("slug", channelSlug || "geral")
      .single();

    if (channel) channelId = channel.id;

    await supabase.from("chat_messages").insert({
      group_id: groupId,
      sender_id: senderId,
      text: message,
      channel_id: channelId,
    });
  } catch {
    // Chat notification failure should never block the main action
  }
}
