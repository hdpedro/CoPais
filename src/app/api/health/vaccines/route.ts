/**
 * /api/health/vaccines — REST endpoints pro native consumir o motor vacinal.
 *
 *  GET    ?childId=<uuid>             → status calmo + timeline + pendências
 *  POST   { action: 'record', ... }    → recordVaccination
 *  POST   { action: 'mark', ... }      → markRecommendedDoseTaken (atalho UI)
 *  POST   { action: 'dismiss', ... }   → snooze
 *  PATCH  { childId, preference }      → setVaccinationCalendarPreference
 *  GET    ?match=<name>               → fuzzy match contra catálogo (autocomplete)
 *
 * Bearer auth via `resolveAuthenticatedUser`. Service `vaccines.ts` aplica
 * `is_group_member` natural via RLS quando passamos o supabase do user;
 * pra escrever em campos derivados (notificação), usamos admin localmente.
 *
 * Native (`kindar-native/app/_src/services/health.ts`) chama estes endpoints
 * no path online; offline-first via `safeWrite` continua funcionando.
 */

import { NextResponse } from "next/server";
import { revalidateTag, revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveAuthenticatedUser } from "@/lib/api-auth";
import { notifySaudeCreate } from "@/lib/services/health-collab";
import {
  getVaccineStatus,
  recordVaccination,
  markRecommendedDoseTaken,
  dismissPendingDose,
  setVaccinationCalendarPreference,
  inferCatalogMatch,
  updateVaccinationRecord,
  deleteVaccinationRecord,
} from "@/lib/services/vaccines";

/* ------------------------------------------------------------------ */
/* GET — status / match                                                */
/* ------------------------------------------------------------------ */

export async function GET(request: Request) {
  const user = await resolveAuthenticatedUser(request);
  if (!user) {
    return NextResponse.json({ error: "Sessão expirada." }, { status: 401 });
  }
  const url = new URL(request.url);
  const childId = url.searchParams.get("childId");
  const match = url.searchParams.get("match");

  // Bearer auth (Native) → cookieClient não tem session → RLS bloqueia tudo.
  // Usamos admin client + validamos membership manualmente via group_members.
  const supabase = createAdminClient();

  if (match) {
    const result = await inferCatalogMatch(supabase, match);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    return NextResponse.json({ matches: result.data });
  }

  if (!childId) {
    return NextResponse.json(
      { error: "childId obrigatório." },
      { status: 400 },
    );
  }

  // Valida membership ANTES da query — admin client skips RLS, então sem
  // este check qualquer user logado poderia ler vacinas de qualquer criança.
  const { data: child } = await supabase
    .from("children")
    .select("group_id")
    .eq("id", childId)
    .maybeSingle();
  if (!child) {
    return NextResponse.json({ error: "Criança não encontrada." }, { status: 404 });
  }
  const { data: member } = await supabase
    .from("group_members")
    .select("user_id")
    .eq("group_id", child.group_id as string)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!member) {
    return NextResponse.json({ error: "Sem permissão." }, { status: 403 });
  }

  // Passa user.id pro engine respeitar `vaccine_notification_dismissals`
  // ativos (snooze per-user). Sem isso, "Adiar 7d" ficava silencioso na UI.
  const result = await getVaccineStatus(supabase, childId, user.id);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json(result.data);
}

/* ------------------------------------------------------------------ */
/* POST — record / mark / dismiss                                      */
/* ------------------------------------------------------------------ */

interface PostBody {
  action?: "record" | "mark" | "dismiss";
  // record
  groupId?: string;
  childId?: string;
  vaccineName?: string;
  catalogId?: string | null;
  doseLabel?: string | null;
  doseNumber?: number | null;
  administeredDate?: string;
  batchNumber?: string | null;
  location?: string | null;
  notes?: string | null;
  source?: "manual" | "ocr" | "imported";
  confidenceScore?: number | null;
  forceDuplicate?: boolean;
  // mark
  doseRecommendationId?: string;
  // dismiss
  vaccineId?: string;
  reason?: "snoozed_7d" | "snoozed_30d" | "already_scheduled" | "medical_advice";
}

