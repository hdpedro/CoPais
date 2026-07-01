/* ------------------------------------------------------------------ */
/* POST /api/ai/assistant/exam-text — captura de provas por TEXTO       */
/*                                                                      */
/* PARIDADE com a foto: o assistente do app reconhece uma DESCRIÇÃO de  */
/* provas (digitada ou ditada) e a transforma em prévia confirmável,     */
/* pelo MESMO cérebro (createAndAnalyzeText → analyzeIntakeText).         */
/*                                                                      */
/* Contrato conservador: qualquer coisa que NÃO seja captura clara de    */
/* provas (fora do beta, sem criança, texto genérico/pergunta que o      */
/* extractor rejeita como 'unknown', erro) devolve { found: false } —    */
/* o widget então segue com o chat normal. Nunca sequestra a conversa.  */
/* ------------------------------------------------------------------ */

import { NextResponse, type NextRequest } from "next/server";
import { resolveAuthenticatedUser } from "@/lib/api-auth";
import { createClient } from "@/lib/supabase/server";
import { getActiveGroup } from "@/lib/group-utils";
import { reportServerError } from "@/lib/error-tracking/report-server";
import { isBrainEnabledForGroup } from "@/lib/services/brain-flag";
import { createAndAnalyzeText } from "@/lib/services/brain";
import type { BrainChild } from "@/lib/ai/brain/types";

const FILE = "src/app/api/ai/assistant/exam-text/route.ts";

const NOT_CAPTURE = { found: false } as const;

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const auth = await resolveAuthenticatedUser(request);
    if (!auth) return NextResponse.json(NOT_CAPTURE, { status: 200 });

    const supabase = await createClient();
    const group = await getActiveGroup(supabase, auth.id);
    if (!group) return NextResponse.json(NOT_CAPTURE, { status: 200 });

    const body = (await request.json().catch(() => ({}))) as { text?: unknown; child_id?: unknown };
    const text = typeof body.text === "string" ? body.text.trim() : "";
    const requestedChildId = typeof body.child_id === "string" ? body.child_id : null;
    if (text.length < 6 || text.length > 1000) return NextResponse.json(NOT_CAPTURE, { status: 200 });

    // Só grupo no beta processa; fora dele → chat normal (sem expor o recurso).
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
    });

    if (result.kind === "preview") {
      const acts = result.preview.plan.activities ?? [];
      const childName = children.find((c) => c.id === (acts[0]?.childId ?? null))?.name || "seu filho(a)";
      const n = acts.length;
      const already = result.preview.alreadyPresent ?? 0;
      const alreadyNote = already > 0 ? ` (${already === 1 ? "1 já estava" : `${already} já estavam`} no Kindar)` : "";
      return NextResponse.json(
        {
          content: `📚 Entendi ${n === 1 ? "1 prova" : `${n} provas`} para ${childName}${alreadyNote}. Quer que eu adicione? Você pode revisar em Escola › Calendário.`,
          intake: {
            id: result.preview.intakeId,
            planHash: result.preview.planHash,
            confirmationToken: result.preview.confirmationToken,
            count: n,
          },
          link: "/escola/calendario",
        },
        { status: 200 },
      );
    }
    if (result.kind === "needs_child_selection") {
      return NextResponse.json(
        {
          content: "De qual criança são essas provas? É só tocar no nome:",
          childSelection: { options: (result.options ?? children).map((c) => ({ id: c.id, name: c.name })) },
        },
        { status: 200 },
      );
    }
    if (result.kind === "duplicate") {
      return NextResponse.json({ content: result.message, link: "/escola/calendario" }, { status: 200 });
    }

    // unknown_document / error / already_processing → não era captura de provas.
    return NextResponse.json(NOT_CAPTURE, { status: 200 });
  } catch (err) {
    await reportServerError(err, { filePath: FILE, metadata: { step: "assistant_exam_text" } });
    return NextResponse.json(NOT_CAPTURE, { status: 200 });
  }
}
