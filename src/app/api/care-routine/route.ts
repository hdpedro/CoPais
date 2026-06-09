/**
 * POST /api/care-routine
 *   body: { op: 'save_grid', groupId, childId, cells: RoutineCellInput[] }
 *      |  { op: 'create_override', groupId, childId, occurrenceDate, leg, responsibleId, note? }
 *
 * Wrappers finos sobre `services/care-routine.ts`. Native: Bearer auth +
 * admin client + enforceMembership=true.
 *
 * ⚠️ Esta rota PRECISA estar na allowlist do middleware
 * (src/lib/supabase/middleware.ts: "/api/care-routine") senão o Bearer do
 * native bounceia pra /session-recovery → HTML → r.data null.
 */

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveAuthenticatedUser } from "@/lib/api-auth";
import { reportServerError } from "@/lib/error-tracking/report-server";
import {
  saveRoutineGrid,
  createOverride,
  recordRoutineLog,
  type RoutineCellInput,
  type CareRoutineLeg,
  type CareRoutineLogStatus,
} from "@/lib/services/care-routine";

interface PostBody {
  op?: "save_grid" | "create_override" | "record_log";
  groupId?: string;
  childId?: string;
  cells?: RoutineCellInput[];
  occurrenceDate?: string;
  leg?: CareRoutineLeg;
  responsibleId?: string;
  status?: CareRoutineLogStatus;
  note?: string | null;
}

export async function POST(request: Request) {
  let user: Awaited<ReturnType<typeof resolveAuthenticatedUser>> | null = null;
  let op: string | undefined;

  try {
    user = await resolveAuthenticatedUser(request);
    if (!user) {
      return NextResponse.json({ error: "Sessão expirada." }, { status: 401 });
    }

    const body = (await request.json().catch(() => ({}))) as PostBody;
    op = body.op;
    const ctx = {
      actorId: user.id,
      callerPath: "src/app/api/care-routine/route.ts:POST",
      enforceMembership: true,
      via: "native_app",
    };

    if (op === "save_grid") {
      const result = await saveRoutineGrid(
        createAdminClient(),
        {
          groupId: body.groupId?.trim() || "",
          childId: body.childId?.trim() || "",
          actorId: user.id,
          cells: Array.isArray(body.cells) ? body.cells : [],
        },
        ctx,
      );
      if (!result.ok) {
        return NextResponse.json(
          { error: result.error, code: result.errorCode, pgCode: result.pgCode },
          { status: result.status },
        );
      }
      return NextResponse.json({ success: true, slots: result.data });
    }

    if (op === "create_override") {
      const result = await createOverride(
        createAdminClient(),
        {
          groupId: body.groupId?.trim() || "",
          childId: body.childId?.trim() || "",
          actorId: user.id,
          occurrenceDate: body.occurrenceDate?.trim() || "",
          leg: (body.leg || "pickup") as CareRoutineLeg,
          responsibleId: body.responsibleId?.trim() || "",
          note: body.note ?? null,
        },
        ctx,
      );
      if (!result.ok) {
        return NextResponse.json(
          { error: result.error, code: result.errorCode, pgCode: result.pgCode },
          { status: result.status },
        );
      }
      return NextResponse.json({ success: true, override: result.data });
    }

    if (op === "record_log") {
      const result = await recordRoutineLog(
        createAdminClient(),
        {
          groupId: body.groupId?.trim() || "",
          childId: body.childId?.trim() || "",
          actorId: user.id,
          occurrenceDate: body.occurrenceDate?.trim() || "",
          leg: (body.leg || "pickup") as CareRoutineLeg,
          status: (body.status || "done") as CareRoutineLogStatus,
          note: body.note ?? null,
        },
        ctx,
      );
      if (!result.ok) {
        return NextResponse.json(
          { error: result.error, code: result.errorCode, pgCode: result.pgCode },
          { status: result.status },
        );
      }
      return NextResponse.json({ success: true, log: result.data });
    }

    return NextResponse.json({ error: "op inválido (use save_grid, create_override ou record_log)." }, { status: 400 });
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : "Erro inesperado.";
    void reportServerError(caught, {
      filePath: "src/app/api/care-routine/route.ts",
      severity: "critical",
      userId: user?.id,
      metadata: { op, phase: "unhandled_exception_post" },
    });
    return NextResponse.json({ error: `Erro na rotina: ${message}` }, { status: 500 });
  }
}
