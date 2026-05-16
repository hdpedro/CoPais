/**
 * POST /api/children → adiciona criança ao grupo ativo (dual auth).
 *
 * Wrapper fino sobre `services/children.ts:createChild`. Apenas:
 *   - resolve auth (Bearer/cookie)
 *   - parse JSON body
 *   - adapta retorno pra NextResponse
 *
 * Lógica de negócio (validações, mapeamento PG → mensagem humana,
 * reportServerError, captureServerEvent) vive **somente** no service.
 *
 * Por que aqui em vez de chamar `actions/group.ts:addChild`?
 * O wizard de onboarding (PWA + Native) é client-side fetch: precisa
 * retornar JSON em vez de redirect. Server actions sempre redirecionam,
 * então não dão pra reusar via fetch.
 *
 * Body:
 *   {
 *     groupId: string,
 *     fullName: string,
 *     birthDate: string,      // YYYY-MM-DD
 *     sex?: 'M' | 'F' | null,
 *     allergies?: string[] | null,
 *     notes?: string | null,
 *   }
 *
 * Retorna: { success: true, child: ChildRow } | { error: string, code?: string }
 */
import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveAuthenticatedUser } from "@/lib/api-auth";
import { reportServerError } from "@/lib/error-tracking/report-server";
import { createChild } from "@/lib/services/children";

interface AddChildBody {
  groupId?: string;
  fullName?: string;
  birthDate?: string;
  sex?: "M" | "F" | null;
  allergies?: string[] | null;
  notes?: string | null;
}

export async function POST(request: Request) {
  // Try/catch global — qualquer exception vira JSON {error} em vez de
  // HTML do Next, que o Native parseava como `{}` (bug Luísa 2026-05-15).
  let user: Awaited<ReturnType<typeof resolveAuthenticatedUser>> | null = null;
  let groupId: string | undefined;

  try {
    user = await resolveAuthenticatedUser(request);
    if (!user) {
      return NextResponse.json({ error: "Sessão expirada." }, { status: 401 });
    }

    const body = (await request.json().catch(() => ({}))) as AddChildBody;
    groupId = body.groupId?.trim();

    const result = await createChild(
      createAdminClient(),
      {
        groupId: groupId || "",
        fullName: body.fullName?.trim() || "",
        birthDate: body.birthDate?.trim() || "",
        sex: body.sex,
        allergies: body.allergies,
        notes: body.notes,
      },
      {
        actorId: user.id,
        callerPath: "src/app/api/children/route.ts",
        // Admin client bypassa RLS — service faz membership check.
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
      filePath: "src/app/api/children/route.ts",
      severity: "critical",
      userId: user?.id,
      metadata: { groupId, phase: "unhandled_exception_post" },
    });
    return NextResponse.json(
      { error: `Erro ao criar criança: ${message}` },
      { status: 500 },
    );
  }
}
