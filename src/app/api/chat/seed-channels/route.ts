/**
 * POST /api/chat/seed-channels
 *
 * Creates the default chat_channels for a group when missing:
 *   - 1 "geral" topic channel
 *   - 1 child channel per child in the group (`child-${child_id}` slug)
 *
 * Idempotent — only inserts channels whose slugs don't yet exist. Used
 * primarily by the native client on first chat load to ensure the seed
 * runs server-side (admin client + group-membership gate) instead of
 * relying on RLS-bypass-via-INSERT from the client.
 */

import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveAuthenticatedUser } from "@/lib/api-auth";

interface ExistingChannel {
  slug: string | null;
}

interface ChildRow {
  id: string;
  full_name: string | null;
}

export async function POST(request: Request) {
  const user = await resolveAuthenticatedUser(request);
  if (!user) {
    return NextResponse.json({ error: "Sessão expirada." }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const groupId = body.groupId as string | undefined;
  if (!groupId) {
    return NextResponse.json({ error: "groupId obrigatório." }, { status: 400 });
  }

  const admin = createAdminClient();

  const { data: membership } = await admin
    .from("group_members")
    .select("user_id")
    .eq("group_id", groupId)
    .eq("user_id", user.id)
    .single();
  if (!membership) {
    return NextResponse.json(
      { error: "Sem permissão para este grupo." },
      { status: 403 },
    );
  }

  const [{ data: existing }, { data: kids }] = await Promise.all([
    admin
      .from("chat_channels")
      .select("slug")
      .eq("group_id", groupId),
    admin.from("children").select("id, full_name").eq("group_id", groupId),
  ]);

  const existingSlugs = new Set(((existing as ExistingChannel[]) || []).map((c) => c.slug ?? ""));
  const toInsert: Record<string, unknown>[] = [];

  if (!existingSlugs.has("geral")) {
    toInsert.push({
      group_id: groupId,
      slug: "geral",
      name: "Geral",
      icon: "💬",
      sort_order: 0,
      channel_type: "topic",
    });
  }

  ((kids as ChildRow[]) || []).forEach((c, i) => {
    const slug = `child-${c.id}`;
    if (!existingSlugs.has(slug)) {
      toInsert.push({
        group_id: groupId,
        slug,
        name: c.full_name?.split(" ")[0] || "Filho",
        channel_type: "child",
        child_id: c.id,
        icon: "👶",
        sort_order: 10 + i,
      });
    }
  });

  if (toInsert.length > 0) {
    const { error } = await admin.from("chat_channels").insert(toInsert);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
  }

  revalidateTag(`chat-channels-${groupId}`, "max");
  return NextResponse.json({ success: true, created: toInsert.length });
}
