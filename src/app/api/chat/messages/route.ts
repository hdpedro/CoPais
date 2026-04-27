import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getSignedFileUrl } from "@/lib/storage-signed-url";

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const groupId = searchParams.get("groupId");
  const channelId = searchParams.get("channelId");
  const channelSlug = searchParams.get("channelSlug");

  if (!groupId)
    return NextResponse.json({ error: "Missing groupId" }, { status: 400 });

  // Verify group membership
  const { data: membership } = await supabase
    .from("group_members")
    .select("role")
    .eq("group_id", groupId)
    .eq("user_id", user.id)
    .single();

  if (!membership)
    return NextResponse.json({ error: "Not a member" }, { status: 403 });

  // Build query — same logic as page.tsx
  let query = supabase
    .from("chat_messages")
    .select("id, sender_id, text, image_url, channel_id, read_by, created_at")
    .eq("group_id", groupId)
    .order("created_at", { ascending: false })
    .limit(50);

  const isGeral = channelSlug === "geral" || !channelSlug;
  if (isGeral && channelId) {
    query = query.or(`channel_id.eq.${channelId},channel_id.is.null`);
  } else if (channelId) {
    query = query.eq("channel_id", channelId);
  }

  // Get messages + member profiles in parallel
  const [{ data: messages }, { data: members }] = await Promise.all([
    query,
    supabase
      .from("group_members")
      .select("user_id, profiles(full_name)")
      .eq("group_id", groupId),
  ]);

  // Build profile map and attach to messages
  interface GroupMemberRow {
    user_id: string;
    profiles: { full_name: string | null } | { full_name: string | null }[] | null;
  }
  interface ChatMessageRow {
    id: string;
    sender_id: string;
    text: string | null;
    image_url: string | null;
    channel_id: string | null;
    read_by: string[] | null;
    created_at: string;
  }

  const profileMap = new Map<string, string>();
  (members as GroupMemberRow[] || []).forEach((m) => {
    const p = Array.isArray(m.profiles) ? m.profiles[0] : m.profiles;
    if (p?.full_name) profileMap.set(m.user_id, p.full_name);
  });

  const baseRows = ((messages as ChatMessageRow[]) || [])
    .filter((msg) => !!(msg.text?.trim() || msg.image_url));

  // Sign image_urls in parallel — buckets are private after migration 062
  // and the path is what's stored in the DB column.
  const signedRows = await Promise.all(
    baseRows.map(async (msg) => ({
      ...msg,
      image_url: msg.image_url
        ? (await getSignedFileUrl(supabase, "documents", msg.image_url)) || msg.image_url
        : null,
      profiles: { full_name: profileMap.get(msg.sender_id) || "User" },
    })),
  );

  return NextResponse.json({ messages: signedRows.reverse() });
}