export async function POST(request: Request) {
  const user = await resolveAuthenticatedUser(request);
  if (!user) {
    return NextResponse.json({ error: "Sessão expirada." }, { status: 401 });
  }
  const body = (await request.json().catch(() => ({}))) as PostBody;
  // ADMIN client porque Bearer auth (Native) não tem cookie pra RLS server-side.
  // Service `vaccines.ts` valida membership manualmente via `actorUserId/userId`
  // (verifyChildMembership consulta `group_members.user_id`). Sem isso, queries
  // `.from('children').select(...)` retornavam 0 rows → "Criança não encontrada".
  const supabase = createAdminClient();

  if (body.action === "record") {
    if (!body.groupId || !body.childId || !body.vaccineName || !body.administeredDate) {
      return NextResponse.json(
        { error: "Dados incompletos." },
        { status: 400 },
      );
    }
    const result = await recordVaccination(supabase, {
      groupId: body.groupId,
      childId: body.childId,
      createdBy: user.id,
      vaccineName: body.vaccineName,
      catalogId: body.catalogId ?? null,
      doseLabel: body.doseLabel ?? null,
      doseNumber: body.doseNumber ?? null,
      administeredDate: body.administeredDate,
      batchNumber: body.batchNumber ?? null,
      location: body.location ?? null,
      notes: body.notes ?? null,
      source: body.source || "manual",
      confidenceScore: body.confidenceScore ?? null,
      forceDuplicate: !!body.forceDuplicate,
    });
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    // Push fan-out se inseriu (não duplicate-warning)
    if (result.data.id) {
      const admin = createAdminClient();
      const [profileRes, childRes] = await Promise.all([
        admin.from("profiles").select("full_name").eq("id", user.id).single(),
        admin.from("children").select("full_name").eq("id", body.childId).single(),
      ]);
      const actorFirstName = (profileRes.data?.full_name as string | undefined)?.split(" ")[0] || "Alguém";
      const childFirstName = (childRes.data?.full_name as string | undefined)?.split(" ")[0];
      notifySaudeCreate({
        recordType: "vaccination_record",
        recordId: result.data.id,
        groupId: body.groupId,
        actorUserId: user.id,
        actorFirstName,
        childFirstName,
        description: body.vaccineName,
      }).catch(() => {});
    }

    revalidateTag(`health-${body.groupId}`, "max");
    revalidatePath("/saude/vacinas");
    return NextResponse.json({ success: true, ...result.data });
  }

  if (body.action === "mark") {
    if (!body.doseRecommendationId || !body.administeredDate) {
      return NextResponse.json(
        { error: "Dados incompletos." },
        { status: 400 },
      );
    }
    const result = await markRecommendedDoseTaken(supabase, {
      doseRecommendationId: body.doseRecommendationId,
      createdBy: user.id,
      administeredDate: body.administeredDate,
      batchNumber: body.batchNumber ?? null,
      location: body.location ?? null,
      notes: body.notes ?? null,
    });
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    // Push fan-out
    if (result.data.id) {
      try {
        const admin = createAdminClient();
        const { data: rec } = await admin
          .from("vaccine_recommended_doses")
          .select("group_id, child_id, vaccine_catalog!inner(name)")
          .eq("id", body.doseRecommendationId)
          .single();
        if (rec) {
          const [profileRes, childRes] = await Promise.all([
            admin.from("profiles").select("full_name").eq("id", user.id).single(),
            admin.from("children").select("full_name").eq("id", rec.child_id as string).single(),
          ]);
          const actorFirstName = (profileRes.data?.full_name as string | undefined)?.split(" ")[0] || "Alguém";
          const childFirstName = (childRes.data?.full_name as string | undefined)?.split(" ")[0];
          const vaccineName = ((rec.vaccine_catalog as unknown) as { name: string }).name;
          notifySaudeCreate({
            recordType: "vaccination_record",
            recordId: result.data.id,
            groupId: rec.group_id as string,
            actorUserId: user.id,
            actorFirstName,
            childFirstName,
            description: vaccineName,
          }).catch(() => {});
        }
      } catch {
        // best-effort
      }
    }

    revalidatePath("/saude/vacinas");
    return NextResponse.json({ success: true, ...result.data });
  }

  if (body.action === "dismiss") {
    if (!body.childId || !body.vaccineId || body.doseNumber === undefined || !body.reason) {
      return NextResponse.json(
        { error: "Dados incompletos." },
        { status: 400 },
      );
    }
    const result = await dismissPendingDose(supabase, {
      userId: user.id,
      childId: body.childId,
      vaccineId: body.vaccineId,
      doseNumber: body.doseNumber!,
      reason: body.reason,
    });
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    revalidatePath("/saude/vacinas");
    return NextResponse.json({ success: true, ...result.data });
  }

  return NextResponse.json(
    { error: "action inválida (use 'record' | 'mark' | 'dismiss')." },
    { status: 400 },
  );
}

