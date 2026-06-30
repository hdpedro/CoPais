/* ------------------------------------------------------------------ */
/* POST /api/brain/intakes — upload de foto → preview (Kindar Brain A0)  */
/*                                                                      */
/* Adapter HTTP do PWA: auth → grupo ativo → GATE de flag → ack de       */
/* compartilhamento → valida MIME real (magic bytes) → resolve crianças  */
/* → delega pra createAndAnalyzeIntake (orquestração compartilhada com o */
/* WhatsApp). O que é específico do canal mora aqui; o cérebro é único.  */
/* Defesa em profundidade: rejeita fora do beta mesmo que a UI esconda.  */
/* ------------------------------------------------------------------ */

import { NextResponse, type NextRequest } from "next/server";
import { resolveAuthenticatedUser } from "@/lib/api-auth";
import { createClient } from "@/lib/supabase/server";
import { getActiveGroup } from "@/lib/group-utils";
import { reportServerError } from "@/lib/error-tracking/report-server";
import { isBrainEnabledForGroup } from "@/lib/services/brain-flag";
import { validateImageUpload } from "@/lib/ai/brain/upload-guard";
import { createAndAnalyzeIntake } from "@/lib/services/brain";
import type { BrainChild } from "@/lib/ai/brain/types";

const FILE = "src/app/api/brain/intakes/route.ts";

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    // 1. Auth (Bearer nativo ou cookie PWA).
    const auth = await resolveAuthenticatedUser(request);
    if (!auth) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

    const supabase = await createClient();

    // 2. Grupo ativo.
    const group = await getActiveGroup(supabase, auth.id);
    if (!group) return NextResponse.json({ error: "Sem grupo ativo." }, { status: 403 });

    // 3. GATE: kill-switch global && allowlist do grupo (fail-closed).
    if (!(await isBrainEnabledForGroup(supabase, group.groupId))) {
      return NextResponse.json({ error: "Recurso indisponível." }, { status: 503 });
    }

    // 4. Multipart + ack de compartilhamento (a copy do aviso é jurídica/UI).
    const form = (await request.formData()) as unknown as globalThis.FormData;
    if (form.get("acknowledged") !== "true") {
      return NextResponse.json({ error: "É preciso confirmar o aviso de compartilhamento antes de enviar." }, { status: 400 });
    }
    const file = form.get("file") as File | null;
    if (!file) return NextResponse.json({ error: "Arquivo ausente." }, { status: 400 });

    // 5. Valida o TIPO REAL por magic bytes (não o file.type) + tamanho.
    const buffer = Buffer.from(await file.arrayBuffer());
    const guard = validateImageUpload(buffer);
    if (!guard.ok || !guard.type) {
      const msg =
        guard.reason === "too_large" ? "Imagem muito grande (máx. 8 MB)." :
        guard.reason === "unsupported_type" ? "Envie uma foto (JPEG, PNG ou WebP)." :
        "Arquivo inválido.";
      return NextResponse.json({ error: msg }, { status: 400 });
    }

    // 6. Crianças do grupo (mensagem de erro é específica do canal).
    const { data: childRows } = await supabase
      .from("children")
      .select("id, full_name, birth_date")
      .eq("group_id", group.groupId);
    const children: BrainChild[] = (childRows ?? []).map((c) => ({
      id: c.id as string,
      name: (c.full_name as string) ?? "",
      birthDate: (c.birth_date as string | null) ?? undefined,
    }));
    if (children.length === 0) {
      return NextResponse.json({ error: "Adicione uma criança ao grupo antes de enviar um calendário." }, { status: 400 });
    }
    const requestedChildId = (form.get("child_id") as string | null) || null;

    // 7. Orquestração compartilhada (mesma do WhatsApp; só muda o channel).
    const result = await createAndAnalyzeIntake({
      supabase,
      groupId: group.groupId,
      userId: auth.id,
      channel: "pwa",
      buffer,
      mime: guard.type,
      children,
      requestedChildId,
    });

    const status = result.kind === "error" ? 502 : 200;
    return NextResponse.json(result, { status });
  } catch (err) {
    await reportServerError(err, { filePath: FILE, metadata: { step: "post" } });
    return NextResponse.json({ error: "Erro inesperado." }, { status: 500 });
  }
}
