/* ------------------------------------------------------------------ */
/* POST /api/ai/assistant/expense-text — DESPESAS por TEXTO (Fase 2)    */
/*                                                                      */
/* Espelho do custody-text pro playbook de Despesas: o assistente        */
/* reconhece um GASTO narrado ("paguei 250 na consulta do Otto") e o     */
/* transforma em prévia confirmável, pelo MESMO cérebro                  */
/* (createAndAnalyzeText com docType='expense'). Gate PRÓPRIO            */
/* (isExpenseEnabled, OFF por padrão) + beta do grupo. Contrato          */
/* conservador: nada que não seja gasto claro → { found:false }.         */
/* ------------------------------------------------------------------ */

import { NextResponse, type NextRequest } from "next/server";
import { resolveAuthenticatedUser } from "@/lib/api-auth";
import { createClient } from "@/lib/supabase/server";
import { getActiveGroup } from "@/lib/group-utils";
import { reportServerError } from "@/lib/error-tracking/report-server";
import { isBrainEnabledForGroup, isExpenseEnabled } from "@/lib/services/brain-flag";
import { createAndAnalyzeText } from "@/lib/services/brain";
import { buildExpensePreviewMessage } from "@/lib/ai/brain/expense-preview";
import { getMemoryLines } from "@/lib/ai/brain/memory-lines";
import type { BrainChild } from "@/lib/ai/brain/types";

const FILE = "src/app/api/ai/assistant/expense-text/route.ts";

const NOT_CAPTURE = { found: false } as const;

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    // Gate PRÓPRIO das despesas antes de qualquer trabalho: OFF → chat.
    if (!isExpenseEnabled()) return NextResponse.json(NOT_CAPTURE, { status: 200 });

    const auth = await resolveAuthenticatedUser(request);
    if (!auth) return NextResponse.json(NOT_CAPTURE, { status: 200 });

    const supabase = await createClient();
    const group = await getActiveGroup(supabase, auth.id);
    if (!group) return NextResponse.json(NOT_CAPTURE, { status: 200 });

    const body = (await request.json().catch(() => ({}))) as { text?: unknown };
    const text = typeof body.text === "string" ? body.text.trim() : "";
    if (text.length < 6 || text.length > 1000) return NextResponse.json(NOT_CAPTURE, { status: 200 });

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

    const result = await createAndAnalyzeText({
      supabase,
      groupId: group.groupId,
      userId: auth.id,
      channel: "pwa",
      source: "message",
      text,
      children,
      requestedChildId: null,
      docType: "expense",
    });

    if (result.kind === "preview") {
      const expense = result.preview.plan.expense;
      const nameOf = (id: string) => children.find((c) => c.id === id)?.name.split(" ")[0] ?? "";
      return NextResponse.json(
        {
          content: expense
            ? buildExpensePreviewMessage(expense, nameOf, { memoryLines: await getMemoryLines(result.preview.impacts, "") })
            : "💳 Organizei a despesa. Quer que eu registre?",
          intake: {
            id: result.preview.intakeId,
            planHash: result.preview.planHash,
            confirmationToken: result.preview.confirmationToken,
            count: expense?.items.length ?? 0,
            // O widget usa `doc` pra falar de DESPESA no confirmar/desfazer.
            doc: "expense",
          },
          link: "/despesas",
        },
        { status: 200 },
      );
    }
    if (result.kind === "duplicate") {
      return NextResponse.json({ content: result.message, link: "/despesas" }, { status: 200 });
    }

    // unknown_document / error / already_processing → não era gasto claro.
    return NextResponse.json(NOT_CAPTURE, { status: 200 });
  } catch (err) {
    await reportServerError(err, { filePath: FILE, metadata: { step: "assistant_expense_text" } });
    return NextResponse.json(NOT_CAPTURE, { status: 200 });
  }
}
