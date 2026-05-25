/**
 * /api/notifications/prefs — REST endpoint pro native consumir+atualizar
 * preferências de notificação.
 *
 *  GET   → retorna prefs atual do user
 *  PATCH → merge patch (mesmo shape do JSONB) no row
 *
 * Bearer auth via `resolveAuthenticatedUser`.
 */

import { NextResponse } from "next/server";
import { resolveAuthenticatedUser } from "@/lib/api-auth";
import {
  getNotificationPrefs,
  updateNotificationPrefs,
  type NotificationPrefs,
} from "@/lib/services/notification-prefs";

export async function GET(request: Request) {
  const user = await resolveAuthenticatedUser(request);
  if (!user) {
    return NextResponse.json({ error: "Sessão expirada." }, { status: 401 });
  }
  const prefs = await getNotificationPrefs(user.id);
  return NextResponse.json(prefs);
}

export async function PATCH(request: Request) {
  const user = await resolveAuthenticatedUser(request);
  if (!user) {
    return NextResponse.json({ error: "Sessão expirada." }, { status: 401 });
  }
  const body = (await request.json().catch(() => ({}))) as Partial<NotificationPrefs>;
  await updateNotificationPrefs({ userId: user.id, patch: body });
  const next = await getNotificationPrefs(user.id);
  return NextResponse.json(next);
}
