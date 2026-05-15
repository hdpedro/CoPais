"use server";

import { redirect } from "next/navigation";
import { revalidatePath, revalidateTag } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { notifySaudeCreate } from "@/lib/services/health-collab";
import {
  recordVaccination as recordVaccinationService,
  markRecommendedDoseTaken as markRecommendedDoseTakenService,
  dismissPendingDose as dismissPendingDoseService,
  setVaccinationCalendarPreference as setVaccinationCalendarPreferenceService,
  type CalendarPreference,
} from "@/lib/services/vaccines";

/* ------------------------------------------------------------------ */
/* registerVaccination — form do registro manual                       */
/* ------------------------------------------------------------------ */

export async function registerVaccination(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const groupId = formData.get("groupId") as string;
  const childId = formData.get("childId") as string;
  const vaccineName = ((formData.get("vaccineName") as string) || "").trim();
  const catalogId = (formData.get("catalogId") as string) || null;
  const doseLabel = (formData.get("doseLabel") as string) || null;
  const doseNumberRaw = formData.get("doseNumber") as string | null;
  const doseNumber = doseNumberRaw ? Number(doseNumberRaw) : null;
  const administeredDate = formData.get("administeredDate") as string;
  const batchNumber = (formData.get("batchNumber") as string) || null;
  const location = (formData.get("location") as string) || null;
  const notes = (formData.get("notes") as string) || null;
  const forceDuplicate = formData.get("forceDuplicate") === "1";

  const result = await recordVaccinationService(supabase, {
    groupId,
    childId,
    createdBy: user.id,
    vaccineName,
    catalogId,
    doseLabel,
    doseNumber,
    administeredDate,
    batchNumber,
    location,
    notes,
    source: "manual",
    forceDuplicate,
  });

  if (!result.ok) {
    redirect("/saude/vacinas?error=" + encodeURIComponent(result.error));
  }

  // Duplicate sem force → manda de volta pro form com todos os campos populados
  // e a flag `duplicate=1`. O form mostra modal de confirmação + botão
  // "Registrar mesmo assim" que reenvia com forceDuplicate=1.
  if (result.data.warning === "duplicate_dose") {
    const params = new URLSearchParams({
      duplicate: "1",
      crianca: childId,
      vaccineName,
      catalogId: catalogId || "",
      doseLabel: doseLabel || "",
      doseNumber: String(result.data.doseNumber ?? ""),
      administeredDate,
      batchNumber: batchNumber || "",
      location: location || "",
      notes: notes || "",
    });
    redirect("/saude/vacinas/nova?" + params.toString());
  }

  // Insert OK → push pra coparentes
  if (result.data.id) {
    const admin = createAdminClient();
    const [profileRes, childRes] = await Promise.all([
      admin.from("profiles").select("full_name").eq("id", user.id).single(),
      admin.from("children").select("full_name").eq("id", childId).single(),
    ]);
    const actorFirstName = (profileRes.data?.full_name as string | undefined)?.split(" ")[0] || "Alguém";
    const childFirstName = (childRes.data?.full_name as string | undefined)?.split(" ")[0];
    notifySaudeCreate({
      recordType: "vaccination_record",
      recordId: result.data.id,
      groupId,
      actorUserId: user.id,
      actorFirstName,
      childFirstName,
      description: vaccineName,
    }).catch(() => {});
  }

  revalidateTag(`health-${groupId}`, "max");
  revalidatePath("/saude");
  revalidatePath("/saude/vacinas");
  // Redireciona com flag `postVaccine=<id>` → tela mostra modal opcional
  // de "lembrete de 48h pós-vacina". Tom calmo, sem juízo clínico.
  if (result.data.id) {
    redirect(`/saude/vacinas?crianca=${childId}&postVaccine=${result.data.id}`);
  }
  redirect("/saude/vacinas?crianca=" + childId);
}

/* ------------------------------------------------------------------ */
/* markDoseTaken — CTA "Marcar como tomada" das pendências             */
/* ------------------------------------------------------------------ */

