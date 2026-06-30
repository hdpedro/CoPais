/* ------------------------------------------------------------------ */
/* DELETE /api/brain/intakes/[id] — undo seguro do intake               */
/*                                                                      */
/* Remove o que o intake criou, PRESERVANDO o que foi editado depois    */
/* (detach-on-edit), purga a mídia e audita. Auth do usuário (a RPC      */
/* apply_undo checa is_group_member).                                   */
/* ------------------------------------------------------------------ */

import { NextResponse, type NextRequest } from "next/server";
import { resolveAuthenticatedUser } from "@/lib/api-auth";
import { createClient } from "@/lib/supabase/server";
import { reportServerError } from "@/lib/error-tracking/report-server";
import { captureServerEvent } from "@/lib/posthog-server";
import { isBrainMasterEnabled } from "@/lib/services/brain-flag";
import { undoIntake } from "@/lib/services/brain-undo";

const FILE = "src/app/api/brain/intakes/[id]/route.ts";

export async function DELETE(
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
    const supabase = await createClient();
    const result = await undoIntake({ supabase, intakeId });

    if (result.kind === "undone") {
      captureServerEvent(auth.id, "brain_intake_undone", {
        intake_id: intakeId,
        removed: result.removed,
        detached: result.detached,
      });
    }
    return NextResponse.json(result, { status: result.kind === "error" ? 400 : 200 });
  } catch (err) {
    await reportServerError(err, { filePath: FILE, metadata: { step: "delete" } });
    return NextResponse.json({ error: "Erro inesperado." }, { status: 500 });
  }
}
