/**
 * POST /api/children → adiciona criança ao grupo ativo (dual auth).
 *
 * Usado pelo wizard de onboarding (PWA + nativo) quando o usuário escolhe
 * "Adicionar outra criança" depois da primeira. A primeira criança continua
 * sendo criada via `/api/create-group` junto com o grupo. A partir da
 * segunda, o caller chama este endpoint.
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
 * Retorna: { success: true, child: Child } | { error: string }
 *
 * Schema: `children.sex` é CHECK ('M','F') (migration 00036). Native e PWA
 * compartilham este endpoint para evitar a divergência clássica
 * documentada em `.claude/CLAUDE.md` (regra de paridade).
 */
import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveAuthenticatedUser } from "@/lib/api-auth";
import { captureServerEvent } from "@/lib/posthog-server";

interface AddChildBody {
  groupId?: string;
  fullName?: string;
  birthDate?: string;
  sex?: "M" | "F" | null;
  allergies?: string[] | null;
  notes?: string | null;
}

function isIsoDate(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export async function POST(request: Request) {
  const user = await resolveAuthenticatedUser(request);
  if (!user) {
    return NextResponse.json({ error: "Sessão expirada." }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as AddChildBody;
  const groupId = body.groupId?.trim();
  const fullName = body.fullName?.trim();
  const birthDate = body.birthDate?.trim();

  if (!groupId || !fullName || !birthDate) {
    return NextResponse.json(
      { error: "groupId, fullName e birthDate são obrigatórios." },
      { status: 400 },
    );
  }
  if (!isIsoDate(birthDate)) {
    return NextResponse.json(
      { error: "birthDate deve estar em formato YYYY-MM-DD." },
      { status: 400 },
    );
  }
  if (new Date(`${birthDate}T12:00:00`) > new Date()) {
    return NextResponse.json(
      { error: "Data de nascimento não pode ser futura." },
      { status: 400 },
    );
  }

  const sex = body.sex === "M" || body.sex === "F" ? body.sex : null;
  const allergies =
    Array.isArray(body.allergies) && body.allergies.length > 0
      ? body.allergies.map((a) => String(a).trim()).filter(Boolean)
      : null;
  const notes = body.notes?.trim() || null;

  const admin = createAdminClient();

  // Verifica membership ANTES de escrever — admin client passa RLS, então a
  // checagem manual é obrigatória.
  const { data: membership } = await admin
    .from("group_members")
    .select("role")
    .eq("group_id", groupId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!membership) {
    return NextResponse.json(
      { error: "Sem permissão para este grupo." },
      { status: 403 },
    );
  }

  const { data: child, error } = await admin
    .from("children")
    .insert({
      group_id: groupId,
      full_name: fullName,
      birth_date: birthDate,
      sex,
      allergies: allergies && allergies.length > 0 ? allergies : null,
      notes,
    })
    .select("id, full_name, birth_date, sex, photo_url, notes, allergies, cpf, rg")
    .single();

  if (error || !child) {
    return NextResponse.json(
      { error: error?.message || "Falha ao criar criança." },
      { status: 400 },
    );
  }

  captureServerEvent(user.id, "child_added", { via: "onboarding_wizard" });
  revalidateTag(`children-${groupId}`, "max");

  return NextResponse.json({ success: true, child });
}
