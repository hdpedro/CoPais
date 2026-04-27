/**
 * PATCH /api/notifications/mark-read  → mark a single notification as read.
 *
 * Native-callable wrapper that enforces `notification.user_id === user.id`
 * before flipping `is_read`. PWA reads via cookie session + RLS — same gate,
 * but explicit here so admin client doesn't bypass ownership.
 */

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveAuthenticatedUser } from "@/lib/api-auth";

export async function PATCH(request: Request) {
  const user = await resolveAuthenticatedUser(request);
  if (!user) {
    return NextResponse.json({ error: "Sessão expirada." }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const notificationId = body.id as string | undefined;
  if (!notificationId) {
    return NextResponse.json(
      { error: "id da notificação obrigatório." },
      { status: 400 },
    );
  }

  const admin = createAdminClient();

  const { data: notif } = await admin
    .from("notifications")
    .select("id, user_id")
    .eq("id", notificationId)
    .single();
  if (!notif) {
    return NextResponse.json(
      { error: "Notificação não encontrada." },
      { status: 404 },
    );
  }
  if (notif.user_id !== user.id) {
    return NextResponse.json(
      { error: "Sem permissão." },
      { status: 403 },
    );
  }

  const { error } = await admin
    .from("notifications")
    .update({ is_read: true })
    .eq("id", notificationId);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ success: true });
}
