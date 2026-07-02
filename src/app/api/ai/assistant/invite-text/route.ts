/* ------------------------------------------------------------------ */
/* POST /api/ai/assistant/invite-text — CONVITE por TEXTO (C3)          */
/*                                                                      */
/* Espelho do expense-text: "chegou o convite do aniversário do Théo,   */
/* sábado 12/07 no Buffet Alegria" vira prévia confirmável              */
/* (createAndAnalyzeText, docType='event_invite'). Gate PRÓPRIO         */
/* (isEventInviteEnabled, OFF) + beta. Nada claro → { found:false }.    */
/* ------------------------------------------------------------------ */

import { NextResponse, type NextRequest } from "next/server";
import { resolveAuthenticatedUser } from "@/lib/api-auth";
import { createClient } from "@/lib/supabase/server";
import { getActiveGroup } from "@/lib/group-utils";
import { reportServerError } from "@/lib/error-tracking/report-server";
import { isBrainEnabledForGroup, isEventInviteEnabled } from "@/lib/services/brain-flag";
import { createAndAnalyzeText } from "@/lib/services/brain";
import { buildInvitePreviewMessage } from "@/lib/ai/brain/invite-preview";
import { getMemoryLines } from "@/lib/ai/brain/memory-lines";
import type { BrainChild } from "@/lib/ai/brain/types";

const FILE = "src/app/api/ai/assistant/invite-text/route.ts";

const NOT_CAPTURE = { found: false } as const;

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    if (!isEventInviteEnabled()) return NextResponse.json(NOT_CAPTURE, { status: 200 });

    const auth = await resolveAuthenticatedUser(request);
    if (!auth) return NextResponse.json(NOT_CAPTURE, { status: 200 });

    const supabase = await createClient();
    const group = await getActiveGroup(supabase, auth.id);
    if (!group) return NextResponse.json(NOT_CAPTURE, { status: 200 });

    const body = (await request.json().catch(() => ({}))) as { text?: unknown; child_id?: unknown };
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

    const requestedChildId = typeof body.child_id === "string" && body.child_id ? body.child_id : null;

    const result = await createAndAnalyzeText({
      supabase,
      groupId: group.groupId,
      userId: auth.id,
      channel: "pwa",
      source: "message",
      text,
      children,
      requestedChildId,
      docType: "event_invite",
    });

    if (result.kind === "preview") {
      const invite = result.preview.plan.invite;
      const nameOf = (id: string) => children.find((c) => c.id === id)?.name.split(" ")[0] ?? "";
      const inviteChildName = invite?.childId ? nameOf(invite.childId) : "";
      return NextResponse.json(
        {
          content: invite
            ? buildInvitePreviewMessage(invite, nameOf, {
                memoryLines: await getMemoryLines(result.preview.impacts, inviteChildName),
              })
            : "🎉 Organizei o convite. Quer que eu adicione ao calendário?",
          intake: {
            id: result.preview.intakeId,
            planHash: result.preview.planHash,
            confirmationToken: result.preview.confirmationToken,
            count: 1,
            doc: "invite",
          },
          link: "/calendario",
        },
        { status: 200 },
      );
    }
    if (result.kind === "needs_child_selection") {
      return NextResponse.json(
        {
          content: "🎉 É um convite! De qual criança é? É só tocar no nome:",
          childSelection: { options: result.options.map((o) => ({ id: o.id, name: o.name })) },
        },
        { status: 200 },
      );
    }
    if (result.kind === "duplicate") {
      return NextResponse.json({ content: result.message, link: "/calendario" }, { status: 200 });
    }

    return NextResponse.json(NOT_CAPTURE, { status: 200 });
  } catch (err) {
    await reportServerError(err, { filePath: FILE, metadata: { step: "assistant_invite_text" } });
    return NextResponse.json(NOT_CAPTURE, { status: 200 });
  }
}
