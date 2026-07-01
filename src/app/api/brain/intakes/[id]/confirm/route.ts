/* ------------------------------------------------------------------ */
/* POST /api/brain/intakes/[id]/confirm — confirma e materializa         */
/*                                                                      */
/* Auth → kill-switch global → confirmIntake (revalida limites → RPC     */
/* atômica execute_plan). A allowlist por grupo já foi imposta no upload */
/* (o intake só existe se o grupo estava no beta); aqui o master env é a */
/* trava de segundos. A RPC roda com o client do usuário (auth.uid).     */
/* ------------------------------------------------------------------ */

import { NextResponse, type NextRequest } from "next/server";
import { resolveAuthenticatedUser } from "@/lib/api-auth";
import { createClient } from "@/lib/supabase/server";
import { reportServerError } from "@/lib/error-tracking/report-server";
import { isBrainMasterEnabled } from "@/lib/services/brain-flag";
import { confirmIntake } from "@/lib/services/brain";

const FILE = "src/app/api/brain/intakes/[id]/confirm/route.ts";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    if (!isBrainMasterEnabled()) {
      return NextResponse.json({ error: "Recurso indisponível." }, { status: 503 });
    }

    const auth = await resolveAuthenticatedUser(request);
    if (!auth) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

    const { id: intakeId } = await context.params;
    const body = (await request.json().catch(() => null)) as
      | { planHash?: string; confirmationToken?: string; keepIndices?: number[]; edits?: unknown }
      | null;
    if (!body?.planHash || !body?.confirmationToken) {
      return NextResponse.json({ error: "planHash e confirmationToken são obrigatórios." }, { status: 400 });
    }
    const keepIndices =
      Array.isArray(body.keepIndices) && body.keepIndices.every((n) => Number.isInteger(n) && n >= 0)
        ? body.keepIndices
        : undefined;
    // Guard leve de forma; applyActivityEdits capa/valida os VALORES no serviço.
    const edits = Array.isArray(body.edits)
      ? body.edits.filter(
          (e): e is Record<string, unknown> =>
            !!e && typeof e === "object" && Number.isInteger((e as { index?: unknown }).index),
        ).map((e) => ({
          index: (e as { index: number }).index,
          name: typeof e.name === "string" ? e.name : undefined,
          subject: e.subject === null || typeof e.subject === "string" ? (e.subject as string | null) : undefined,
          startDate: typeof e.startDate === "string" ? e.startDate : undefined,
          timeStart: e.timeStart === null || typeof e.timeStart === "string" ? (e.timeStart as string | null) : undefined,
          notes: e.notes === null || typeof e.notes === "string" ? (e.notes as string | null) : undefined,
        }))
      : undefined;

    const supabase = await createClient();
    const result = await confirmIntake({
      supabase,
      intakeId,
      planHash: body.planHash,
      confirmationToken: body.confirmationToken,
      keepIndices,
      edits,
    });

    const status =
      result.kind === "executed" ? 200 :
      result.kind === "stale_plan" ? 409 :
      result.kind === "already_processing" ? 409 :
      result.kind === "error" ? 400 : 200;
    return NextResponse.json(result, { status });
  } catch (err) {
    await reportServerError(err, { filePath: FILE, metadata: { step: "confirm_post" } });
    return NextResponse.json({ error: "Erro inesperado." }, { status: 500 });
  }
}
