/* ------------------------------------------------------------------ */
/* POST /api/ai/assistant/consult-text — captura de CONSULTA por TEXTO  */
/*                                                                      */
/* Espelho do exam-text pro Playbook de SAÚDE: o assistente reconhece    */
/* uma DESCRIÇÃO de consulta (digitada ou ditada) e a transforma em      */
/* prévia confirmável, pelo MESMO cérebro (createAndAnalyzeText com       */
/* docType='health_visit'). Gate PRÓPRIO da saúde (isHealthVisitEnabled, */
/* OFF por padrão) + beta do grupo. Contrato conservador: nada que não    */
/* seja captura clara de consulta → { found:false } (o widget cai no chat).*/
/* ------------------------------------------------------------------ */

import { NextResponse, type NextRequest } from "next/server";
import { resolveAuthenticatedUser } from "@/lib/api-auth";
import { createClient } from "@/lib/supabase/server";
import { getActiveGroup } from "@/lib/group-utils";
import { reportServerError } from "@/lib/error-tracking/report-server";
import { isBrainEnabledForGroup, isHealthVisitEnabled } from "@/lib/services/brain-flag";
import { createAndAnalyzeText } from "@/lib/services/brain";
import { buildHealthPreviewMessage } from "@/lib/ai/brain/health-preview";
import type { BrainChild } from "@/lib/ai/brain/types";

const FILE = "src/app/api/ai/assistant/consult-text/route.ts";

const NOT_CAPTURE = { found: false } as const;

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    // Gate PRÓPRIO da saúde antes de qualquer trabalho: OFF → chat normal.
    if (!isHealthVisitEnabled()) return NextResponse.json(NOT_CAPTURE, { status: 200 });

    const auth = await resolveAuthenticatedUser(request);
    if (!auth) return NextResponse.json(NOT_CAPTURE, { status: 200 });

    const supabase = await createClient();
    const group = await getActiveGroup(supabase, auth.id);
    if (!group) return NextResponse.json(NOT_CAPTURE, { status: 200 });

    const body = (await request.json().catch(() => ({}))) as { text?: unknown; child_id?: unknown };
    const text = typeof body.text === "string" ? body.text.trim() : "";
    const requestedChildId = typeof body.child_id === "string" ? body.child_id : null;
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
      requestedChildId,
      docType: "health_visit",
    });

    if (result.kind === "preview") {
      const health = result.preview.plan.health;
      const childId = health?.appointment.childId ?? null;
      const childName = children.find((c) => c.id === childId)?.name || "seu filho(a)";
      return NextResponse.json(
        {
          content: health ? buildHealthPreviewMessage(health, childName) : "🩺 Organizei a consulta. Quer que eu registre?",
          intake: {
            id: result.preview.intakeId,
            planHash: result.preview.planHash,
            confirmationToken: result.preview.confirmationToken,
            count: health?.medications?.length ?? 0,
            // O widget usa `doc` pra falar de CONSULTA (não "provas") no confirmar/desfazer.
            doc: "health",
          },
          link: "/saude",
        },
        { status: 200 },
      );
    }
    if (result.kind === "needs_child_selection") {
      return NextResponse.json(
        {
          content: "🩺 De qual criança é essa consulta? É só tocar no nome:",
          childSelection: { doc: "health", options: (result.options ?? children).map((c) => ({ id: c.id, name: c.name })) },
        },
        { status: 200 },
      );
    }
    if (result.kind === "duplicate") {
      return NextResponse.json({ content: result.message, link: "/saude" }, { status: 200 });
    }

    // unknown_document / error / already_processing → não era captura de consulta.
    return NextResponse.json(NOT_CAPTURE, { status: 200 });
  } catch (err) {
    await reportServerError(err, { filePath: FILE, metadata: { step: "assistant_consult_text" } });
    return NextResponse.json(NOT_CAPTURE, { status: 200 });
  }
}