export async function markDoseTaken(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const doseRecommendationId = formData.get("doseRecommendationId") as string;
  const administeredDate = formData.get("administeredDate") as string;
  const batchNumber = (formData.get("batchNumber") as string) || null;
  const location = (formData.get("location") as string) || null;
  const notes = (formData.get("notes") as string) || null;

  const result = await markRecommendedDoseTakenService(supabase, {
    doseRecommendationId,
    createdBy: user.id,
    administeredDate,
    batchNumber,
    location,
    notes,
  });

  if (!result.ok) {
    redirect("/saude/vacinas?error=" + encodeURIComponent(result.error));
  }

  // Push pro coparente — resolve metadata via admin
  if (result.data.id) {
    try {
      const admin = createAdminClient();
      const { data: rec } = await admin
        .from("vaccine_recommended_doses")
        .select(
          "group_id, child_id, vaccine_catalog!inner(name)",
        )
        .eq("id", doseRecommendationId)
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
  revalidatePath("/saude");
  if (result.data.id) {
    // Pega childId da recomendação pra montar URL coerente
    const admin = createAdminClient();
    const { data: rec } = await admin
      .from("vaccine_recommended_doses")
      .select("child_id")
      .eq("id", doseRecommendationId)
      .single();
    const childId = (rec?.child_id as string) || "";
    redirect(`/saude/vacinas?crianca=${childId}&postVaccine=${result.data.id}`);
  }
  redirect("/saude/vacinas");
}

/* ------------------------------------------------------------------ */
/* dismissDose — snooze de uma pendência                               */
/* ------------------------------------------------------------------ */

export async function dismissDose(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const childId = formData.get("childId") as string;
  const vaccineId = formData.get("vaccineId") as string;
  const doseNumber = Number(formData.get("doseNumber"));
  const reason = formData.get("reason") as "snoozed_7d" | "snoozed_30d" | "already_scheduled";

  const result = await dismissPendingDoseService(supabase, {
    userId: user.id,
    childId,
    vaccineId,
    doseNumber,
    reason,
  });

  if (!result.ok) {
    redirect("/saude/vacinas?error=" + encodeURIComponent(result.error));
  }

  revalidatePath("/saude/vacinas");
  redirect("/saude/vacinas");
}

/* ------------------------------------------------------------------ */
/* updateCalendarPreference — Ajustes da criança                       */
/* ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ */
/* createPostVaccineReminder — checklist 48h opcional                  */
/* ------------------------------------------------------------------ */

/**
 * Cria uma `child_activity` curta de 48h vinculada à vacina recém-registrada.
 * Tom calmo: "Reações leves nas primeiras 48h são esperadas. Em caso de
 * dúvida, contate o pediatra." SEM juízo clínico.
 */
export async function createPostVaccineReminder(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const vaccineRecordId = formData.get("vaccineRecordId") as string;
  if (!vaccineRecordId) {
    redirect("/saude/vacinas?error=" + encodeURIComponent("ID da vacina obrigatório."));
  }

  const admin = createAdminClient();
  const { data: rec } = await admin
    .from("vaccination_records")
    .select("id, group_id, child_id, vaccine_name, administered_date")
    .eq("id", vaccineRecordId)
    .single();
  if (!rec) {
    redirect("/saude/vacinas?error=" + encodeURIComponent("Registro não encontrado."));
  }

  // Valida membership do user no grupo (RLS já filtra, mas erro mais limpo)
  const { data: membership } = await supabase
    .from("group_members")
    .select("user_id")
    .eq("group_id", rec.group_id as string)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!membership) {
    redirect("/saude/vacinas?error=" + encodeURIComponent("Sem permissão."));
  }

  const startDate = rec.administered_date as string;
  const endDate = new Date(new Date(startDate + "T12:00:00").getTime() + 2 * 86400000)
    .toISOString()
    .slice(0, 10);

  await supabase.from("child_activities").insert({
    group_id: rec.group_id,
    child_id: rec.child_id,
    name: `Observar pós-vacina: ${rec.vaccine_name}`,
    category: "health",
    recurrence_type: "never",
    start_date: startDate,
    end_date: endDate,
    is_active: true,
    notes:
      "Lembrete para observar nas primeiras 48h após a vacina. Reações leves (febre baixa, dor no local) são esperadas. Em caso de dúvida, contate o pediatra.",
    notify_hours_before: 24,
    created_by: user.id,
  });

  revalidatePath("/saude/vacinas");
  revalidatePath("/calendario");
  redirect(`/saude/vacinas?crianca=${rec.child_id}&postVaccineDone=1`);
}

export async function updateCalendarPreference(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const childId = formData.get("childId") as string;
  const preference = formData.get("preference") as CalendarPreference;

  const result = await setVaccinationCalendarPreferenceService(supabase, {
    childId,
    preference,
    actorUserId: user.id,
  });

  if (!result.ok) {
    redirect("/saude/vacinas?error=" + encodeURIComponent(result.error));
  }

  revalidatePath("/saude/vacinas");
  revalidatePath("/saude");
  redirect("/saude/vacinas");
}
