/* ------------------------------------------------------------------ */
/* /api/ai/assistant/invite-extract — form-fill do Novo Evento (C3)     */
/*                                                                      */
/* GET  → { enabled } — o form (PWA + native) decide mostrar o botão    */
/*        "Preencher com convite". Flag própria (OFF) + beta por grupo. */
/* POST → FormData { file } → extração PURA (sem intake, sem storage,   */
/*        sem side-effects): { found:true, plan } | { found:false }.    */
/*        O form É a prévia — o usuário revisa e materializa ao salvar  */
/*        (espelho por construção; nada de confirm/undo aqui).          */
/* ------------------------------------------------------------------ */

import { NextResponse, type NextRequest } from "next/server";
import { resolveAuthenticatedUser } from "@/lib/api-auth";
import { createClient } from "@/lib/supabase/server";
import { getActiveGroup } from "@/lib/group-utils";
import { reportServerError } from "@/lib/error-tracking/report-server";
import { isBrainEnabledForGroup, isEventInviteEnabled } from "@/lib/services/brain-flag";
import { validateImageUpload } from "@/lib/ai/brain/upload-guard";
import { extractInvitePlanFromImage } from "@/lib/services/brain";
import type { BrainChild } from "@/lib/ai/brain/types";

const FILE = "src/app/api/ai/assistant/invite-extract/route.ts";

const NOT_FOUND = { found: false } as const;

/** O botão só aparece quando o recurso está DE FATO disponível pro grupo. */
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    if (!isEventInviteEnabled()) return NextResponse.json({ enabled: false }, { status: 200 });
    const auth = await resolveAuthenticatedUser(request);
    if (!auth) return NextResponse.json({ enabled: false }, { status: 200 });
    const supabase = await createClient();
    const group = await getActiveGroup(supabase, auth.id);
    if (!group) return NextResponse.json({ enabled: false }, { status: 200 });
    const enabled = await isBrainEnabledForGroup(supabase, group.groupId);
    return NextResponse.json({ enabled }, { status: 200 });
  } catch {
    return NextResponse.json({ enabled: false }, { status: 200 });
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    if (!isEventInviteEnabled()) return NextResponse.json(NOT_FOUND, { status: 200 });

    const auth = await resolveAuthenticatedUser(request);
    if (!auth) return NextResponse.json(NOT_FOUND, { status: 200 });

    const supabase = await createClient();
    const group = await getActiveGroup(supabase, auth.id);
    if (!group) return NextResponse.json(NOT_FOUND, { status: 200 });
    if (!(await isBrainEnabledForGroup(supabase, group.groupId))) {
      return NextResponse.json(NOT_FOUND, { status: 200 });
    }

    const form = (await request.formData()) as unknown as globalThis.FormData;
    const file = form.get("file") as File | null;
    if (!file) return NextResponse.json(NOT_FOUND, { status: 200 });

    const buffer = Buffer.from(await file.arrayBuffer());
    const guard = validateImageUpload(buffer);
    if (!guard.ok || !guard.type) return NextResponse.json(NOT_FOUND, { status: 200 });

    const { data: childRows } = await supabase
      .from("children")
      .select("id, full_name, birth_date")
      .eq("group_id", group.groupId);
    const children: BrainChild[] = (childRows ?? []).map((c) => ({
      id: c.id as string,
      name: (c.full_name as string) ?? "",
      birthDate: (c.birth_date as string | null) ?? undefined,
    }));

    const plan = await extractInvitePlanFromImage({
      supabase,
      groupId: group.groupId,
      userId: auth.id,
      buffer,
      children,
    });
    if (!plan) return NextResponse.json(NOT_FOUND, { status: 200 });
    return NextResponse.json({ found: true, plan }, { status: 200 });
  } catch (err) {
    await reportServerError(err, { filePath: FILE, metadata: { step: "invite_extract" } });
    return NextResponse.json(NOT_FOUND, { status: 200 });
  }
}
