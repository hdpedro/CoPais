/**
 * GET /api/care-routine/today?groupId=<uuid>&date=<YYYY-MM-DD>
 *   → { arrangement, today } — a rotina de leva/busca de HOJE já resolvida
 *     (RoutineToday pronto pro chip do dashboard nativo).
 *
 * `date` é opcional: se ausente, usa o "hoje" em BRT (getBrazilToday).
 *
 * Wrapper fino sobre `services/care-routine.ts:getRoutineToday`. Native:
 * Bearer auth + admin client + enforceMembership=true.
 *
 * ⚠️ Allowlist do middleware: coberta pelo prefix "/api/care-routine".
 */

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveAuthenticatedUser } from "@/lib/api-auth";
import { reportServerError } from "@/lib/error-tracking/report-server";
import { getBrazilToday } from "@/lib/calendar-utils";
import { getRoutineToday } from "@/lib/services/care-routine";

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
    const dateKey = url.searchParams.get("date") || getBrazilToday();

    const result = await getRoutineToday(
      createAdminClient(),
      { groupId: groupId || "", dateKey, currentUserId: user.id },
      {
        actorId: user.id,
        callerPath: "src/app/api/care-routine/today/route.ts:GET",
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

    return NextResponse.json(result.data);
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : "Erro inesperado.";
    void reportServerError(caught, {
      filePath: "src/app/api/care-routine/today/route.ts",
      severity: "warning",
      userId: user?.id,
      metadata: { groupId, phase: "unhandled_exception_get" },
    });
    return NextResponse.json({ error: `Erro ao carregar rotina: ${message}` }, { status: 500 });
  }
}
