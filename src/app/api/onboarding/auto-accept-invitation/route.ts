/**
 * POST /api/onboarding/auto-accept-invitation
 *
 * Native-callable wrapper around `autoAcceptPendingInvitations` (server
 * action). Used by the iOS onboarding flow to mirror PWA behaviour: if the
 * user has a pending invitation matching their email, accept it before
 * showing the "create group" form. Returns `{ accepted: boolean }`.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { autoAcceptPendingInvitations } from "@/actions/invitation";

export async function POST(req: NextRequest) {
  // Authenticate via Bearer (native) or cookie (PWA fallback). Server action
  // re-validates internally.
  const authHeader = req.headers.get("authorization");
  let userId: string | null = null;

  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7);
    const admin = createAdminClient();
    const { data, error } = await admin.auth.getUser(token);
    if (!error && data.user) userId = data.user.id;
  } else {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (user) userId = user.id;
  }

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Pass the resolved userId so the action doesn't try to re-read cookies
  // (which would fail for native callers using Bearer).
  const accepted = await autoAcceptPendingInvitations(userId);
  return NextResponse.json({ accepted });
}
