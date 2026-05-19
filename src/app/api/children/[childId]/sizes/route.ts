/**
 * GET /api/children/{childId}/sizes — lista tamanhos atuais + histórico
 * POST /api/children/{childId}/sizes — registra novo tamanho
 *
 * Wrapper fino sobre services/child-sizes.ts. Dual-auth (Bearer + cookie).
 * Foundation Collab #7 (migration 00086).
 */
import { NextResponse } from "next/server";
import { resolveAuthenticatedUser } from "@/lib/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  recordSize,
  getCurrentSizes,
  getSizeHistory,
  isSizeKind,
} from "@/lib/services/child-sizes";

interface CreateSizeBody {
  groupId?: string;
  kind?: string;
  customLabel?: string | null;
  sizeValue?: string;
  recordedOn?: string | null;
  notes?: string | null;
  isConfirmation?: boolean;
}

export async function GET(
  request: Request,
  context: { params: Promise<{ childId: string }> },
) {
  const user = await resolveAuthenticatedUser(request);
  if (!user) {
    return NextResponse.json({ error: "Sessão expirada." }, { status: 401 });
  }
  const { childId } = await context.params;
  if (!childId) {
    return NextResponse.json({ error: "childId obrigatório." }, { status: 400 });
  }

  const admin = createAdminClient();
  // Membership: criança existe num grupo onde o user é member?
  const { data: child } = await admin
    .from("children")
    .select("id, group_id")
    .eq("id", childId)
    .single();
  if (!child) {
    return NextResponse.json({ error: "Criança não encontrada." }, { status: 404 });
  }
  const { data: membership } = await admin
    .from("group_members")
    .select("user_id")
    .eq("group_id", child.group_id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!membership) {
    return NextResponse.json({ error: "Sem permissão." }, { status: 403 });
  }

  const [currentSizes, history] = await Promise.all([
    getCurrentSizes(admin, childId),
    getSizeHistory(admin, childId, { limit: 200 }),
  ]);
  return NextResponse.json({ currentSizes, history });
}

export async function POST(
  request: Request,
  context: { params: Promise<{ childId: string }> },
) {
  const user = await resolveAuthenticatedUser(request);
  if (!user) {
    return NextResponse.json({ error: "Sessão expirada." }, { status: 401 });
  }
  const { childId } = await context.params;
  if (!childId) {
    return NextResponse.json({ error: "childId obrigatório." }, { status: 400 });
  }

  let body: CreateSizeBody = {};
  try {
    body = (await request.json()) as CreateSizeBody;
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }
  if (!body.kind || !isSizeKind(body.kind)) {
    return NextResponse.json({ error: "kind inválido." }, { status: 400 });
  }
  if (!body.groupId) {
    return NextResponse.json({ error: "groupId obrigatório." }, { status: 400 });
  }
  if (!body.sizeValue) {
    return NextResponse.json({ error: "sizeValue obrigatório." }, { status: 400 });
  }

  const admin = createAdminClient();
  const result = await recordSize(admin, {
    groupId: body.groupId,
    childId,
    kind: body.kind,
    customLabel: body.customLabel ?? null,
    sizeValue: body.sizeValue,
    recordedOn: body.recordedOn ?? null,
    notes: body.notes ?? null,
    isConfirmation: body.isConfirmation ?? false,
    createdBy: user.id,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json({ success: true, id: result.data.id });
}
