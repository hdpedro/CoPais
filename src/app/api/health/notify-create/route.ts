/**
 * POST /api/health/notify-create
 *
 * Helper compacto pro nativo emitir notificação Saúde Foundation após
 * criar localmente um registro via safeWrite. O nativo continua escrevendo
 * direto no Supabase (offline-first), mas chama este endpoint quando volta
 * a ter conectividade pra disparar:
 *   - In-app notification rows pra coparentes
 *   - Push com coalescing 60s + priority-aware
 *   - Telemetria notification_sent / urgent_created
 *
 * Validações server-side:
 *   - User autenticado
 *   - User pertence ao group_id do record
 *   - record_id realmente existe na tabela apontada por record_type
 *
 * Falha silenciosa por design — notificação é best-effort. Resposta sempre
 * 200 (com success boolean) pra que o nativo não fique tentando re-emitir
 * em loop quando o record não pôde ser encontrado.
 */

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveAuthenticatedUser } from "@/lib/api-auth";
import { notifySaudeCreate } from "@/lib/services/health-collab";

const VALID_RECORD_TYPES = [
  "medical_appointment",
  "illness_episode",
  "active_medication",
  "child_allergy",
  "vaccination_record",
] as const;

type SaudeRecordType = (typeof VALID_RECORD_TYPES)[number];

function tableFor(rt: SaudeRecordType): string {
  switch (rt) {
    case "medical_appointment":
      return "medical_appointments";
    case "illness_episode":
      return "illness_episodes";
    case "active_medication":
      return "active_medications";
    case "child_allergy":
      return "child_allergies";
    case "vaccination_record":
      return "vaccination_records";
  }
}

interface NotifyBody {
  recordType?: string;
  recordId?: string;
  description?: string;
}

export async function POST(request: Request) {
  const user = await resolveAuthenticatedUser(request);
  if (!user) {
    return NextResponse.json({ success: false, error: "Sessão expirada." }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as NotifyBody;
  const recordType = body.recordType as SaudeRecordType | undefined;
  const recordId = (body.recordId || "").trim();
  const description = (body.description || "").trim().slice(0, 200);

  if (!recordType || !VALID_RECORD_TYPES.includes(recordType) || !recordId || !description) {
    return NextResponse.json(
      { success: false, error: "Dados incompletos." },
      { status: 400 },
    );
  }

  const admin = createAdminClient();
  // Resolve group_id + child_id + created_by da row pra validar
  // membership e compor o push. Single source of truth: a tabela do record.
  const table = tableFor(recordType);
  const { data: row } = await admin
    .from(table)
    .select("group_id, child_id, created_by")
    .eq("id", recordId)
    .single();

  if (!row) {
    // Record não encontrado — devolve 200 success:false pro nativo não
    // ficar retentando. Pode ter sido deletado, ou id inválido.
    return NextResponse.json({ success: false, error: "Registro não encontrado." });
  }

  // Verifica que o user é membro do group e que ELE criou o record.
  // Não permitimos notificar em nome de outro user.
  if (row.created_by !== user.id) {
    return NextResponse.json(
      { success: false, error: "Permissão negada." },
      { status: 403 },
    );
  }
  const { data: membership } = await admin
    .from("group_members")
    .select("user_id")
    .eq("group_id", row.group_id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!membership) {
    return NextResponse.json(
      { success: false, error: "Sem permissão para este grupo." },
      { status: 403 },
    );
  }

  // Resolve nomes em paralelo.
  const [profileRes, childRes] = await Promise.all([
    admin.from("profiles").select("full_name").eq("id", user.id).single(),
    row.child_id
      ? admin.from("children").select("full_name").eq("id", row.child_id).single()
      : Promise.resolve({ data: null }),
  ]);
  const actorFirstName = (profileRes.data?.full_name as string | undefined)?.split(" ")[0] || "Alguém";
  const childFirstName = (childRes.data?.full_name as string | undefined)?.split(" ")[0];

  await notifySaudeCreate({
    recordType,
    recordId,
    groupId: row.group_id as string,
    actorUserId: user.id,
    actorFirstName,
    childFirstName,
    description,
  });

  return NextResponse.json({ success: true });
}
