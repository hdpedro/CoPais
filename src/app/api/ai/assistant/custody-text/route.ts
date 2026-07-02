/* ------------------------------------------------------------------ */
/* POST /api/ai/assistant/custody-text — GUARDA & ROTINA por TEXTO      */
/*                                                                      */
/* Espelho do consult-text pro playbook de Guarda & Rotina: o assistente */
/* reconhece uma NARRATIVA de logística ("semana que vem o Otto fica     */
/* comigo, e quinta quem busca é a minha mãe") e a transforma em prévia   */
/* confirmável, pelo MESMO cérebro (createAndAnalyzeText com              */
/* docType='custody_routine'). Gate PRÓPRIO (isCustodyRoutineEnabled,     */
/* OFF por padrão) + beta do grupo. Contrato conservador: nada que não    */
/* seja narrativa clara → { found:false } (o widget cai no chat).         */
/* ------------------------------------------------------------------ */

import { NextResponse, type NextRequest } from "next/server";
import { resolveAuthenticatedUser } from "@/lib/api-auth";
import { createClient } from "@/lib/supabase/server";
import { getActiveGroup } from "@/lib/group-utils";
import { reportServerError } from "@/lib/error-tracking/report-server";
import { isBrainEnabledForGroup, isCustodyRoutineEnabled } from "@/lib/services/brain-flag";
import { createAndAnalyzeText } from "@/lib/services/brain";
import { buildCustodyPreviewMessage } from "@/lib/ai/brain/custody-preview";
import type { BrainChild } from "@/lib/ai/brain/types";

const FILE = "src/app/api/ai/assistant/custody-text/route.ts";

const NOT_CAPTURE = { found: false } as const;

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    // Gate PRÓPRIO da guarda antes de qualquer trabalho: OFF → chat normal.
    if (!isCustodyRoutineEnabled()) return NextResponse.json(NOT_CAPTURE, { status: 200 });

    const auth = await resolveAuthenticatedUser(request);
    if (!auth) return NextResponse.json(NOT_CAPTURE, { status: 200 });

    const supabase = await createClient();
    const group = await getActiveGroup(supabase, auth.id);
    if (!group) return NextResponse.json(NOT_CAPTURE, { status: 200 });

    const body = (await request.json().catch(() => ({}))) as { text?: unknown };
    const text = typeof body.text === "string" ? body.text.trim() : "";
    if (text.length < 8 || text.length > 1000) return NextResponse.json(NOT_CAPTURE, { status: 200 });

    if (!(await isBrainEnabledForGroup(supabase, group.groupId))) {
      return NextResponse.json(NOT_CAPTURE, { status: 200 });
    }

    const { data: childRows } = await supabase
      .from("children")
      .select("id, full_name, birth_date")
      .eq("group_id", group.groupId);
    const children: BrainChild[] = (childRows ?? []).map((c) => ({
      id: c.id as string,
      name: (c.full_name as string) ?? "",
      birthDate: (c.birth_date as string | null) ?? undefined,
    }));
    if (children.length === 0) return NextResponse.json(NOT_CAPTURE, { status: 200 });

    const result = await createAndAnalyzeText({
      supabase,
      groupId: group.groupId,
      userId: auth.id,
      channel: "pwa",
      source: "message",
      text,
      children,
      requestedChildId: null,
      docType: "custody_routine",
    });

    if (result.kind === "preview") {
      const custody = result.preview.plan.custody;
      const nameOf = (id: string) => children.find((c) => c.id === id)?.name.split(" ")[0] ?? "";
      return NextResponse.json(
        {
          content: custody
            ? buildCustodyPreviewMessage(custody, nameOf, children.length)
            : "🗓️ Organizei as combinações. Quer que eu registre?",
          intake: {
            id: result.preview.intakeId,
            planHash: result.preview.planHash,
            confirmationToken: result.preview.confirmationToken,
            count: custody?.items.length ?? 0,
            // O widget usa `doc` pra falar de GUARDA/ROTINA no confirmar/desfazer.
            doc: "custody",
          },
          link: "/calendario",
        },
        { status: 200 },
      );
    }
    if (result.kind === "duplicate") {
      return NextResponse.json({ content: result.message, link: "/calendario" }, { status: 200 });
    }

    // unknown_document / error / already_processing → não era narrativa clara.
    return NextResponse.json(NOT_CAPTURE, { status: 200 });
  } catch (err) {
    await reportServerError(err, { filePath: FILE, metadata: { step: "assistant_custody_text" } });
    return NextResponse.json(NOT_CAPTURE, { status: 200 });
  }
}
