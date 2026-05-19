/**
 * PATCH /api/children/{childId}/sizes/{sizeId} — edita registro
 * DELETE /api/children/{childId}/sizes/{sizeId} — remove registro
 *
 * Foundation Collab #7 (migration 00086).
 */
import { NextResponse } from "next/server";
import { resolveAuthenticatedUser } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { updateSize, deleteSize } from "@/lib/services/child-sizes";

interface PatchBody {
  sizeValue?: string;
  recordedOn?: string;
  notes?: string | null;
  customLabel?: string | null;
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ childId: string; sizeId: string }> },
) {
  const user = await resolveAuthenticatedUser(request);
  if (!user) {
    return NextResponse.json({ error: "Sessão expirada." }, { status: 401 });
  }
  const { sizeId } = await context.params;
  if (!sizeId) {
    return NextResponse.json({ error: "sizeId obrigatório." }, { status: 400 });
  }

  let body: PatchBody = {};
  try {
    body = (await request.json()) as PatchBody;
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  const admin = createAdminClient();
  const result = await updateSize(admin, {
    sizeId,
    actorId: user.id,
    patch: {
      sizeValue: body.sizeValue,
      recordedOn: body.recordedOn,
      notes: body.notes,
      customLabel: body.customLabel,
    },
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json({ success: true, id: result.data.id });
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ childId: string; sizeId: string }> },
) {
  const user = await resolveAuthenticatedUser(request);
  if (!user) {
    return NextResponse.json({ error: "Sessão expirada." }, { status: 401 });
  }
  const { sizeId } = await context.params;
  if (!sizeId) {
    return NextResponse.json({ error: "sizeId obrigatório." }, { status: 400 });
  }

  const admin = createAdminClient();
  const result = await deleteSize(admin, { sizeId, actorId: user.id });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json({ success: true });
}
