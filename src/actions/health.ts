"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function getAuthenticatedUser(supabase: Awaited<ReturnType<typeof createClient>>) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return user;
}

async function verifyMembership(
  supabase: Awaited<ReturnType<typeof createClient>>,
  groupId: string,
  userId: string,
) {
  const { data } = await supabase
    .from("group_members")
    .select("id")
    .eq("group_id", groupId)
    .eq("user_id", userId)
    .single();

  if (!data) {
    redirect("/dashboard?error=" + encodeURIComponent("Sem permissao para este grupo."));
  }
}

function getServiceClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

async function verifyChildInGroup(
  supabase: Awaited<ReturnType<typeof createClient>>,
  childId: string,
  groupId: string,
) {
  if (!childId) return;
  const { data } = await supabase
    .from("children")
    .select("id")
    .eq("id", childId)
    .eq("group_id", groupId)
    .single();
  if (!data) {
    redirect("/dashboard?error=" + encodeURIComponent("Crianca nao pertence a este grupo."));
  }
}

async function getGroupIdFromRecord(
  supabase: Awaited<ReturnType<typeof createClient>>,
  table: string,
  recordId: string,
  userId: string,
) {
  const { data } = await supabase
    .from(table)
    .select("group_id")
    .eq("id", recordId)
    .single();
  if (!data) {
    redirect("/dashboard?error=" + encodeURIComponent("Registro nao encontrado."));
  }
  await verifyMembership(supabase, data.group_id, userId);
  return data.group_id;
}

// ---------------------------------------------------------------------------
// 1. createHealthLog
// ---------------------------------------------------------------------------

export async function createHealthLog(formData: FormData) {
  const supabase = await createClient();
  const user = await getAuthenticatedUser(supabase);

  const groupId = formData.get("groupId") as string;
  await verifyMembership(supabase, groupId, user.id);

  const childId = formData.get("childId") as string;
  await verifyChildInGroup(supabase, childId, groupId);
  const logType = formData.get("logType") as string;
  const value = formData.get("value") as string;
  const notes = formData.get("notes") as string;

  const { error } = await supabase.from("health_logs").insert({
    group_id: groupId,
    child_id: childId,
    log_type: logType,
    value: value || null,
    notes: notes || null,
    logged_by: user.id,
  });

  if (error) redirect("/saude?error=" + encodeURIComponent(error.message));

  revalidatePath("/saude");
  redirect("/saude");
}

// ---------------------------------------------------------------------------
// 2. createProfessional
// ---------------------------------------------------------------------------

export async function createProfessional(formData: FormData) {
  const supabase = await createClient();
  const user = await getAuthenticatedUser(supabase);

  const groupId = formData.get("groupId") as string;
  await verifyMembership(supabase, groupId, user.id);

  const name = formData.get("name") as string;
  const specialty = formData.get("specialty") as string;
  const crm = formData.get("crm") as string;
  const phone = formData.get("phone") as string;
  const whatsapp = formData.get("whatsapp") as string;
  const address = formData.get("address") as string;
  const notes = formData.get("notes") as string;

  const { error } = await supabase.from("medical_professionals").insert({
    group_id: groupId,
    name,
    specialty: specialty || null,
    crm: crm || null,
    phone: phone || null,
    whatsapp: whatsapp || null,
    address: address || null,
    notes: notes || null,
    created_by: user.id,
  });

  if (error) redirect("/saude/profissionais?error=" + encodeURIComponent(error.message));

  revalidatePath("/saude/profissionais");
  redirect("/saude/profissionais?success=Profissional+cadastrado");
}

// ---------------------------------------------------------------------------
// 3. createAppointment
// ---------------------------------------------------------------------------

