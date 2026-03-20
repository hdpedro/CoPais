import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { sendPushToUser } from "@/lib/push";

/**
 * POST /api/push/chat
 * Called by ChatRoom when a message is sent to notify other members
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Nao autenticado" }, { status: 401 });
  }

  const { groupId, messageText } = await request.json();

  if (!groupId || !messageText) {
    return NextResponse.json({ error: "Dados incompletos" }, { status: 400 });
  }

  // Verify user is a member of the group
  const { data: membership } = await supabase
    .from("group_members")
    .select("id")
    .eq("group_id", groupId)
    .eq("user_id", user.id)
    .single();

  if (!membership) {
    return NextResponse.json({ error: "Sem permissao" }, { status: 403 });
  }

  // Get sender name
  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", user.id)
    .single();

  const senderName = profile?.full_name?.split(" ")[0] || "Alguem";

  // Get all group members except the sender
  const { data: members } = await supabase
    .from("group_members")
    .select("user_id")
    .eq("group_id", groupId)
    .neq("user_id", user.id);

  if (!members || members.length === 0) {
    return NextResponse.json({ success: true });
  }

  // Send push to all other members
  const truncatedText = messageText.length > 80
    ? messageText.substring(0, 80) + "..."
    : messageText;

  await Promise.allSettled(
    members.map((member) =>
      sendPushToUser(member.user_id, {
        title: `${senderName} no Chat`,
        body: truncatedText,
        url: "/chat",
        tag: "chat_message",
      })
    )
  );

  return NextResponse.json({ success: true });
}
