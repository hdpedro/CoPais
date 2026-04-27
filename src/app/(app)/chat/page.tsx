import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getActiveGroup } from "@/lib/group-utils";

import dynamic from "next/dynamic";

const ChatRoom = dynamic(() => import("./ChatRoom"), {
  loading: () => <div className="animate-pulse bg-gray-100 rounded-xl h-96" />,
});

// Hidden topic slugs (kept in DB for FK constraints, but not shown)
const HIDDEN_TOPIC_SLUGS = ["financeiro", "saude", "escola", "rotina"];

interface ChatChannel {
  id: string;
  slug: string;
  name: string;
  channel_type: string;
  child_id: string | null;
  icon: string | null;
  sort_order: number;
}

/**
 * Fetch channels directly (no server action) for reliable SSR
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getChannels(supabase: any, groupId: string): Promise<ChatChannel[]> {
  // Fetch channels + children in PARALLEL (not sequentially)
  const [{ data: existing }, { data: children }] = await Promise.all([
    supabase.from("chat_channels").select("id, slug, name, channel_type, child_id, icon, sort_order").eq("group_id", groupId).order("sort_order"),
    supabase.from("children").select("id, full_name").eq("group_id", groupId),
  ]);

  // If channels exist, check for missing child channels
  if (existing && existing.length > 0) {
    const existingSlugs = new Set((existing as ChatChannel[]).map((ch: ChatChannel) => ch.slug));
    const missingChildren = (children || []).filter(
      (child: { id: string }) => !existingSlugs.has(`child-${child.id}`)
    );

    if (missingChildren.length > 0) {
      const newChannels = missingChildren.map((child: { id: string; full_name: string }, i: number) => ({
        group_id: groupId,
        slug: `child-${child.id}`,
        name: child.full_name.split(" ")[0],
        channel_type: "child" as const,
        child_id: child.id,
        icon: "\u{1F476}",
        sort_order: 10 + i,
      }));
      await supabase.from("chat_channels").insert(newChannels);
      // Return existing + new without re-fetching
      const allChannels = [...(existing as ChatChannel[]), ...newChannels.map((ch: Record<string, unknown>, idx: number) => ({ ...ch, id: `temp-${idx}` } as unknown as ChatChannel))];
      // Re-fetch once to get proper IDs
      const { data: updated } = await supabase.from("chat_channels").select("id, slug, name, channel_type, child_id, icon, sort_order").eq("group_id", groupId).order("sort_order");
      return ((updated || allChannels) as ChatChannel[]).filter((ch: ChatChannel) => !HIDDEN_TOPIC_SLUGS.includes(ch.slug));
    }

    return (existing as ChatChannel[]).filter((ch: ChatChannel) => !HIDDEN_TOPIC_SLUGS.includes(ch.slug));
  }

  // First time: create geral + child channels in ONE insert
  const channelsToCreate = [
    { group_id: groupId, slug: "geral", name: "Geral", icon: "\u{1F4AC}", sort_order: 0, channel_type: "topic" },
    ...(children || []).map((child: { id: string; full_name: string }, i: number) => ({
      group_id: groupId,
      slug: `child-${child.id}`,
      name: child.full_name.split(" ")[0],
      channel_type: "child" as const,
      child_id: child.id,
      icon: "\u{1F476}",
      sort_order: 10 + i,
    })),
  ];
  await supabase.from("chat_channels").insert(channelsToCreate);

  const { data: allChannels } = await supabase.from("chat_channels").select("id, slug, name, channel_type, child_id, icon, sort_order").eq("group_id", groupId).order("sort_order");
  return ((allChannels || []) as ChatChannel[]).filter((ch: ChatChannel) => !HIDDEN_TOPIC_SLUGS.includes(ch.slug));
}

export default async function ChatPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const activeGroup = await getActiveGroup(supabase, user.id);
  if (!activeGroup) redirect("/onboarding");
  const { groupId, isReadonly } = activeGroup;

  // Get channels + members in parallel (not sequentially)
  const [channels, { data: members }] = await Promise.all([
    getChannels(supabase, groupId),
    supabase
      .from("group_members")
      .select("user_id, profiles(full_name)")
      .eq("group_id", groupId),
  ]);

  // Always start with "geral" channel on SSR — client handles switching
  const defaultChannel = channels.find((c) => c.slug === "geral") || channels[0];
  const defaultChannelId = defaultChannel?.id || null;
  const isGeral = !defaultChannel || defaultChannel.slug === "geral";

  // Build profile map
  const profileMap = new Map<string, string>();
  (members || []).forEach((m: { user_id: string; profiles: { full_name: string } | { full_name: string }[] | null }) => {
    const p = Array.isArray(m.profiles) ? m.profiles[0] : m.profiles;
    if (p?.full_name) profileMap.set(m.user_id, p.full_name);
  });

  // Build messages query for "geral" channel
  let messagesQuery = supabase
    .from("chat_messages")
    .select("id, sender_id, text, image_url, channel_id, read_by, created_at")
    .eq("group_id", groupId)
    .order("created_at", { ascending: false })
    .limit(50);

  if (isGeral) {
    if (defaultChannelId) {
      messagesQuery = messagesQuery.or(`channel_id.eq.${defaultChannelId},channel_id.is.null`);
    }
  } else if (defaultChannelId) {
    messagesQuery = messagesQuery.eq("channel_id", defaultChannelId);
  }

  // Fetch messages + channel reads in parallel
  const [{ data: messages, error: messagesError }, { data: channelReads }] = await Promise.all([
    messagesQuery,
    supabase
      .from("chat_channel_reads")
      .select("channel_id, last_read_at")
      .eq("user_id", user.id),
  ]);

  if (messagesError) console.error("Chat messages error:", messagesError);

  // Filter empty messages and attach profiles. image_url is path-only after
  // migration 062 — sign in parallel so the bubble image renders.
  const { getSignedFileUrl } = await import("@/lib/storage-signed-url");
  const baseRows = (messages || []).filter(msg => !!(msg.text?.trim() || msg.image_url));
  const messagesWithProfiles = await Promise.all(
    baseRows.map(async msg => ({
      ...msg,
      image_url: msg.image_url
        ? (await getSignedFileUrl(supabase, "documents", msg.image_url)) || msg.image_url
        : null,
      profiles: { full_name: profileMap.get(msg.sender_id) || "Usuario" },
    })),
  );

  // Compute unread counts
  const unreadCounts: Record<string, number> = {};

  const readsMap: Record<string, string> = {};
  (channelReads || []).forEach((r: { channel_id: string; last_read_at: string }) => {
    readsMap[r.channel_id] = r.last_read_at;
  });

  // Compute unread counts — only look at last 7 days for performance
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const cutoff = sevenDaysAgo.toISOString();
  const { data: allUnreadMsgs } = await supabase
    .from("chat_messages")
    .select("id, channel_id, created_at")
    .eq("group_id", groupId)
    .neq("sender_id", user.id)
    .gt("created_at", cutoff)
    .limit(200);

  // Count per channel in memory
  const channelIdToSlug = new Map(channels.map(ch => [ch.id, ch.slug]));
  const geralChannelId = channels.find(ch => ch.slug === "geral")?.id;

  for (const msg of (allUnreadMsgs || [])) {
    const msgChannelId = msg.channel_id;
    let slug: string | undefined;
    if (!msgChannelId || msgChannelId === geralChannelId) {
      slug = "geral";
    } else {
      slug = channelIdToSlug.get(msgChannelId);
    }
    if (!slug) continue;

    const channelObj = channels.find(ch => ch.slug === slug);
    if (channelObj) {
      const lastRead = readsMap[channelObj.id];
      // Only count as unread if message is newer than last read
      if (!lastRead || msg.created_at > lastRead) {
        unreadCounts[slug] = (unreadCounts[slug] || 0) + 1;
      }
    }
  }

  return (
    <ChatRoom
      groupId={groupId}
      userId={user.id}
      initialMessages={messagesWithProfiles.reverse()}
      members={members || []}
      isReadonly={isReadonly}
      channels={channels}
      defaultChannelSlug="geral"
      defaultChannelId={defaultChannelId}
      unreadCounts={unreadCounts}
    />
  );
}
