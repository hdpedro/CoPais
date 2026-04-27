/**
 * POST   /api/health/medication-doses → log a dose taken
 * DELETE /api/health/medication-doses?id=…  → undo a dose record
 *
 * Native-callable wrapper that mirrors the dose-interval validation in
 * `src/actions/health.ts:logMedicationDose`. The native client previously
 * inserted directly into `medication_doses`, bypassing both the
 * group-membership gate (RLS-only) and the soft "menos que metade do
 * intervalo" warning the PWA shows. This route consolidates both paths.
 *
 * Body (POST):
 *   { medicationId: string }
 *
 * Response (POST):
 *   { success: true, warning?: string }   // warning when last dose < half interval
 */
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveAuthenticatedUser } from "@/lib/api-auth";
import { captureServerEvent } from "@/lib/posthog-server";

export async function POST(request: Request) {
  const user = await resolveAuthenticatedUser(request);
  if (!user) {
    return NextResponse.json({ error: "Sessão expirada." }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const medicationId = body.medicationId as string | undefined;
  if (!medicationId) {
    return NextResponse.json(
      { error: "medicationId obrigatório." },
      { status: 400 },
    );
  }

  const admin = createAdminClient();

  // Medication must exist + belong to a child in a group the user is in.
  const { data: medication } = await admin
    .from("active_medications")
    .select("id, group_id, child_id, frequency_hours")
    .eq("id", medicationId)
    .single();

  if (!medication) {
    return NextResponse.json(
      { error: "Medicamento não encontrado." },
      { status: 404 },
    );
  }

  const { data: membership } = await admin
    .from("group_members")
    .select("user_id")
    .eq("group_id", medication.group_id)
    .eq("user_id", user.id)
    .single();
  if (!membership) {
    return NextResponse.json(
      { error: "Sem permissão para este grupo." },
      { status: 403 },
    );
  }

  // Belt-and-suspenders: ensure the medication's child is still in the group.
  const { data: child } = await admin
    .from("children")
    .select("id")
    .eq("id", medication.child_id)
    .eq("group_id", medication.group_id)
    .single();
  if (!child) {
    return NextResponse.json(
      { error: "Criança não pertence a este grupo." },
      { status: 403 },
    );
  }

  // Dose-interval validation (mirrors logMedicationDose).
  const { data: lastDoseArr } = await admin
    .from("medication_doses")
    .select("administered_at")
    .eq("medication_id", medicationId)
    .order("administered_at", { ascending: false })
    .limit(1);

  let warning: string | undefined;
  if (lastDoseArr && lastDoseArr.length > 0) {
    const lastTime = new Date(lastDoseArr[0].administered_at).getTime();
    const minutesSince = (Date.now() - lastTime) / (1000 * 60);
    if (minutesSince < 30) {
      return NextResponse.json(
        {
          error:
            "Dose recusada: última dose foi há menos de 30 minutos.",
        },
        { status: 400 },
      );
    }
    const freqHours = medication.frequency_hours;
    const halfMin = freqHours ? (freqHours * 60) / 2 : 0;
    if (freqHours && halfMin > 0 && minutesSince < halfMin) {
      warning = "Dose confirmada (intervalo menor que o recomendado)";
    }
  }

  const { error } = await admin.from("medication_doses").insert({
    medication_id: medicationId,
    administered_at: new Date().toISOString(),
    administered_by: user.id,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  captureServerEvent(user.id, "medication_dose_logged", { medicationId });

  return NextResponse.json(
    warning ? { success: true, warning } : { success: true },
  );
}

export async function DELETE(request: Request) {
  const user = await resolveAuthenticatedUser(request);
  if (!user) {
    return NextResponse.json({ error: "Sessão expirada." }, { status: 401 });
  }

  const url = new URL(request.url);
  const doseId = url.searchParams.get("id");
  if (!doseId) {
    return NextResponse.json({ error: "id obrigatório." }, { status: 400 });
  }

  const admin = createAdminClient();

  // Resolve the dose → medication → group, then verify membership.
  const { data: dose } = await admin
    .from("medication_doses")
    .select("id, medication_id")
    .eq("id", doseId)
    .single();
  if (!dose) {
    return NextResponse.json(
      { error: "Dose não encontrada." },
      { status: 404 },
    );
  }

  const { data: medication } = await admin
    .from("active_medications")
    .select("group_id")
    .eq("id", dose.medication_id)
    .single();
  if (!medication) {
    return NextResponse.json(
      { error: "Medicamento não encontrado." },
      { status: 404 },
    );
  }

  const { data: membership } = await admin
    .from("group_members")
    .select("user_id")
    .eq("group_id", medication.group_id)
    .eq("user_id", user.id)
    .single();
  if (!membership) {
    return NextResponse.json(
      { error: "Sem permissão para este grupo." },
      { status: 403 },
    );
  }

  const { error } = await admin
    .from("medication_doses")
    .delete()
    .eq("id", doseId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  captureServerEvent(user.id, "medication_dose_undone", { doseId });
  return NextResponse.json({ success: true });
}
