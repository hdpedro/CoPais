/**
 * PATCH /api/care-routine/slot-proposals → responder proposta PERMANENTE
 * de rotina (accepted | declined). Aceitar MATERIALIZA o padrão semanal
 * (RPC care_routine_respond_slot_proposal — UPSERT nos slots).
 *
 * Native-callable wrapper de `src/lib/services/care-routine-proposals.ts`.
 * A action PWA `src/actions/care-routine.ts:respondToSlotProposal` chama o
 * MESMO service — paridade obrigatória (espelho de /api/swaps).
 */

import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveAuthenticatedUser } from "@/lib/api-auth";
import { respondToSlotProposal } from "@/lib/services/care-routine-proposals";

export async function PATCH(request: Request) {
  const user = await resolveAuthenticatedUser(request);
  if (!user) {
    return NextResponse.json({ error: "Sessão expirada." }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const result = await respondToSlotProposal(createAdminClient(), {
    proposalId: body.proposalId as string,
    responderId: user.id,
    decision: body.decision as "accepted" | "declined",
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  revalidatePath("/calendario");
  revalidatePath("/calendario/rotina");
  return NextResponse.json({ success: true, outcome: result.data.outcome });
}
