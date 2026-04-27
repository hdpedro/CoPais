/**
 * POST /api/chat/read
 *
 * Native-callable wrapper to merge read receipts into `chat_messages.read_by`
 * (jsonb object map of `{ [userId]: ISO_timestamp }`).
 *
 * Native previously did one direct UPDATE per message, both on the initial
 * sweep when entering a channel AND on every realtime arrival, which:
 *   - hammered the `chat_messages` table with N writes per channel open
 *     (where N = unread count, capped at 20 client-side)
 *   - relied on RLS to gate writes from the client (still does, but the
 *     boundary should live on the server so we can audit + batch)
 *
 * Body: `{ messageIds: string[] }` — caller must restrict the list to
 * messages they didn't author and that they're allowed to read; we still
 * verify membership server-side.
 *
 * Behaviour:
 *   - For each message id, fetch current `read_by`, merge `{ [user.id]: now }`
 *     and update. Done in parallel via `Promise.allSettled` so a single
 *     failure doesn't poison the batch.
 *   - Skips messages where the user is the sender (read receipts on your
 *     own messages are noise).
 *   - Skips messages where the user already has an entry (idempotent).
 */

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveAuthenticatedUser } from "@/lib/api-auth";

const MAX_BATCH = 100;

export async function POST(request: Request) {
  const user = await resolveAuthenticatedUser(request);
  if (!user) {
    return NextResponse.json({ error: "Sessão expirada." }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const messageIds = Array.isArray(body.messageIds)
    ? (body.messageIds as unknown[]).filter(
        (id): id is string => typeof id === "string" && id.length > 0,
      )
    : [];

  if (messageIds.length === 0) {
    return NextResponse.json({ success: true, marked: 0 });
  }

  if (messageIds.length > MAX_BATCH) {
    return NextResponse.json(
      { error: `Máximo de ${MAX_BATCH} mensagens por chamada.` },
      { status: 400 },
    );
  }

  const admin = createAdminClient();

  // Fetch all target messages with their group_id, sender_id, read_by.
  const { data: messages, error: fetchError } = await admin
    .from("chat_messages")
    .select("id, group_id, sender_id, read_by")
    .in("id", messageIds);

  if (fetchError) {
    return NextResponse.json({ error: fetchError.message }, { status: 400 });
  }
  if (!messages || messages.length === 0) {
    return NextResponse.json({ success: true, marked: 0 });
  }

  // Group-membership gate — caller must belong to every message's group.
  const groupIds = Array.from(
    new Set(messages.map((m) => m.group_id as string).filter(Boolean)),
  );
  const { data: memberships } = await admin
    .from("group_members")
    .select("group_id")
    .eq("user_id", user.id)
    .in("group_id", groupIds);

  const memberOf = new Set<string>(
    (memberships || []).map((m) => m.group_id as string),
  );

  const now = new Date().toISOString();

  const updates = messages
    .filter((m) => memberOf.has(m.group_id as string))
    .filter((m) => m.sender_id !== user.id)
    .map(async (m) => {
      const current = (m.read_by as Record<string, string> | null) || {};
      // Idempotent: skip if already marked.
      if (current[user.id]) return { id: m.id, skipped: true } as const;

      const merged = { ...current, [user.id]: now };
      const { error } = await admin
        .from("chat_messages")
        .update({ read_by: merged })
        .eq("id", m.id);
      if (error) return { id: m.id, error: error.message } as const;
      return { id: m.id, ok: true } as const;
    });

  const results = await Promise.allSettled(updates);
  let marked = 0;
  let failed = 0;
  for (const r of results) {
    if (r.status === "fulfilled" && "ok" in r.value && r.value.ok) marked += 1;
    else if (r.status === "rejected") failed += 1;
    else if (r.status === "fulfilled" && "error" in r.value) failed += 1;
  }

  return NextResponse.json({ success: true, marked, failed });
}
