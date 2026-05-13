/**
 * PATCH /api/children/[childId] → edita criança.
 * DELETE /api/children/[childId] → remove criança.
 *
 * Dual-auth (Bearer + cookie). Usado pelo wizard de onboarding (PWA + native)
 * para edit/remove inline na tela "Resumo da família", e por qualquer outro
 * caller que precise mutar children de forma segura via API.
 *
 * Por que aqui em vez de chamar `actions/group.ts:updateChild`/deleteChild?
 * O fluxo do wizard é client-side fetch (precisa retornar JSON, não fazer
 * redirect como server actions fazem). Esse handler é o paralelo REST do
 * action, com a mesma verificação de membership e os mesmos `captureServerEvent`.
 *
 * Body PATCH (todos opcionais — só atualiza o que vier):
 *   { groupId, fullName?, birthDate?, sex?, allergies?, notes? }
 *
 * Body DELETE: { groupId }
 */
import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveAuthenticatedUser } from "@/lib/api-auth";
import { captureServerEvent } from "@/lib/posthog-server";

function isIsoDate(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

async function verifyChildBelongsToUserGroup(
  childId: string,
  groupId: string,
  userId: string,
) {
  const admin = createAdminClient();

  const [membership, child] = await Promise.all([
    admin
      .from("group_members")
      .select("role")
      .eq("group_id", groupId)
      .eq("user_id", userId)
      .maybeSingle(),
    admin
      .from("children")
      .select("id, group_id")
      .eq("id", childId)
      .maybeSingle(),
  ]);

  if (!membership.data) return { ok: false as const, status: 403, error: "Sem permissão para este grupo." };
  if (!child.data) return { ok: false as const, status: 404, error: "Criança não encontrada." };
  if (child.data.group_id !== groupId) {
    return { ok: false as const, status: 403, error: "Criança não pertence ao grupo informado." };
  }
  return { ok: true as const, admin };
}

interface PatchBody {
  groupId?: string;
  fullName?: string;
  birthDate?: string;
  sex?: "M" | "F" | null;
  allergies?: string[] | null;
  notes?: string | null;
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ childId: string }> },
) {
  const user = await resolveAuthenticatedUser(request);
  if (!user) return NextResponse.json({ error: "Sessão expirada." }, { status: 401 });

  const { childId } = await params;
  const body = (await request.json().catch(() => ({}))) as PatchBody;
  const groupId = body.groupId?.trim();
  if (!childId || !groupId) {
    return NextResponse.json({ error: "groupId e childId obrigatórios." }, { status: 400 });
  }

  const gate = await verifyChildBelongsToUserGroup(childId, groupId, user.id);
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

  const updates: Record<string, unknown> = {};
  if (typeof body.fullName === "string") {
    const v = body.fullName.trim();
    if (!v) return NextResponse.json({ error: "fullName não pode ser vazio." }, { status: 400 });
    updates.full_name = v;
  }
  if (typeof body.birthDate === "string") {
    if (!isIsoDate(body.birthDate)) {
      return NextResponse.json({ error: "birthDate deve estar em YYYY-MM-DD." }, { status: 400 });
    }
    if (new Date(`${body.birthDate}T12:00:00`) > new Date()) {
      return NextResponse.json({ error: "Data de nascimento não pode ser futura." }, { status: 400 });
    }
    updates.birth_date = body.birthDate;
  }
  if (body.sex !== undefined) {
    updates.sex = body.sex === "M" || body.sex === "F" ? body.sex : null;
  }
  if (body.allergies !== undefined) {
    const arr = Array.isArray(body.allergies)
      ? body.allergies.map((a) => String(a).trim()).filter(Boolean)
      : null;
    updates.allergies = arr && arr.length > 0 ? arr : null;
  }
  if (body.notes !== undefined) {
    updates.notes = body.notes?.trim() || null;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "Nada para atualizar." }, { status: 400 });
  }

  const { data: child, error } = await gate.admin
    .from("children")
    .update(updates)
    .eq("id", childId)
    .select("id, full_name, birth_date, sex, photo_url, notes, allergies, cpf, rg")
    .single();

  if (error || !child) {
    return NextResponse.json({ error: error?.message || "Falha ao atualizar." }, { status: 400 });
  }

  captureServerEvent(user.id, "child_updated", { via: "onboarding_wizard" });
  revalidateTag(`children-${groupId}`, "max");
  return NextResponse.json({ success: true, child });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ childId: string }> },
) {
  const user = await resolveAuthenticatedUser(request);
  if (!user) return NextResponse.json({ error: "Sessão expirada." }, { status: 401 });

  const { childId } = await params;
  // DELETE accepts groupId via query OR body — fetch() bodies on DELETE are
  // not universally supported, so query is the safer default for the wizard.
  const url = new URL(request.url);
  const groupId = url.searchParams.get("groupId") || (
    await request.json().catch(() => ({} as { groupId?: string }))
  ).groupId;

  if (!childId || !groupId) {
    return NextResponse.json({ error: "groupId e childId obrigatórios." }, { status: 400 });
  }

  const gate = await verifyChildBelongsToUserGroup(childId, groupId, user.id);
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

  const { error } = await gate.admin.from("children").delete().eq("id", childId);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  captureServerEvent(user.id, "child_deleted", { via: "onboarding_wizard" });
  revalidateTag(`children-${groupId}`, "max");
  return NextResponse.json({ success: true });
}