/* ------------------------------------------------------------------ */
/* PATCH — calendar preference                                         */
/* ------------------------------------------------------------------ */

interface PatchBody {
  childId?: string;
  preference?: "public" | "private" | "both";
}

export async function PATCH(request: Request) {
  const user = await resolveAuthenticatedUser(request);
  if (!user) {
    return NextResponse.json({ error: "Sessão expirada." }, { status: 401 });
  }
  const body = (await request.json().catch(() => ({}))) as PatchBody;
  if (!body.childId || !body.preference) {
    return NextResponse.json(
      { error: "childId e preference obrigatórios." },
      { status: 400 },
    );
  }
  const supabase = createAdminClient();
  const result = await setVaccinationCalendarPreference(supabase, {
    childId: body.childId,
    preference: body.preference,
    actorUserId: user.id,
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  revalidatePath("/saude/vacinas");
  return NextResponse.json({ success: true, ...result.data });
}

/* ------------------------------------------------------------------ */
/* PUT — editar vaccination_record                                     */
/* ------------------------------------------------------------------ */

interface PutBody {
  recordId?: string;
  vaccineName?: string;
  doseLabel?: string | null;
  administeredDate?: string;
  batchNumber?: string | null;
  location?: string | null;
  notes?: string | null;
  catalogId?: string | null;
  doseNumber?: number | null;
}

export async function PUT(request: Request) {
  const user = await resolveAuthenticatedUser(request);
  if (!user) return NextResponse.json({ error: "Sessão expirada." }, { status: 401 });
  const body = (await request.json().catch(() => ({}))) as PutBody;
  if (!body.recordId) {
    return NextResponse.json({ error: "recordId obrigatório." }, { status: 400 });
  }
  const supabase = createAdminClient();
  const result = await updateVaccinationRecord(supabase, {
    recordId: body.recordId,
    actorUserId: user.id,
    vaccineName: body.vaccineName,
    doseLabel: body.doseLabel,
    administeredDate: body.administeredDate,
    batchNumber: body.batchNumber,
    location: body.location,
    notes: body.notes,
    catalogId: body.catalogId,
    doseNumber: body.doseNumber,
  });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  revalidatePath("/saude/vacinas");
  return NextResponse.json({ success: true, ...result.data });
}

/* ------------------------------------------------------------------ */
/* DELETE — excluir vaccination_record (reabre pendência via trigger)  */
/* ------------------------------------------------------------------ */

export async function DELETE(request: Request) {
  const user = await resolveAuthenticatedUser(request);
  if (!user) return NextResponse.json({ error: "Sessão expirada." }, { status: 401 });
  const url = new URL(request.url);
  const recordId = url.searchParams.get("recordId");
  if (!recordId) {
    return NextResponse.json({ error: "recordId obrigatório." }, { status: 400 });
  }
  const supabase = createAdminClient();
  const result = await deleteVaccinationRecord(supabase, {
    recordId,
    actorUserId: user.id,
  });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  revalidatePath("/saude/vacinas");
  return NextResponse.json({ success: true, ...result.data });
}