export async function createAppointment(formData: FormData) {
  const supabase = await createClient();
  const user = await getAuthenticatedUser(supabase);

  const groupId = formData.get("groupId") as string;
  await verifyMembership(supabase, groupId, user.id);

  const childId = formData.get("childId") as string;
  const professionalId = formData.get("professionalId") as string;
  const title = formData.get("title") as string;
  const appointmentDate = formData.get("appointmentDate") as string;
  const appointmentTime = formData.get("appointmentTime") as string;
  const location = formData.get("location") as string;
  const notes = formData.get("notes") as string;

  // Combine date + time into a TIMESTAMPTZ value (Brazil timezone)
  const appointmentDatetime = `${appointmentDate}T${appointmentTime}:00-03:00`;

  const { data: appointment, error } = await supabase
    .from("medical_appointments")
    .insert({
      group_id: groupId,
      child_id: childId,
      professional_id: professionalId || null,
      title,
      appointment_date: appointmentDatetime,
      location: location || null,
      notes: notes || null,
      created_by: user.id,
    })
    .select("id")
    .single();

  if (error) redirect("/saude/consultas?error=" + encodeURIComponent(error.message));

  // Create a calendar event (custody_event) for sync — use service role to bypass RLS
  const serviceClient = getServiceClient();

  // Calculate end time (1 hour later)
  const [hours, minutes] = appointmentTime.split(":").map(Number);
  const endHours = String((hours + 1) % 24).padStart(2, "0");
  const endTime = `${endHours}:${String(minutes).padStart(2, "0")}`;

  const { data: calendarEvent, error: calError } = await serviceClient
    .from("custody_events")
    .insert({
      group_id: groupId,
      child_id: childId,
      responsible_user_id: user.id,
      start_date: appointmentDate,
      end_date: appointmentDate,
      start_time: appointmentTime,
      end_time: endTime,
      custody_type: "special",
      notes: `Consulta: ${title}`,
      created_by: user.id,
    })
    .select("id")
    .single();

  // Link calendar event to appointment
  if (calendarEvent && !calError) {
    await serviceClient
      .from("medical_appointments")
      .update({ calendar_event_id: calendarEvent.id })
      .eq("id", appointment.id);
  }

  revalidatePath("/saude/consultas");
  redirect("/saude/consultas?success=Consulta+agendada");
}

// ---------------------------------------------------------------------------
// 4. updateAppointmentStatus
// ---------------------------------------------------------------------------

export async function updateAppointmentStatus(formData: FormData) {
  const supabase = await createClient();
  const user = await getAuthenticatedUser(supabase);

  const appointmentId = formData.get("appointmentId") as string;
  const status = formData.get("status") as string;
  const summary = formData.get("summary") as string;

  // Verify user belongs to the appointment's group
  await getGroupIdFromRecord(supabase, "medical_appointments", appointmentId, user.id);

  // Fetch existing appointment to get calendar_event_id
  const { data: existing } = await supabase
    .from("medical_appointments")
    .select("calendar_event_id")
    .eq("id", appointmentId)
    .single();

  const validStatuses = ["scheduled", "completed", "cancelled", "missed"];
  const { error } = await supabase
    .from("medical_appointments")
    .update({
      status: validStatuses.includes(status) ? status : "scheduled",
      summary: summary || null,
    })
    .eq("id", appointmentId);

  if (error) redirect("/saude/consultas?error=" + encodeURIComponent(error.message));

  // If cancelled, remove the linked calendar event
  if (status === "cancelled" && existing?.calendar_event_id) {
    const serviceClient = getServiceClient();
    await serviceClient
      .from("custody_events")
      .delete()
      .eq("id", existing.calendar_event_id);
  }

  revalidatePath("/saude/consultas");
  redirect("/saude/consultas");
}

// ---------------------------------------------------------------------------
// 5. createMedication
// ---------------------------------------------------------------------------

export async function createMedication(formData: FormData) {
  const supabase = await createClient();
  const user = await getAuthenticatedUser(supabase);

  const groupId = formData.get("groupId") as string;
  await verifyMembership(supabase, groupId, user.id);

  const childId = formData.get("childId") as string;
  const name = formData.get("name") as string;
  const dosage = formData.get("dosage") as string;
  const frequency = formData.get("frequency") as string;
  const frequencyHours = formData.get("frequencyHours") as string;
  const reason = formData.get("reason") as string;
  const prescribedBy = formData.get("prescribedBy") as string;
  const startDate = formData.get("startDate") as string;
  const endDate = formData.get("endDate") as string;
  const notes = formData.get("notes") as string;

  const { error } = await supabase.from("active_medications").insert({
    group_id: groupId,
    child_id: childId,
    name,
    dosage: dosage || null,
    frequency: frequency || null,
    frequency_hours: frequencyHours ? parseInt(frequencyHours, 10) : null,
    reason: reason || null,
    prescribed_by: prescribedBy || null,
    start_date: startDate || null,
    end_date: endDate || null,
    notes: notes || null,
    created_by: user.id,
  });

  if (error) redirect("/saude/medicamentos?error=" + encodeURIComponent(error.message));

  revalidatePath("/saude/medicamentos");
  redirect("/saude/medicamentos?success=Medicamento+adicionado");
}

