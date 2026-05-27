/**
 * POST /api/onboarding/auto-accept-invitation
 *
 * Native-callable wrapper around `autoAcceptPendingInvitations` (server
 * action). Used by the iOS onboarding flow to mirror PWA behaviour: if the
 * user has a pending invitation matching their email, accept it before
 * showing the "create group" form. Returns `{ accepted: boolean }`.
 */

import { NextRequest, NextResponse } from "next/server";
import { resolveAuthenticatedUser } from "@/lib/api-auth";
import { autoAcceptPendingInvitations } from "@/actions/invitation";

export async function POST(req: NextRequest) {
  // Dual auth via helper centralizado (Bearer pro native, cookies pro PWA).
  const user = await resolveAuthenticatedUser(req);

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Pass the resolved userId so the action doesn't try to re-read cookies
  // (which would fail for native callers using Bearer).
  const accepted = await autoAcceptPendingInvitations(user.id);
  return NextResponse.json({ accepted });
}
