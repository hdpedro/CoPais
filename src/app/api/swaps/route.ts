/**
 * POST  /api/swaps  → create a swap_requests row (custody day swap or debt-day).
 * PATCH /api/swaps  → respond to a pending swap (approved | rejected). When
 *                     approved the service ALSO materializes the resulting
 *                     custody_events rows so the calendar reflects the change.
 *
 * Native-callable wrapper around `src/lib/services/swap.ts`. The PWA action
 * `src/actions/calendar.ts:{createSwapRequest,respondToSwapRequest}` and the
 * WhatsApp tools (`src/lib/ai/tools.ts`) call the same service — paridade
 * obrigatória pelo `DEV/.claude/CLAUDE.md`.
 */

import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveAuthenticatedUser } from "@/lib/api-auth";
import {
  createSwapRequest,
  respondToSwapRequest,
} from "@/lib/services/swap";

export async function POST(request: Request) {
  const user = await resolveAuthenticatedUser(request);
  if (!user) {
    return NextResponse.json({ error: "Sessão expirada." }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const result = await createSwapRequest(createAdminClient(), {
    groupId: body.groupId as string,
    requesterId: user.id,
    targetUserId: body.targetUserId as string,
    originalDate: body.originalDate as string,
    proposedDate: (body.proposedDate as string | null) || null,
    reason: (body.reason as string | null) || null,
    type: (body.type as "swap" | "visit" | undefined) || "swap",
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  revalidatePath("/calendario");
  revalidatePath("/chat");
  return NextResponse.json({ success: true, id: result.data.id });
}

export async function PATCH(request: Request) {
  const user = await resolveAuthenticatedUser(request);
  if (!user) {
    return NextResponse.json({ error: "Sessão expirada." }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const result = await respondToSwapRequest(createAdminClient(), {
    swapId: body.swapId as string,
    responderId: user.id,
    decision: body.decision as "approved" | "rejected",
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  revalidatePath("/calendario");
  revalidatePath("/chat");
  return NextResponse.json({ success: true });
}
