/**
 * PATCH /api/balance-operations/[id]
 *   body: { decision: 'approved' | 'rejected' }
 *   → responde proposta. responderId = auth.uid().
 *
 * Wrapper fino sobre `services/balance-operations.ts:respondToBalanceOperation`.
 */

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveAuthenticatedUser } from "@/lib/api-auth";
import { reportServerError } from "@/lib/error-tracking/report-server";
import { respondToBalanceOperation } from "@/lib/services/balance-operations";

interface PatchBody {
  decision?: "approved" | "rejected";
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  let user: Awaited<ReturnType<typeof resolveAuthenticatedUser>> | null = null;
  let operationId: string | undefined;
  let decision: "approved" | "rejected" | undefined;

  try {
    user = await resolveAuthenticatedUser(request);
    if (!user) {
      return NextResponse.json({ error: "Sessão expirada." }, { status: 401 });
    }

    operationId = (await params).id;
    const body = (await request.json().catch(() => ({}))) as PatchBody;
    decision = body.decision;

    if (decision !== "approved" && decision !== "rejected") {
      return NextResponse.json(
        { error: "decision deve ser 'approved' ou 'rejected'." },
        { status: 400 },
      );
    }

    const result = await respondToBalanceOperation(
      createAdminClient(),
      {
        operationId: operationId || "",
        responderId: user.id,
        decision,
      },
      {
        actorId: user.id,
        callerPath: "src/app/api/balance-operations/[id]/route.ts:PATCH",
        enforceMembership: true,
        via: "native_app",
      },
    );

    if (!result.ok) {
      return NextResponse.json(
        { error: result.error, code: result.errorCode, pgCode: result.pgCode },
        { status: result.status },
      );
    }

    return NextResponse.json({ success: true, operation: result.data });
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : "Erro inesperado.";
    void reportServerError(caught, {
      filePath: "src/app/api/balance-operations/[id]/route.ts",
      severity: "critical",
      userId: user?.id,
      metadata: { operationId, decision, phase: "unhandled_exception_patch" },
    });
    return NextResponse.json(
      { error: `Erro ao responder proposta: ${message}` },
      { status: 500 },
    );
  }
}
