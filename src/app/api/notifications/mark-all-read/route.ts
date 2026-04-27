/**
 * POST /api/notifications/mark-all-read  → flip `is_read=true` on every
 *      unread notification belonging to the authenticated user.
 *
 * Native bell-icon "marcar todas como lidas". PWA filters by user_id with
 * the cookie session + RLS; this route does the same compound filter via
 * admin client, ensuring no cross-user mutation.
 */

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveAuthenticatedUser } from "@/lib/api-auth";

export async function POST(request: Request) {
  const user = await resolveAuthenticatedUser(request);
  if (!user) {
    return NextResponse.json({ error: "Sessão expirada." }, { status: 401 });
  }

  const admin = createAdminClient();

  const { error, count } = await admin
    .from("notifications")
    .update({ is_read: true }, { count: "exact" })
    .eq("user_id", user.id)
    .eq("is_read", false);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ success: true, updated: count ?? 0 });
}
