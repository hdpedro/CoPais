/**
 * POST /api/activities/outcome
 *   body: { activityId, occurrenceDate, status: 'happened'|'missed'|'snoozed', snoozeMinutes? }
 *   → registra o desfecho "aconteceu?" de uma ocorrência. marked_by = auth.uid().
 *
 * Chamadores:
 *   - quick-action da notificação Native (iOS/Android) — via apiFetch Bearer
 *   - service worker do web-push (PWA) — via fetch com cookies
 *   - botão in-app (Native + PWA)
 *
 * Wrapper fino sobre `services/activity-outcomes.ts`. Admin client +
 * enforceMembership=true (a checagem de grupo vive no service).
 */

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveAuthenticatedUser } from "@/lib/api-auth";
import { reportServerError } from "@/lib/error-tracking/report-server";
import {
  recordActivityOutcome,
  type ActivityOutcomeStatus,
} from "@/lib/services/activity-outcomes";

interface PostBody {
  activityId?: string;
  occurrenceDate?: string;
  status?: ActivityOutcomeStatus;
  snoozeMinutes?: number;
}

export async function POST(request: Request) {
  let user: Awaited<ReturnType<typeof resolveAuthenticatedUser>> | null = null;

  try {
    user = await resolveAuthenticatedUser(request);
    if (!user) {
      return NextResponse.json({ error: "Sessão expirada." }, { status: 401 });
    }

    const body = (await request.json().catch(() => ({}))) as PostBody;

    const result = await recordActivityOutcome(
      createAdminClient(),
      {
        activityId: body.activityId?.trim() || "",
        occurrenceDate: body.occurrenceDate?.trim() || "",
        status: body.status as ActivityOutcomeStatus,
        userId: user.id,
        snoozeMinutes:
          typeof body.snoozeMinutes === "number" ? body.snoozeMinutes : undefined,
      },
      {
        callerPath: "src/app/api/activities/outcome/route.ts:POST",
        enforceMembership: true,
        via: "api_outcome",
      },
    );

    if (!result.ok) {
      return NextResponse.json(
        { error: result.error, code: result.errorCode, pgCode: result.pgCode },
        { status: result.status },
      );
    }

    return NextResponse.json({ success: true, outcome: result.data });
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : "Erro inesperado.";
    void reportServerError(caught, {
      filePath: "src/app/api/activities/outcome/route.ts",
      severity: "error",
      userId: user?.id,
      metadata: { phase: "unhandled_exception_post" },
    });
    return NextResponse.json(
      { error: `Erro ao registrar: ${message}` },
      { status: 500 },
    );
  }
}