// ---------------------------------------------------------------------------
// 6. logMedicationDose
// ---------------------------------------------------------------------------

export async function logMedicationDose(formData: FormData) {
  const supabase = await createClient();
  const user = await getAuthenticatedUser(supabase);

  const medicationId = formData.get("medicationId") as string;

  // Verify user belongs to the medication's group
  await getGroupIdFromRecord(supabase, "active_medications", medicationId, user.id);

  const { error } = await supabase.from("medication_doses").insert({
    medication_id: medicationId,
    administered_at: new Date().toISOString(),
    administered_by: user.id,
  });

  if (error) redirect("/saude/medicamentos?error=" + encodeURIComponent(error.message));

  revalidatePath("/saude/medicamentos");
  redirect("/saude/medicamentos");
}

// ---------------------------------------------------------------------------
// 7. updateMedicationStatus
// ---------------------------------------------------------------------------

export async function updateMedicationStatus(formData: FormData) {
  const supabase = await createClient();
  const user = await getAuthenticatedUser(supabase);

  const medicationId = formData.get("medicationId") as string;
  const status = formData.get("status") as string;

  // Verify user belongs to the medication's group
  await getGroupIdFromRecord(supabase, "active_medications", medicationId, user.id);

  const validStatuses = ["active", "paused", "completed", "cancelled"];
  const { error } = await supabase
    .from("active_medications")
    .update({ status: validStatuses.includes(status) ? status : "active" })
    .eq("id", medicationId);

  if (error) redirect("/saude/medicamentos?error=" + encodeURIComponent(error.message));

  revalidatePath("/saude/medicamentos");
  redirect("/saude/medicamentos");
}

// ---------------------------------------------------------------------------
// 8. createIllnessEpisode
// ---------------------------------------------------------------------------

export async function createIllnessEpisode(formData: FormData) {
  const supabase = await createClient();
  const user = await getAuthenticatedUser(supabase);

  const groupId = formData.get("groupId") as string;
  await verifyMembership(supabase, groupId, user.id);

  const childId = formData.get("childId") as string;
  const title = formData.get("title") as string;
  const symptomsRaw = formData.get("symptoms") as string;
  const symptoms = symptomsRaw
    ? symptomsRaw.split(",").map((s) => s.trim()).filter(Boolean)
    : [];
  const startDate = formData.get("startDate") as string;
  const diagnosis = formData.get("diagnosis") as string;
  const notes = formData.get("notes") as string;

  const { error } = await supabase.from("illness_episodes").insert({
    group_id: groupId,
    child_id: childId,
    title,
    symptoms,
    start_date: startDate || null,
    diagnosis: diagnosis || null,
    notes: notes || null,
    created_by: user.id,
  });

  if (error) redirect("/saude/doencas?error=" + encodeURIComponent(error.message));

  revalidatePath("/saude/doencas");
  redirect("/saude/doencas?success=Episodio+registrado");
}

// ---------------------------------------------------------------------------
// 9. updateIllnessEpisode
// ---------------------------------------------------------------------------

export async function updateIllnessEpisode(formData: FormData) {
  const supabase = await createClient();
  const user = await getAuthenticatedUser(supabase);

  const episodeId = formData.get("episodeId") as string;
  const status = formData.get("status") as string;
  const endDate = formData.get("endDate") as string;
  const diagnosis = formData.get("diagnosis") as string;

  // Verify user belongs to the episode's group
  await getGroupIdFromRecord(supabase, "illness_episodes", episodeId, user.id);

  const validStatuses = ["active", "resolved", "chronic"];
  const { error } = await supabase
    .from("illness_episodes")
    .update({
      status: validStatuses.includes(status) ? status : undefined,
      end_date: endDate || null,
      diagnosis: diagnosis || null,
    })
    .eq("id", episodeId);

  if (error) redirect("/saude/doencas?error=" + encodeURIComponent(error.message));

  revalidatePath("/saude/doencas");
  redirect("/saude/doencas");
}

// ---------------------------------------------------------------------------
// 10. createAllergy
// ---------------------------------------------------------------------------

