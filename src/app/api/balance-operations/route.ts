/**
 * GET /api/balance-operations?groupId=<uuid>&limit=<n>
 *   → lista operations do grupo (com nomes do proposer/target).
 *
 * POST /api/balance-operations
 *   body: { groupId, targetUserId, operationType, days?, notes?, relatedDate?, swapRequestId? }
 *   → cria operation pending. proposerId = auth.uid().
 *
 * Wrappers finos sobre `services/balance-operations.ts`. Native consome via
 * Bearer auth + admin client + enforceMembership=true.
 */

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveAuthenticatedUser } from "@/lib/api-auth";
import { reportServerError } from "@/lib/error-tracking/report-server";
import {
  createBalanceOperation,
  listBalanceOperations,
  type BalanceOperationType,
} from "@/lib/services/balance-operations";

interface PostBody {
  groupId?: string;
  targetUserId?: string;
  operationType?: BalanceOperationType;
  days?: number;
  notes?: string | null;
  relatedDate?: string | null;
  swapRequestId?: string | null;
}

export async function GET(request: Request) {
  let user: Awaited<ReturnType<typeof resolveAuthenticatedUser>> | null = null;
  let groupId: string | undefined;

  try {
    user = await resolveAuthenticatedUser(request);
    if (!user) {
      return NextResponse.json({ error: "Sessão expirada." }, { status: 401 });
    }

    const url = new URL(request.url);
    groupId = url.searchParams.get("groupId") || undefined;
    const limitRaw = url.searchParams.get("limit");
    const limit = limitRaw ? parseInt(limitRaw, 10) || 100 : 100;

    const result = await listBalanceOperations(
      createAdminClient(),
      { groupId: groupId || "", limit },
      {
        actorId: user.id,
        callerPath: "src/app/api/balance-operations/route.ts:GET",
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

    return NextResponse.json({ operations: result.data });
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : "Erro inesperado.";
    void reportServerError(caught, {
      filePath: "src/app/api/balance-operations/route.ts",
      severity: "critical",
      userId: user?.id,
      metadata: { groupId, phase: "unhandled_exception_get" },
    });
    return NextResponse.json(
      { error: `Erro ao listar propostas: ${message}` },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  let user: Awaited<ReturnType<typeof resolveAuthenticatedUser>> | null = null;
  let groupId: string | undefined;
  let operationType: BalanceOperationType | undefined;

  try {
    user = await resolveAuthenticatedUser(request);
    if (!user) {
      return NextResponse.json({ error: "Sessão expirada." }, { status: 401 });
    }

    const body = (await request.json().catch(() => ({}))) as PostBody;
    groupId = body.groupId?.trim();
    operationType = body.operationType;
    const targetUserId = body.targetUserId?.trim() || "";
    const days = typeof body.days === "number" ? body.days : 1;

    const result = await createBalanceOperation(
      createAdminClient(),
      {
        groupId: groupId || "",
        proposerId: user.id,
        targetUserId,
        operationType: operationType as BalanceOperationType,
        days,
        notes: body.notes ?? null,
        relatedDate: body.relatedDate ?? null,
        swapRequestId: body.swapRequestId ?? null,
      },
      {
        actorId: user.id,
        callerPath: "src/app/api/balance-operations/route.ts:POST",
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
      filePath: "src/app/api/balance-operations/route.ts",
      severity: "critical",
      userId: user?.id,
      metadata: { groupId, operationType, phase: "unhandled_exception_post" },
    });
    return NextResponse.json(
      { error: `Erro ao criar proposta: ${message}` },
      { status: 500 },
    );
  }
}
