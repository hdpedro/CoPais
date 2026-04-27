/**
 * Dual-auth helper for native-callable API routes.
 *
 * Native callers send `Authorization: Bearer <access_token>`. PWA callers
 * use cookie-based session (the regular createClient on the server). This
 * helper returns the resolved userId (and email when easy) so route
 * handlers stop duplicating the same 15-line auth dance.
 *
 * Returns null when neither path resolves a user — caller decides whether
 * to 401 or fall through.
 */

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export interface ResolvedUser {
  id: string;
  email: string | null;
}

export async function resolveAuthenticatedUser(
  request: Request,
): Promise<ResolvedUser | null> {
  const authHeader = request.headers.get("authorization");

  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7);
    const admin = createAdminClient();
    const { data, error } = await admin.auth.getUser(token);
    if (!error && data.user) {
      return { id: data.user.id, email: data.user.email ?? null };
    }
    return null;
  }

  const cookieClient = await createClient();
  const { data: { user } } = await cookieClient.auth.getUser();
  if (user) return { id: user.id, email: user.email ?? null };
  return null;
}
