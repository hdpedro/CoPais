/**
 * POST /api/health/vaccines-bulk  → bulk-insert vaccination_records.
 *
 * Native carteirinha screen (`kindar-native/app/saude/vacinas/carteirinha.tsx`)
 * batches vaccines parsed by AI into one call. Single source of truth: the
 * same group/child gates the PWA `parse-vaccines` insert path applies, plus
 * `administered_date NOT NULL` enforcement (DB constraint).
 */

import { NextResponse } from "next/server";
import { revalidateTag, revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveAuthenticatedUser } from "@/lib/api-auth";
import { captureServerEvent } from "@/lib/posthog-server";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

interface VaccineInput {
  vaccine_name?: unknown;
  dose_label?: unknown;
  administered_date?: unknown;
  batch_number?: unknown;
  location?: unknown;
  notes?: unknown;
}

export async function POST(request: Request) {
  const user = await resolveAuthenticatedUser(request);
  if (!user) {
    return NextResponse.json({ error: "Sessão expirada." }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const groupId = body.groupId as string | undefined;
  const childId = body.childId as string | undefined;
  const vaccinesRaw = body.vaccines;

  if (!groupId || !childId) {
    return NextResponse.json(
      { error: "groupId e childId obrigatórios." },
      { status: 400 },
    );
  }
  if (!Array.isArray(vaccinesRaw) || vaccinesRaw.length === 0) {
    return NextResponse.json(
      { error: "Lista de vacinas vazia." },
      { status: 400 },
    );
  }
  if (vaccinesRaw.length > 100) {
    return NextResponse.json(
      { error: "Limite de 100 vacinas por requisição." },
      { status: 400 },
    );
  }

  const admin = createAdminClient();

  // Group-membership gate
  const { data: membership } = await admin
    .from("group_members")
    .select("user_id")
    .eq("group_id", groupId)
    .eq("user_id", user.id)
    .single();
  if (!membership) {
    return NextResponse.json(
      { error: "Sem permissão para este grupo." },
      { status: 403 },
    );
  }

  // child-belongs-to-group gate
  const { data: child } = await admin
    .from("children")
    .select("id")
    .eq("id", childId)
    .eq("group_id", groupId)
    .single();
  if (!child) {
    return NextResponse.json(
      { error: "Criança não pertence a este grupo." },
      { status: 403 },
    );
  }

  // Validate + normalize each row. administered_date is NOT NULL in DB,
  // so reject rows missing it (preferable to a confusing 23502 error).
  const rows: Array<Record<string, unknown>> = [];
  for (const raw of vaccinesRaw as VaccineInput[]) {
    const name = String(raw.vaccine_name ?? "").trim();
    const date = String(raw.administered_date ?? "").trim();
    if (!name) {
      return NextResponse.json(
        { error: "Nome da vacina é obrigatório em todas as linhas." },
        { status: 400 },
      );
    }
    if (!date || !ISO_DATE.test(date)) {
      return NextResponse.json(
        { error: `Data inválida para "${name}" (use YYYY-MM-DD).` },
        { status: 400 },
      );
    }
    rows.push({
      group_id: groupId,
      child_id: childId,
      vaccine_name: name.slice(0, 200),
      dose_label: raw.dose_label
        ? String(raw.dose_label).trim().slice(0, 100) || null
        : null,
      administered_date: date,
      batch_number: raw.batch_number
        ? String(raw.batch_number).trim().slice(0, 100) || null
        : null,
      location: raw.location
        ? String(raw.location).trim().slice(0, 200) || null
        : null,
      notes: raw.notes
        ? String(raw.notes).trim().slice(0, 1000) || null
        : null,
      created_by: user.id,
    });
  }

  const { data: inserted, error } = await admin
    .from("vaccination_records")
    .insert(rows)
    .select("id");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  captureServerEvent(user.id, "vaccines_bulk_inserted", {
    count: rows.length,
    group_id: groupId,
  });

  revalidateTag(`health-${groupId}`, "max");
  revalidatePath("/saude");
  return NextResponse.json({
    success: true,
    inserted: inserted?.length ?? 0,
  });
}