export async function createAllergy(formData: FormData) {
  const supabase = await createClient();
  const user = await getAuthenticatedUser(supabase);

  const groupId = formData.get("groupId") as string;
  await verifyMembership(supabase, groupId, user.id);

  const childId = formData.get("childId") as string;
  const name = formData.get("name") as string;
  const allergyType = formData.get("allergyType") as string;
  const severity = formData.get("severity") as string;
  const reaction = formData.get("reaction") as string;

  const { error } = await supabase.from("child_allergies").insert({
    group_id: groupId,
    child_id: childId,
    name,
    allergy_type: allergyType || null,
    severity: severity || null,
    reaction: reaction || null,
    created_by: user.id,
  });

  if (error) redirect("/saude/alergias?error=" + encodeURIComponent(error.message));

  revalidatePath("/saude/alergias");
  redirect("/saude/alergias?success=Alergia+registrada");
}

// ---------------------------------------------------------------------------
// 11. upsertMedicalInfo
// ---------------------------------------------------------------------------

export async function upsertMedicalInfo(formData: FormData) {
  const supabase = await createClient();
  const user = await getAuthenticatedUser(supabase);

  const childId = formData.get("childId") as string;
  const groupId = formData.get("groupId") as string;
  await verifyMembership(supabase, groupId, user.id);

  const bloodType = formData.get("bloodType") as string;
  const insuranceName = formData.get("insuranceName") as string;
  const insuranceNumber = formData.get("insuranceNumber") as string;
  const susNumber = formData.get("susNumber") as string;
  const primaryPediatricianId = formData.get("primaryPediatricianId") as string;

  const serviceClient = getServiceClient();

  const { error } = await serviceClient.from("child_medical_info").upsert(
    {
      child_id: childId,
      group_id: groupId,
      blood_type: bloodType || null,
      insurance_name: insuranceName || null,
      insurance_number: insuranceNumber || null,
      sus_number: susNumber || null,
      primary_pediatrician_id: primaryPediatricianId || null,
      updated_by: user.id,
    },
    { onConflict: "child_id" },
  );

  if (error) redirect("/saude/alergias?error=" + encodeURIComponent(error.message));

  revalidatePath("/saude/alergias");
  redirect("/saude/alergias?success=Informacoes+atualizadas");
}

// ---------------------------------------------------------------------------
// 12. createVaccinationRecord
// ---------------------------------------------------------------------------

export async function createVaccinationRecord(formData: FormData) {
  const supabase = await createClient();
  const user = await getAuthenticatedUser(supabase);

  const groupId = formData.get("groupId") as string;
  await verifyMembership(supabase, groupId, user.id);

  const childId = formData.get("childId") as string;
  const vaccineName = formData.get("vaccineName") as string;
  const doseLabel = formData.get("doseLabel") as string;
  const administeredDate = formData.get("administeredDate") as string;
  const batchNumber = formData.get("batchNumber") as string;
  const location = formData.get("location") as string;
  const notes = formData.get("notes") as string;

  const { error } = await supabase.from("vaccination_records").insert({
    group_id: groupId,
    child_id: childId,
    vaccine_name: vaccineName,
    dose_label: doseLabel || null,
    administered_date: administeredDate || null,
    batch_number: batchNumber || null,
    location: location || null,
    notes: notes || null,
    created_by: user.id,
  });

  if (error) redirect("/saude/vacinas?error=" + encodeURIComponent(error.message));

  revalidatePath("/saude/vacinas");
  redirect("/saude/vacinas?success=Vacina+registrada");
}

// ---------------------------------------------------------------------------
// 13. createGrowthRecord
// ---------------------------------------------------------------------------

export async function createGrowthRecord(formData: FormData) {
  const supabase = await createClient();
  const user = await getAuthenticatedUser(supabase);

  const groupId = formData.get("groupId") as string;
  await verifyMembership(supabase, groupId, user.id);

  const childId = formData.get("childId") as string;
  const measuredDate = formData.get("measuredDate") as string;
  const weightKg = formData.get("weightKg") as string;
  const heightCm = formData.get("heightCm") as string;
  const headCm = formData.get("headCm") as string;
  const notes = formData.get("notes") as string;

  const { error } = await supabase.from("growth_records").insert({
    group_id: groupId,
    child_id: childId,
    measured_date: measuredDate || null,
    weight_kg: weightKg ? parseFloat(weightKg) : null,
    height_cm: heightCm ? parseFloat(heightCm) : null,
    head_cm: headCm ? parseFloat(headCm) : null,
    notes: notes || null,
    created_by: user.id,
  });

  if (error) redirect("/saude/crescimento?error=" + encodeURIComponent(error.message));

  revalidatePath("/saude/crescimento");
  redirect("/saude/crescimento?success=Medida+registrada");
}
