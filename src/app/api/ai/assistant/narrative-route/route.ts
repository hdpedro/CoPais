/* ------------------------------------------------------------------ */
/* POST /api/ai/assistant/narrative-route — PORTA ÚNICA do widget       */
/*                                                                      */
/* Quando os gates regex do widget não mordem, o cliente pergunta aqui   */
/* "isso é captura de quê?" — UMA chamada LLM barata (classifyNarrative) */
/* decide o playbook; o widget então chama o endpoint certo (exam-text/  */
/* consult-text/custody-text). Conservador: none/confiança < 0.6/flag    */
/* OFF → { found:false } (o widget cai no chat). Nunca lança.            */
/* ------------------------------------------------------------------ */

import { NextResponse, type NextRequest } from "next/server";
import { resolveAuthenticatedUser } from "@/lib/api-auth";
import { createClient } from "@/lib/supabase/server";
import { getActiveGroup } from "@/lib/group-utils";
import { reportServerError } from "@/lib/error-tracking/report-server";
import {
  isBrainEnabledForGroup,
  isHealthVisitEnabled,
  isCustodyRoutineEnabled,
} from "@/lib/services/brain-flag";
import { classifyNarrative, type NarrativeIntentType } from "@/lib/ai/document-classifier";

const FILE = "src/app/api/ai/assistant/narrative-route/route.ts";

const NOT_CAPTURE = { found: false } as const;

function typeEnabled(t: NarrativeIntentType): boolean {
  if (t === "school_calendar") return true;
  if (t === "health_visit") return isHealthVisitEnabled();
  if (t === "custody_routine") return isCustodyRoutineEnabled();
  return false;
}

const HINT_LABEL: Partial<Record<NarrativeIntentType, string>> = {
  school_calendar: "provas da escola",
  health_visit: "uma consulta médica",
  custody_routine: "uma combinação de guarda/rotina",
};

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const auth = await resolveAuthenticatedUser(request);
    if (!auth) return NextResponse.json(NOT_CAPTURE, { status: 200 });

    const supabase = await createClient();
    const group = await getActiveGroup(supabase, auth.id);
    if (!group) return NextResponse.json(NOT_CAPTURE, { status: 200 });

    const body = (await request.json().catch(() => ({}))) as { text?: unknown };
    const text = typeof body.text === "string" ? body.text.trim() : "";
    if (text.length < 15 || text.length > 1000 || /[?]\s*$/.test(text)) {
      return NextResponse.json(NOT_CAPTURE, { status: 200 });
    }

    if (!(await isBrainEnabledForGroup(supabase, group.groupId))) {
      return NextResponse.json(NOT_CAPTURE, { status: 200 });
    }

    const cls = await classifyNarrative(text);
    const [first, second] = cls.intents;
    if (!first || first.type === "none" || first.confidence < 0.6 || !typeEnabled(first.type)) {
      return NextResponse.json(NOT_CAPTURE, { status: 200 });
    }

    const secondHint =
      second && second.type !== "none" && second.type !== first.type && second.confidence >= 0.6 && typeEnabled(second.type)
        ? `Também entendi ${HINT_LABEL[second.type]} nessa mensagem — me manda essa parte de novo que eu registro. 🙂`
        : undefined;

    return NextResponse.json({ found: true, docType: first.type, secondHint }, { status: 200 });
  } catch (err) {
    await reportServerError(err, { filePath: FILE, metadata: { step: "narrative_route" } });
    return NextResponse.json(NOT_CAPTURE, { status: 200 });
  }
}
