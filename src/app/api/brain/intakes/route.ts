/* ------------------------------------------------------------------ */
/* POST /api/brain/intakes — upload de foto → preview (Kindar Brain A0)  */
/*                                                                      */
/* Fluxo: auth → grupo ativo → GATE de flag (master env && beta do      */
/* grupo) → ack de compartilhamento → valida MIME real (magic bytes) +  */
/* tamanho → resolve criança → cria intake → sobe original ao bucket →  */
/* analyzeIntakeImage → devolve o preview. Defesa em profundidade: o     */
/* servidor REJEITA fora do beta mesmo que a UI esconda o upload.        */
/* ------------------------------------------------------------------ */

import { NextResponse, type NextRequest } from "next/server";
import { createHash } from "crypto";
import { resolveAuthenticatedUser } from "@/lib/api-auth";
import { createClient } from "@/lib/supabase/server";
import { getActiveGroup } from "@/lib/group-utils";
import { reportServerError } from "@/lib/error-tracking/report-server";
import { captureServerEvent } from "@/lib/posthog-server";
import { isBrainEnabledForGroup } from "@/lib/services/brain-flag";
import { validateImageUpload } from "@/lib/ai/brain/upload-guard";
import { analyzeIntakeImage } from "@/lib/services/brain";
import type { BrainChild, PlaybookContext } from "@/lib/ai/brain/types";

const FILE = "src/app/api/brain/intakes/route.ts";
const EXT: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

/** Data de HOJE no timezone do grupo (YYYY-MM-DD). */
function todayInTz(tz: string): string {
  try {
    return new Date().toLocaleDateString("en-CA", { timeZone: tz });
  } catch {
    return new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  }
}

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

    // 6. Resolve a criança: child_id explícito (se do grupo) ou única do grupo.
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
    const resolvedChildId =
      requestedChildId && children.some((c) => c.id === requestedChildId)
        ? requestedChildId
        : children.length === 1
          ? children[0].id
          : null; // >1 sem escolha → o serviço devolve needs_child_selection

    // 7. timezone canônico do grupo (fallback no serviço também).
    const { data: groupRow } = await supabase
      .from("coparenting_groups")
      .select("timezone")
      .eq("id", group.groupId)
      .single();
    const timezone = (groupRow?.timezone as string | undefined) || "America/Sao_Paulo";
    const today = todayInTz(timezone);

    // 8. Cria o intake (status 'uploaded'; self-insert RLS: created_by=auth.uid).
    const { data: intake, error: insErr } = await supabase
      .from("brain_intakes")
      .insert({
        group_id: group.groupId,
        child_id: resolvedChildId,
        created_by: auth.id,
        source: "document",
        channel: "pwa",
        status: "uploaded",
        source_sha256: createHash("sha256").update(buffer).digest("hex"),
      })
      .select("id")
      .single();
    if (insErr || !intake) {
      await reportServerError(insErr, { filePath: FILE, metadata: { step: "create_intake", groupId: group.groupId } });
      return NextResponse.json({ error: "Falha ao iniciar o processamento." }, { status: 500 });
    }
    const intakeId = intake.id as string;
    captureServerEvent(auth.id, "brain_intake_uploaded", { intake_id: intakeId, channel: "pwa", mime: guard.type });

    // 9. Sobe o original pro bucket privado (group_id como 1ª pasta = RLS).
    const path = `${group.groupId}/brain-intakes/${intakeId}/source.${EXT[guard.type]}`;
    const { error: upErr } = await supabase.storage.from("documents").upload(path, buffer, {
      contentType: guard.type,
      upsert: true,
    });
    if (!upErr) {
      await supabase.from("brain_intakes").update({ source_media_path: path }).eq("id", intakeId);
    } // upload falho é non-fatal pro preview; a análise usa o buffer em memória.

    // 10. Contexto + análise.
    const ctx: PlaybookContext = {
      groupId: group.groupId,
      userId: auth.id,
      channel: "pwa",
      today,
      timezone,
      children,
      resolvedChildId,
      schoolYearAnchor: Number(today.slice(0, 4)),
    };
    const result = await analyzeIntakeImage({ supabase, intakeId, imageBuffer: buffer, ctx });

    const status = result.kind === "error" ? 502 : 200;
    return NextResponse.json(result, { status });
  } catch (err) {
    await reportServerError(err, { filePath: FILE, metadata: { step: "post" } });
    return NextResponse.json({ error: "Erro inesperado." }, { status: 500 });
  }
}
