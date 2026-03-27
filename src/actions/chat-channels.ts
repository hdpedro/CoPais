"use server";

import { createClient } from "@/lib/supabase/server";

// Topic slugs to hide (not delete — FK constraints prevent deletion)
const HIDDEN_TOPIC_SLUGS = ["financeiro", "saude", "escola", "rotina"];

export async function ensureDefaultChannels(groupId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  // Check existing channels
  const { data: existing, error: existingError } = await supabase
    .from("chat_channels")
    .select("*")
    .eq("group_id", groupId)
    .order("sort_order");

  if (existingError) {
    console.error("Error fetching channels:", existingError);
    return [];
  }

  // If channels already exist, ensure child channels are up to date
  if (existing && existing.length > 0) {
    // Check if we need to add child channels for new children
    const { data: children } = await supabase
      .from("children")
      .select("id, full_name")
      .eq("group_id", groupId);

    const existingChildSlugs = new Set(
      existing.filter(ch => ch.channel_type === "child").map(ch => ch.slug)
    );

    const missingChildren = (children || []).filter(
      child => !existingChildSlugs.has(`child-${child.id}`)
    );

    if (missingChildren.length > 0) {
      const childChannels = missingChildren.map((child, i) => ({
        group_id: groupId,
        slug: `child-${child.id}`,
        name: child.full_name.split(" ")[0],
        channel_type: "child" as const,
        child_id: child.id,
        icon: "\u{1F476}",
        sort_order: 10 + i,
      }));

      await supabase.from("chat_channels").insert(childChannels);

      // Re-fetch to get updated list
      const { data: updated } = await supabase
        .from("chat_channels")
        .select("*")
        .eq("group_id", groupId)
        .order("sort_order");

      // Filter out hidden topic channels
      return (updated || []).filter(ch => !HIDDEN_TOPIC_SLUGS.includes(ch.slug));
    }

    // Filter out hidden topic channels from result
    return existing.filter(ch => !HIDDEN_TOPIC_SLUGS.includes(ch.slug));
  }

  // First time: create "geral" channel
  const { data: created, error: createError } = await supabase
    .from("chat_channels")
    .insert({
      group_id: groupId,
      slug: "geral",
      name: "Geral",
      icon: "\u{1F4AC}",
      sort_order: 0,
      channel_type: "topic",
    })
    .select();

  if (createError) {
    console.error("Error creating geral channel:", createError);
    return [];
  }

  // Create child channels
  const { data: children } = await supabase
    .from("children")
    .select("id, full_name")
    .eq("group_id", groupId);

  if (children && children.length > 0) {
    const childChannels = children.map((child, i) => ({
      group_id: groupId,
      slug: `child-${child.id}`,
      name: child.full_name.split(" ")[0],
      channel_type: "child" as const,
      child_id: child.id,
      icon: "\u{1F476}",
      sort_order: 10 + i,
    }));

    const { data: childCreated } = await supabase
      .from("chat_channels")
      .insert(childChannels)
      .select();

    return [...(created || []), ...(childCreated || [])];
  }

  return created || [];
}

export async function markChannelRead(channelId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  await supabase.from("chat_channel_reads").upsert({
    channel_id: channelId,
    user_id: user.id,
    last_read_at: new Date().toISOString(),
  }, { onConflict: "channel_id,user_id" });
}
