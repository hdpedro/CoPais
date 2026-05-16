/**
 * PATCH /api/children/[childId] → edita criança.
 * DELETE /api/children/[childId] → remove criança.
 *
 * Wrappers finos sobre `services/children.ts:updateChild` / `deleteChild`.
 * Cada handler apenas:
 *   - resolve auth (Bearer/cookie)
 *   - parse parâmetros (params + body/query)
 *   - adapta retorno pra NextResponse
 *
 * Lógica de negócio (mapeamento PG, reportServerError, captureServerEvent,
 * FK humanization 23503) vive **somente** no service. Wizard de onboarding
 * (PWA + Native) consome este endpoint via fetch para edit/remove inline
 * na tela "Resumo da família".
 *
 * Body PATCH:
 *   { groupId, fullName?, birthDate?, sex?, allergies?, notes?, cpf?, rg? }
 *
 * Body/query DELETE: { groupId } ou ?groupId=
 */
import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveAuthenticatedUser } from "@/lib/api-auth";
import { reportServerError } from "@/lib/error-tracking/report-server";
import { deleteChild, updateChild } from "@/lib/services/children";

interface PatchBody {
  groupId?: string;
  fullName?: string;
  birthDate?: string;
  sex?: "M" | "F" | null;
  allergies?: string[] | null;
  notes?: string | null;
  cpf?: string | null;
  rg?: string | null;
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ childId: string }> },
) {
  let user: Awaited<ReturnType<typeof resolveAuthenticatedUser>> | null = null;
  let childId: string | undefined;
  let groupId: string | undefined;

  try {
    user = await resolveAuthenticatedUser(request);
    if (!user) return NextResponse.json({ error: "Sessão expirada." }, { status: 401 });

    childId = (await params).childId;
    const body = (await request.json().catch(() => ({}))) as PatchBody;
    groupId = body.groupId?.trim();

    const result = await updateChild(
      createAdminClient(),
      {
        childId: childId || "",
        groupId: groupId || "",
        patch: {
          fullName: body.fullName,
          birthDate: body.birthDate,
          sex: body.sex,
          allergies: body.allergies,
          notes: body.notes,
          cpf: body.cpf,
          rg: body.rg,
        },
      },
      {
        actorId: user.id,
        callerPath: "src/app/api/children/[childId]/route.ts:PATCH",
        enforceMembership: true,
        via: "onboarding_wizard",
      },
    );

    if (!result.ok) {
      return NextResponse.json(
        { error: result.error, code: result.errorCode, pgCode: result.pgCode },
        { status: result.status },
      );
    }

    revalidateTag(`children-${groupId}`, "max");
    return NextResponse.json({ success: true, child: result.data });
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : "Erro inesperado.";
    void reportServerError(caught, {
      filePath: "src/app/api/children/[childId]/route.ts",
      severity: "critical",
      userId: user?.id,
      metadata: { childId, groupId, phase: "unhandled_exception_patch" },
    });
    return NextResponse.json(
      { error: `Erro ao atualizar criança: ${message}` },
      { status: 500 },
    );
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ childId: string }> },
) {
  let user: Awaited<ReturnType<typeof resolveAuthenticatedUser>> | null = null;
  let childId: string | undefined;
  let groupId: string | undefined;

  try {
    user = await resolveAuthenticatedUser(request);
    if (!user) return NextResponse.json({ error: "Sessão expirada." }, { status: 401 });

    childId = (await params).childId;
    const url = new URL(request.url);
    groupId = url.searchParams.get("groupId") || (
      await request.json().catch(() => ({} as { groupId?: string }))
    ).groupId;

    const result = await deleteChild(
      createAdminClient(),
      {
        childId: childId || "",
        groupId: groupId || "",
      },
      {
        actorId: user.id,
        callerPath: "src/app/api/children/[childId]/route.ts:DELETE",
        enforceMembership: true,
        via: "onboarding_wizard",
      },
    );

    if (!result.ok) {
      return NextResponse.json(
        { error: result.error, code: result.errorCode, pgCode: result.pgCode },
        { status: result.status },
      );
    }

    revalidateTag(`children-${groupId}`, "max");
    return NextResponse.json({ success: true });
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : "Erro inesperado.";
    void reportServerError(caught, {
      filePath: "src/app/api/children/[childId]/route.ts",
      severity: "critical",
      userId: user?.id,
      metadata: { childId, groupId, phase: "unhandled_exception_delete" },
    });
    return NextResponse.json(
      { error: `Erro ao remover criança: ${message}` },
      { status: 500 },
    );
  }
}
