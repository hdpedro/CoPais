"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { postChatNotification } from "@/lib/chat-notify";
import { captureServerEvent } from "@/lib/posthog-server";
import { createNotificationWithPush } from "@/lib/push";

// ---------------------------------------------------------------------------
// Input sanitization helpers
// ---------------------------------------------------------------------------

function sanitizeText(val: string | null | undefined, maxLen: number): string {
  if (!val) return "";
  return val.trim().slice(0, maxLen);
}

async function getOtherGroupMembers(
  supabase: Awaited<ReturnType<typeof createClient>>,
  groupId: string,
  excludeUserId: string,
): Promise<string[]> {
  const { data } = await supabase
    .from("group_members")
    .select("user_id")
    .eq("group_id", groupId)
    .neq("user_id", excludeUserId);
  return (data || []).map((m) => m.user_id);
}

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

async function verifyProfessionalInGroup(
  supabase: Awaited<ReturnType<typeof createClient>>,
  professionalId: string,
  groupId: string,
) {
  if (!professionalId) return;
  const { data } = await supabase
    .from("professionals")
    .select("id")
    .eq("id", professionalId)
    .eq("group_id", groupId)
    .single();
  if (!data) {
    redirect("/dashboard?error=" + encodeURIComponent("Profissional nao pertence a este grupo."));
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
  const value = sanitizeText(formData.get("value") as string, 100);
  const notes = sanitizeText(formData.get("notes") as string, 2000);

  const allowedLogTypes = ["weight", "height", "temperature", "symptom", "medication", "vaccine", "allergy", "sleep", "feeding", "diaper", "mood", "milestone", "other"];
  if (!allowedLogTypes.includes(logType)) {
    redirect("/saude?error=" + encodeURIComponent("Tipo de registro invalido."));
  }

  const { error } = await supabase.from("health_logs").insert({
    group_id: groupId,
    child_id: childId,
    log_type: logType,
    value: value || null,
    notes: notes || null,
    logged_by: user.id,
  });

  if (error) redirect("/saude?error=" + encodeURIComponent(error.message));

  captureServerEvent(user.id, "health_log_created", { logType });

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

  const name = sanitizeText(formData.get("name") as string, 200);
  const specialty = sanitizeText(formData.get("specialty") as string, 200);
  const crm = sanitizeText(formData.get("crm") as string, 100);
  const phone = sanitizeText(formData.get("phone") as string, 100);
  const whatsapp = sanitizeText(formData.get("whatsapp") as string, 100);
  const address = sanitizeText(formData.get("address") as string, 500);
  const notes = sanitizeText(formData.get("notes") as string, 2000);

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

  await verifyChildInGroup(supabase, childId, groupId);
  await verifyProfessionalInGroup(supabase, professionalId, groupId);

  const title = sanitizeText(formData.get("title") as string, 200);
  const appointmentDate = formData.get("appointmentDate") as string;
  const appointmentTime = formData.get("appointmentTime") as string;
  const location = sanitizeText(formData.get("location") as string, 200);
  const notes = sanitizeText(formData.get("notes") as string, 2000);
  const appointmentType = formData.get("appointmentType") as string;
  const returnDate = formData.get("returnDate") as string;
  const returnNotes = sanitizeText(formData.get("returnNotes") as string, 2000);

  // Combine date + time into a TIMESTAMPTZ value (Brazil timezone)
  const appointmentDatetime = `${appointmentDate}T${appointmentTime}:00-03:00`;

  const insertData: Record<string, unknown> = {
    group_id: groupId,
    child_id: childId,
    professional_id: professionalId || null,
    title,
    appointment_date: appointmentDatetime,
    location: location || null,
    notes: notes || null,
    created_by: user.id,
  };

  if (appointmentType) insertData.appointment_type = appointmentType;
  if (returnDate) insertData.return_date = returnDate;
  if (returnNotes) insertData.return_notes = returnNotes;

  const { data: appointment, error } = await supabase
    .from("medical_appointments")
    .insert(insertData)
    .select("id")
    .single();

  if (error) redirect("/saude/consultas?error=" + encodeURIComponent(error.message));

  captureServerEvent(user.id, "appointment_created", { appointmentType });

  // Create a calendar event (custody_event) for sync — use service role to bypass RLS
  const serviceClient = getServiceClient();

  const { data: calendarEvent, error: calError } = await serviceClient
    .from("custody_events")
    .insert({
      group_id: groupId,
      child_id: childId,
      responsible_user_id: user.id,
      start_date: appointmentDate,
      end_date: appointmentDate,
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

  // Push notification to other group members
  try {
    const { data: child } = await supabase.from("children").select("full_name").eq("id", childId).single();
    const childName = child?.full_name?.split(" ")[0] || "crianca";
    const otherMembers = await getOtherGroupMembers(supabase, groupId, user.id);
    if (otherMembers.length > 0) {
      await Promise.allSettled(otherMembers.map((uid) => createNotificationWithPush(uid, "system", "Consulta agendada", `📅 ${title} — ${childName} (${appointmentDate})`, "/saude/consultas")));
    }
  } catch {
    // Push failure should not break the action
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
  const returnDate = formData.get("returnDate") as string;
  const returnNotes = formData.get("returnNotes") as string;

  // Verify user belongs to the appointment's group
  await getGroupIdFromRecord(supabase, "medical_appointments", appointmentId, user.id);

  // Fetch existing appointment to get calendar_event_id
  const { data: existing } = await supabase
    .from("medical_appointments")
    .select("calendar_event_id")
    .eq("id", appointmentId)
    .single();

  const validStatuses = ["scheduled", "completed", "cancelled", "missed"];
  const updateData: Record<string, unknown> = {
    status: validStatuses.includes(status) ? status : "scheduled",
    summary: summary || null,
  };
  if (returnDate) updateData.return_date = returnDate;
  if (returnNotes) updateData.return_notes = returnNotes;

  const { error } = await supabase
    .from("medical_appointments")
    .update(updateData)
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
// 4b. completeAppointment — mark as completed with summary/diagnosis/prescriptions
// ---------------------------------------------------------------------------

export async function completeAppointment(formData: FormData) {
  const supabase = await createClient();
  const user = await getAuthenticatedUser(supabase);

  const appointmentId = formData.get("appointmentId") as string;
  const summaryText = (formData.get("summary") as string) || "";
  const diagnosis = (formData.get("diagnosis") as string) || "";
  const prescriptions = (formData.get("prescriptions") as string) || "";
  const returnDate = formData.get("returnDate") as string;
  const returnNotes = formData.get("returnNotes") as string;

  // Verify user belongs to the appointment's group
  await getGroupIdFromRecord(supabase, "medical_appointments", appointmentId, user.id);

  // Build formatted summary combining all fields
  const parts: string[] = [];
  if (summaryText.trim()) parts.push(summaryText.trim());
  if (diagnosis.trim()) parts.push(`Diagnostico: ${diagnosis.trim()}`);
  if (prescriptions.trim()) parts.push(`Medicamentos: ${prescriptions.trim()}`);

  const formattedSummary = parts.join("\n") || null;

  const updateData: Record<string, unknown> = {
    status: "completed",
    summary: formattedSummary,
  };
  if (returnDate) updateData.return_date = returnDate;
  if (returnNotes) updateData.return_notes = returnNotes;

  const { error } = await supabase
    .from("medical_appointments")
    .update(updateData)
    .eq("id", appointmentId);

  if (error) redirect("/saude/consultas?error=" + encodeURIComponent(error.message));

  revalidatePath("/saude/consultas");
  revalidatePath("/saude");
  redirect("/saude/consultas?success=" + encodeURIComponent("Consulta concluida com sucesso"));
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
  await verifyChildInGroup(supabase, childId, groupId);

  const name = sanitizeText(formData.get("name") as string, 200);
  const dosage = sanitizeText(formData.get("dosage") as string, 200);
  const frequency = sanitizeText(formData.get("frequency") as string, 200);
  const frequencyHours = formData.get("frequencyHours") as string;
  const reason = sanitizeText(formData.get("reason") as string, 200);
  const prescribedBy = sanitizeText(formData.get("prescribedBy") as string, 200);
  const startDate = formData.get("startDate") as string;
  const endDate = formData.get("endDate") as string;
  const notes = sanitizeText(formData.get("notes") as string, 2000);

  // Validate required NOT NULL fields
  if (!childId) redirect("/saude/medicamentos?error=" + encodeURIComponent("Selecione uma criança"));
  if (!name) redirect("/saude/medicamentos?error=" + encodeURIComponent("Nome do medicamento é obrigatório"));
  if (!dosage) redirect("/saude/medicamentos?error=" + encodeURIComponent("Dosagem é obrigatória"));
  if (!frequency) redirect("/saude/medicamentos?error=" + encodeURIComponent("Frequência é obrigatória"));
  if (!startDate) redirect("/saude/medicamentos?error=" + encodeURIComponent("Data de início é obrigatória"));

  const { error } = await supabase.from("active_medications").insert({
    group_id: groupId,
    child_id: childId,
    name,
    dosage,
    frequency,
    frequency_hours: frequencyHours ? parseInt(frequencyHours, 10) : null,
    reason: reason || null,
    prescribed_by: prescribedBy || null,
    start_date: startDate,
    end_date: endDate || null,
    notes: notes || null,
    created_by: user.id,
  });

  if (error) redirect("/saude/medicamentos?error=" + encodeURIComponent(error.message));

  captureServerEvent(user.id, "medication_created", { name });

  // Post to chat
  try {
    const { data: child } = await supabase.from("children").select("full_name").eq("id", childId).single();
    const childName = child?.full_name?.split(" ")[0] || "crianca";
    await postChatNotification(
      supabase, groupId, user.id,
      `💊 Novo medicamento: ${name}${dosage ? ` (${dosage})` : ""} — ${childName}${frequency ? ` · ${frequency}` : ""}`
    );
  } catch {
    // Notification failure should not break the action
  }

  revalidatePath("/saude/medicamentos");
  revalidatePath("/chat");
  redirect("/saude/medicamentos?success=Medicamento+adicionado");
}

// ---------------------------------------------------------------------------
// 6. logMedicationDose
// ---------------------------------------------------------------------------

export async function logMedicationDose(formData: FormData) {
  const supabase = await createClient();
  const user = await getAuthenticatedUser(supabase);

  const medicationId = formData.get("medicationId") as string;
  const redirectTo = (formData.get("redirectTo") as string) || "/saude/medicamentos";

  // Verify user belongs to the medication's group
  await getGroupIdFromRecord(supabase, "active_medications", medicationId, user.id);

  // Server-side dose interval validation
  const { data: medication } = await supabase
    .from("active_medications")
    .select("frequency_hours")
    .eq("id", medicationId)
    .single();

  const { data: lastDoseArr } = await supabase
    .from("medication_doses")
    .select("administered_at")
    .eq("medication_id", medicationId)
    .order("administered_at", { ascending: false })
    .limit(1);

  if (lastDoseArr && lastDoseArr.length > 0) {
    const lastDoseTime = new Date(lastDoseArr[0].administered_at).getTime();
    const minutesSinceLastDose = (Date.now() - lastDoseTime) / (1000 * 60);

    // Hard block: less than 30 minutes since last dose
    if (minutesSinceLastDose < 30) {
      redirect(redirectTo + "?error=" + encodeURIComponent("Dose recusada: ultima dose foi ha menos de 30 minutos."));
    }

    // Warning: less than half the recommended interval
    // frequency_hours=0 or null means on-demand (SOS) — skip interval check
    const freqHours = medication?.frequency_hours;
    const halfIntervalMinutes = freqHours ? (freqHours * 60) / 2 : 0;
    if (freqHours && halfIntervalMinutes > 0 && minutesSinceLastDose < halfIntervalMinutes) {
      // Allow but add warning in success message
      const { error } = await supabase.from("medication_doses").insert({
        medication_id: medicationId,
        administered_at: new Date().toISOString(),
        administered_by: user.id,
      });
      if (error) redirect(redirectTo + "?error=" + encodeURIComponent(error.message));
      revalidatePath("/saude/medicamentos");
      revalidatePath("/saude");
      redirect(redirectTo + "?success=" + encodeURIComponent("Dose confirmada (intervalo menor que o recomendado)"));
    }
  }

  const { error } = await supabase.from("medication_doses").insert({
    medication_id: medicationId,
    administered_at: new Date().toISOString(),
    administered_by: user.id,
  });

  if (error) redirect(redirectTo + "?error=" + encodeURIComponent(error.message));

  revalidatePath("/saude/medicamentos");
  revalidatePath("/saude");
  redirect(redirectTo + "?success=" + encodeURIComponent("Dose confirmada"));
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
  await verifyChildInGroup(supabase, childId, groupId);

  const title = sanitizeText(formData.get("title") as string, 200);
  const symptomsRaw = formData.get("symptoms") as string;
  const symptoms = symptomsRaw
    ? symptomsRaw.split(",").map((s) => s.trim().slice(0, 100)).filter(Boolean)
    : [];
  const startDate = formData.get("startDate") as string;
  const diagnosis = sanitizeText(formData.get("diagnosis") as string, 500);
  const notes = sanitizeText(formData.get("notes") as string, 2000);
  const severity = formData.get("severity") as string;
  const hospitalVisit = formData.get("hospitalVisit") === "true";
  const hospitalName = formData.get("hospitalName") as string;
  const hospitalDate = formData.get("hospitalDate") as string;

  const insertData: Record<string, unknown> = {
    group_id: groupId,
    child_id: childId,
    title,
    symptoms,
    start_date: startDate || null,
    diagnosis: diagnosis || null,
    notes: notes || null,
    created_by: user.id,
  };

  // Add new fields only if they have values (columns may not exist in older DBs)
  if (severity) insertData.severity = severity;
  if (hospitalVisit) insertData.hospital_visit = true;
  if (hospitalName) insertData.hospital_name = hospitalName;
  if (hospitalDate) insertData.hospital_date = hospitalDate;

  const { error } = await supabase.from("illness_episodes").insert(insertData);

  if (error) redirect("/saude/doencas?error=" + encodeURIComponent(error.message));

  captureServerEvent(user.id, "illness_reported", { title });

  // Get child name for chat
  try {
    const { data: child } = await supabase.from("children").select("full_name").eq("id", childId).single();
    const childName = child?.full_name?.split(" ")[0] || "crianca";
    const severityEmoji = severity === "grave" ? "🔴" : severity === "moderado" ? "🟡" : "🟢";
    await postChatNotification(
      supabase, groupId, user.id,
      `🤒 Registrou doenca: ${title} ${severityEmoji} (${childName})${diagnosis ? ` — Diagnostico: ${diagnosis}` : ""}`
    );
  } catch {
    // Notification failure should not break the action
  }

  revalidatePath("/saude/doencas");
  revalidatePath("/chat");
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
  if (!validStatuses.includes(status)) {
    redirect("/saude/doencas?error=" + encodeURIComponent("Status invalido: " + status));
  }
  const { error } = await supabase
    .from("illness_episodes")
    .update({
      status,
      end_date: endDate || null,
      diagnosis: diagnosis || null,
    })
    .eq("id", episodeId);

  if (error) redirect("/saude/doencas?error=" + encodeURIComponent(error.message));

  revalidatePath("/saude/doencas");
  redirect("/saude/doencas");
}

// ---------------------------------------------------------------------------
// 9b. addIllnessEvolution — add evolution note to illness episode
// ---------------------------------------------------------------------------

export async function addIllnessEvolution(formData: FormData) {
  const supabase = await createClient();
  const user = await getAuthenticatedUser(supabase);

  const episodeId = formData.get("episodeId") as string;
  const evolutionNote = formData.get("evolutionNote") as string;

  // Verify user belongs to the episode's group
  await getGroupIdFromRecord(supabase, "illness_episodes", episodeId, user.id);

  // Get current notes
  const { data: episode } = await supabase
    .from("illness_episodes")
    .select("notes")
    .eq("id", episodeId)
    .single();

  // Get user profile name
  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", user.id)
    .single();

  const authorName = profile?.full_name?.split(" ")[0] || "Responsavel";
  const now = new Date();
  const dateStr = now.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "America/Sao_Paulo" });
  const timeStr = now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });

  const newEntry = `[${dateStr} ${timeStr} - ${authorName}] ${evolutionNote}`;
  const updatedNotes = episode?.notes
    ? `${newEntry}\n${episode.notes}`
    : newEntry;

  const { error } = await supabase
    .from("illness_episodes")
    .update({ notes: updatedNotes })
    .eq("id", episodeId);

  if (error) redirect("/saude/doencas?error=" + encodeURIComponent(error.message));

  // Post evolution to chat
  try {
    const { data: ep } = await supabase.from("illness_episodes").select("title, group_id, child_id").eq("id", episodeId).single();
    if (ep) {
      const { data: child } = await supabase.from("children").select("full_name").eq("id", ep.child_id).single();
      const childName = child?.full_name?.split(" ")[0] || "crianca";
      await postChatNotification(
        supabase, ep.group_id, user.id,
        `📋 Atualizou ${ep.title} (${childName}): ${evolutionNote}`
      );
    }
  } catch {
    // Notification failure should not break the action
  }

  revalidatePath("/saude/doencas");
  revalidatePath("/saude");
  revalidatePath("/chat");
  redirect("/saude/doencas?success=" + encodeURIComponent("Evolucao registrada"));
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
  const name = sanitizeText(formData.get("name") as string, 200);
  const allergyType = formData.get("allergyType") as string;
  const severity = formData.get("severity") as string;
  const reaction = sanitizeText(formData.get("reaction") as string, 500);

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

  // Push notification to other group members
  try {
    const { data: child } = await supabase.from("children").select("full_name").eq("id", childId).single();
    const childName = child?.full_name?.split(" ")[0] || "crianca";
    const otherMembers = await getOtherGroupMembers(supabase, groupId, user.id);
    if (otherMembers.length > 0) {
      await Promise.allSettled(otherMembers.map((uid) => createNotificationWithPush(uid, "system", "Nova alergia registrada", `⚠️ ${name} (${severity || "leve"}) — ${childName}`, "/saude/alergias")));
    }
  } catch {
    // Push failure should not break the action
  }

  revalidatePath("/saude/alergias");
  redirect("/saude/alergias?crianca=" + childId + "&success=Alergia+registrada");
}

// ---------------------------------------------------------------------------
// 10b. updateAllergy
// ---------------------------------------------------------------------------

export async function updateAllergy(formData: FormData) {
  const supabase = await createClient();
  const user = await getAuthenticatedUser(supabase);

  const allergyId = formData.get("allergyId") as string;
  if (!allergyId) redirect("/saude/alergias?error=" + encodeURIComponent("ID da alergia não informado."));

  // Verify the allergy belongs to a group the user is a member of
  const { data: allergy } = await supabase
    .from("child_allergies")
    .select("id, group_id, child_id")
    .eq("id", allergyId)
    .single();

  if (!allergy) redirect("/saude/alergias?error=" + encodeURIComponent("Alergia não encontrada."));
  await verifyMembership(supabase, allergy.group_id, user.id);

  const name = sanitizeText(formData.get("allergyName") as string, 200);
  const allergyType = formData.get("allergyType") as string;
  const severity = formData.get("severity") as string;
  const reaction = sanitizeText(formData.get("reaction") as string, 500);
  const notes = sanitizeText(formData.get("notes") as string, 2000);

  const updateData: Record<string, unknown> = {
    name,
    allergy_type: allergyType || null,
    severity: severity || null,
    reaction: reaction || null,
  };
  if (notes !== undefined) updateData.notes = notes || null;

  const { error } = await supabase
    .from("child_allergies")
    .update(updateData)
    .eq("id", allergyId);

  if (error) redirect("/saude/alergias?crianca=" + allergy.child_id + "&error=" + encodeURIComponent(error.message));

  captureServerEvent(user.id, "allergy_updated", { allergyId });

  revalidatePath("/saude/alergias");
  redirect("/saude/alergias?crianca=" + allergy.child_id + "&success=Alergia+atualizada");
}

// ---------------------------------------------------------------------------
// 10c. deleteAllergy
// ---------------------------------------------------------------------------

export async function deleteAllergy(formData: FormData) {
  const supabase = await createClient();
  const user = await getAuthenticatedUser(supabase);

  const allergyId = formData.get("allergyId") as string;
  if (!allergyId) redirect("/saude/alergias?error=" + encodeURIComponent("ID da alergia não informado."));

  // Verify the allergy belongs to a group the user is a member of
  const { data: allergy } = await supabase
    .from("child_allergies")
    .select("id, group_id, child_id")
    .eq("id", allergyId)
    .single();

  if (!allergy) redirect("/saude/alergias?error=" + encodeURIComponent("Alergia não encontrada."));
  await verifyMembership(supabase, allergy.group_id, user.id);

  // Use service role client to bypass potential missing DELETE RLS policy
  const serviceClient = getServiceClient();
  const { error } = await serviceClient
    .from("child_allergies")
    .delete()
    .eq("id", allergyId);

  if (error) redirect("/saude/alergias?crianca=" + allergy.child_id + "&error=" + encodeURIComponent(error.message));

  captureServerEvent(user.id, "allergy_deleted", { allergyId });

  revalidatePath("/saude/alergias");
  redirect("/saude/alergias?crianca=" + allergy.child_id + "&success=Alergia+excluída");
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
  const vaccineName = sanitizeText(formData.get("vaccineName") as string, 200);
  const doseLabel = sanitizeText(formData.get("doseLabel") as string, 100);
  const administeredDate = formData.get("administeredDate") as string;
  const batchNumber = sanitizeText(formData.get("batchNumber") as string, 100);
  const location = sanitizeText(formData.get("location") as string, 200);
  const notes = sanitizeText(formData.get("notes") as string, 2000);

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

  captureServerEvent(user.id, "vaccine_recorded");

  // Push notification to other group members
  try {
    const { data: child } = await supabase.from("children").select("full_name").eq("id", childId).single();
    const childName = child?.full_name?.split(" ")[0] || "crianca";
    const otherMembers = await getOtherGroupMembers(supabase, groupId, user.id);
    if (otherMembers.length > 0) {
      await Promise.allSettled(otherMembers.map((uid) => createNotificationWithPush(uid, "system", "Vacina registrada", `💉 ${vaccineName}${doseLabel ? ` (${doseLabel})` : ""} — ${childName}`, "/saude/vacinas")));
    }
  } catch {
    // Push failure should not break the action
  }

  revalidatePath("/saude/vacinas");
  redirect("/saude/vacinas?success=Vacina+registrada");
}

// ---------------------------------------------------------------------------
// 12b. createVaccinationRecordBatch (no redirect — for batch imports)
// ---------------------------------------------------------------------------

export async function createVaccinationRecordBatch(formData: FormData): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();
  const user = await getAuthenticatedUser(supabase);

  const groupId = formData.get("groupId") as string;
  await verifyMembership(supabase, groupId, user.id);

  const childId = formData.get("childId") as string;
  const vaccineName = sanitizeText(formData.get("vaccineName") as string, 200);
  const doseLabel = sanitizeText(formData.get("doseLabel") as string, 100);
  const administeredDate = formData.get("administeredDate") as string;
  const batchNumber = sanitizeText(formData.get("batchNumber") as string, 100);
  const location = sanitizeText(formData.get("location") as string, 200);
  const notes = sanitizeText(formData.get("notes") as string, 2000);

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

  if (error) return { success: false, error: error.message };

  captureServerEvent(user.id, "vaccine_recorded");

  // Push notification to other group members (only on first call ideally, but safe to fire)
  try {
    const { data: child } = await supabase.from("children").select("full_name").eq("id", childId).single();
    const childName = child?.full_name?.split(" ")[0] || "crianca";
    const otherMembers = await getOtherGroupMembers(supabase, groupId, user.id);
    if (otherMembers.length > 0) {
      await Promise.allSettled(otherMembers.map((uid) => createNotificationWithPush(uid, "system", "Vacina registrada", `💉 ${vaccineName}${doseLabel ? ` (${doseLabel})` : ""} — ${childName}`, "/saude/vacinas")));
    }
  } catch {
    // Push failure should not break the action
  }

  revalidatePath("/saude/vacinas");
  return { success: true };
}

// ---------------------------------------------------------------------------
// 12c. createVaccinationRecordsBulk (single round-trip for multiple vaccines)
// ---------------------------------------------------------------------------

interface BulkVaccineInput {
  vaccine_name: string;
  dose_label: string | null;
  administered_date: string | null;
  batch_number: string | null;
  location: string | null;
}

export async function createVaccinationRecordsBulk(
  groupId: string,
  childId: string,
  vaccines: BulkVaccineInput[],
): Promise<{ success: boolean; savedCount: number; error?: string }> {
  const supabase = await createClient();
  const user = await getAuthenticatedUser(supabase);
  await verifyMembership(supabase, groupId, user.id);

  if (vaccines.length === 0) return { success: false, savedCount: 0, error: "Nenhuma vacina selecionada" };

  const rows = vaccines.map((v) => ({
    group_id: groupId,
    child_id: childId,
    vaccine_name: sanitizeText(v.vaccine_name, 200),
    dose_label: sanitizeText(v.dose_label, 100) || null,
    administered_date: v.administered_date || null,
    batch_number: sanitizeText(v.batch_number, 100) || null,
    location: sanitizeText(v.location, 200) || null,
    notes: "Importado via leitura de carteirinha (IA)",
    created_by: user.id,
  }));

  const { error } = await supabase.from("vaccination_records").insert(rows);

  if (error) return { success: false, savedCount: 0, error: error.message };

  captureServerEvent(user.id, "vaccine_recorded");

  try {
    const { data: child } = await supabase.from("children").select("full_name").eq("id", childId).single();
    const childName = child?.full_name?.split(" ")[0] || "crianca";
    const otherMembers = await getOtherGroupMembers(supabase, groupId, user.id);
    if (otherMembers.length > 0) {
      await Promise.allSettled(otherMembers.map((uid) => createNotificationWithPush(uid, "system", "Vacinas registradas", `💉 ${rows.length} vacina(s) importada(s) — ${childName}`, "/saude/vacinas")));
    }
  } catch {
    // Push failure should not break the action
  }

  revalidatePath("/saude/vacinas");
  return { success: true, savedCount: rows.length };
}

// ---------------------------------------------------------------------------
// 13. createGrowthRecord
// ---------------------------------------------------------------------------

export async function trackHealthView(formData: FormData) {
  const supabase = await createClient();
  const user = await getAuthenticatedUser(supabase);

  const recordType = formData.get("recordType") as string;
  const recordId = formData.get("recordId") as string | null;
  const childId = formData.get("childId") as string;
  const groupId = formData.get("groupId") as string;

  await verifyMembership(supabase, groupId, user.id);

  // Upsert — update viewed_at if already exists
  // Handle NULL record_id separately since UNIQUE constraints treat NULL != NULL
  if (recordId) {
    await supabase.from("health_views").upsert(
      {
        group_id: groupId,
        record_type: recordType,
        record_id: recordId,
        child_id: childId,
        viewed_by: user.id,
        viewed_at: new Date().toISOString(),
      },
      {
        onConflict: "record_type,record_id,viewed_by",
      },
    );
  } else {
    // For NULL record_id, check existence first then insert or update
    const { data: existing } = await supabase
      .from("health_views")
      .select("id")
      .eq("record_type", recordType)
      .is("record_id", null)
      .eq("viewed_by", user.id)
      .single();

    if (existing) {
      await supabase.from("health_views")
        .update({ viewed_at: new Date().toISOString(), child_id: childId })
        .eq("id", existing.id);
    } else {
      await supabase.from("health_views").insert({
        group_id: groupId,
        record_type: recordType,
        record_id: null,
        child_id: childId,
        viewed_by: user.id,
        viewed_at: new Date().toISOString(),
      });
    }
  }
}

// ---------------------------------------------------------------------------
// 14. createGrowthRecord
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
  const notes = sanitizeText(formData.get("notes") as string, 2000);

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

  // Push notification to other group members
  try {
    const { data: child } = await supabase.from("children").select("full_name").eq("id", childId).single();
    const childName = child?.full_name?.split(" ")[0] || "crianca";
    const otherMembers = await getOtherGroupMembers(supabase, groupId, user.id);
    if (otherMembers.length > 0) {
      const parts: string[] = [];
      if (weightKg) parts.push(`${weightKg}kg`);
      if (heightCm) parts.push(`${heightCm}cm`);
      await Promise.allSettled(otherMembers.map((uid) => createNotificationWithPush(uid, "system", "Medida registrada", `📏 ${childName}: ${parts.join(", ") || "nova medida"}`, "/saude/crescimento")));
    }
  } catch {
    // Push failure should not break the action
  }

  revalidatePath("/saude/crescimento");
  redirect("/saude/crescimento?success=Medida+registrada");
}

// ---------------------------------------------------------------------------
// regenerateEmergencyToken
// ---------------------------------------------------------------------------

export async function regenerateEmergencyToken(formData: FormData) {
  const supabase = await createClient();
  const user = await getAuthenticatedUser(supabase);

  const childId = formData.get("childId") as string;
  const groupId = formData.get("groupId") as string;

  if (!childId || !groupId) {
    redirect("/saude/emergencia?error=" + encodeURIComponent("Dados inválidos."));
  }

  await verifyMembership(supabase, groupId, user.id);
  await verifyChildInGroup(supabase, childId, groupId);

  const serviceClient = getServiceClient();

  const { error } = await serviceClient
    .from("children")
    .update({ emergency_token: crypto.randomUUID() })
    .eq("id", childId);

  if (error) {
    redirect("/saude/emergencia?error=" + encodeURIComponent(error.message));
  }

  revalidatePath("/saude/emergencia");
  redirect(`/saude/emergencia?crianca=${childId}&success=` + encodeURIComponent("QR Code regenerado com sucesso."));
}

// ---------------------------------------------------------------------------
// Symptom Diary
// ---------------------------------------------------------------------------

export async function createSymptomEntry(
  formData: FormData,
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();
  const user = await getAuthenticatedUser(supabase);

  const groupId = formData.get("groupId") as string;
  await verifyMembership(supabase, groupId, user.id);

  const childId = formData.get("childId") as string;
  const symptomType = formData.get("symptomType") as string;
  const intensity = (formData.get("intensity") as string) || null;
  const temperatureStr = formData.get("temperature") as string;
  const temperature = temperatureStr ? parseFloat(temperatureStr) : null;
  const notes = sanitizeText(formData.get("notes") as string, 500);
  const illnessEpisodeId =
    (formData.get("illnessEpisodeId") as string) || null;

  const { error } = await supabase.from("symptom_entries").insert({
    group_id: groupId,
    child_id: childId,
    symptom_type: symptomType,
    intensity,
    temperature:
      temperature && temperature >= 35 && temperature <= 43
        ? temperature
        : null,
    notes: notes || null,
    illness_episode_id: illnessEpisodeId || null,
    created_by: user.id,
  });

  if (error) return { success: false, error: error.message };

  captureServerEvent(user.id, "symptom_logged");

  try {
    const { data: child } = await supabase
      .from("children")
      .select("full_name")
      .eq("id", childId)
      .single();
    const childName = child?.full_name?.split(" ")[0] || "crianca";
    const symptomLabels: Record<string, string> = {
      febre: "\uD83C\uDF21\uFE0F Febre",
      vomito: "\uD83E\uDD2E Vomito",
      diarreia: "\uD83D\uDCA9 Diarreia",
      tosse: "\uD83D\uDE37 Tosse",
      dor: "\uD83D\uDE23 Dor",
      mancha: "\uD83D\uDD34 Mancha",
      falta_apetite: "\uD83C\uDF7D\uFE0F Sem apetite",
      outro: "\uD83D\uDCDD Outro",
    };
    const label = symptomLabels[symptomType] || symptomType;
    const tempSuffix = temperature ? ` ${temperature}\u00B0C` : "";
    const otherMembers = await getOtherGroupMembers(
      supabase,
      groupId,
      user.id,
    );
    if (otherMembers.length > 0) {
      await Promise.allSettled(otherMembers.map((uid) => createNotificationWithPush(uid, "system", `Sintoma registrado — ${childName}`, `${label}${tempSuffix}${intensity ? ` (${intensity})` : ""}`, "/saude/sintomas")));
    }
  } catch {
    // Push failure should not break the action
  }

  revalidatePath("/saude/sintomas");
  revalidatePath("/saude");
  return { success: true };
}

// ---------------------------------------------------------------------------
// Combined Wizard: createIllnessWithMedicationAndAppointment
// ---------------------------------------------------------------------------

export async function createIllnessWithMedicationAndAppointment(
  formData: FormData,
) {
  const supabase = await createClient();
  const user = await getAuthenticatedUser(supabase);

  const groupId = formData.get("groupId") as string;
  await verifyMembership(supabase, groupId, user.id);

  const childId = formData.get("childId") as string;

  // --- Step 1: Illness ---
  const title = sanitizeText(formData.get("title") as string, 200);
  const symptomsRaw = formData.get("symptoms") as string;
  const symptoms = symptomsRaw
    ? symptomsRaw.split(",").map((s) => s.trim().slice(0, 100)).filter(Boolean)
    : [];
  const startDate = formData.get("startDate") as string;
  const severity = formData.get("severity") as string;
  const hospitalVisit = formData.get("hospitalVisit") === "true";
  const hospitalName = formData.get("hospitalName") as string;

  const illnessData: Record<string, unknown> = {
    group_id: groupId,
    child_id: childId,
    title,
    symptoms,
    start_date: startDate || null,
    created_by: user.id,
  };
  if (severity) illnessData.severity = severity;
  if (hospitalVisit) illnessData.hospital_visit = true;
  if (hospitalName) illnessData.hospital_name = hospitalName;

  const { data: illnessRow, error: illErr } = await supabase
    .from("illness_episodes")
    .insert(illnessData)
    .select("id")
    .single();

  if (illErr) redirect("/saude?error=" + encodeURIComponent(illErr.message));

  const illnessEpisodeId = illnessRow?.id || null;
  captureServerEvent(user.id, "illness_reported", { title });

  // --- Step 2: Medication (optional) ---
  const medName = sanitizeText(formData.get("medName") as string, 200);
  if (medName) {
    const medDosage = sanitizeText(formData.get("medDosage") as string, 200);
    const medFrequency = sanitizeText(formData.get("medFrequency") as string, 200);
    const medFrequencyHours = formData.get("medFrequencyHours") as string;
    const medStartDate = formData.get("medStartDate") as string;
    const medEndDate = formData.get("medEndDate") as string;

    const { data: med, error: medErr } = await supabase
      .from("active_medications")
      .insert({
        group_id: groupId,
        child_id: childId,
        name: medName,
        dosage: medDosage || "Conforme prescrito",
        frequency: medFrequency || "Conforme prescrito",
        frequency_hours: medFrequencyHours ? parseInt(medFrequencyHours, 10) : null,
        reason: title,
        illness_episode_id: illnessEpisodeId,
        start_date: medStartDate || startDate || new Date().toISOString().slice(0, 10),
        end_date: medEndDate || null,
        created_by: user.id,
      })
      .select("id")
      .single();

    if (medErr) {
      // Illness was created but medication failed — report partial success
      revalidatePath("/saude");
      redirect("/saude?error=" + encodeURIComponent("Doenca registrada, mas erro ao criar medicamento: " + medErr.message));
    }
    if (med) {
      captureServerEvent(user.id, "medication_created", { name: medName });
    }
  }

  // --- Step 3: Appointment (optional) ---
  const aptTitle = sanitizeText(formData.get("aptTitle") as string, 200);
  if (aptTitle) {
    const aptDate = formData.get("aptDate") as string;
    const aptTime = formData.get("aptTime") as string;
    const aptLocation = sanitizeText(formData.get("aptLocation") as string, 200);
    const aptType = formData.get("aptType") as string;

    if (aptDate && aptTime) {
      const aptDatetime = `${aptDate}T${aptTime}:00-03:00`;
      const aptData: Record<string, unknown> = {
        group_id: groupId,
        child_id: childId,
        title: aptTitle,
        appointment_date: aptDatetime,
        location: aptLocation || null,
        created_by: user.id,
      };
      if (aptType) aptData.appointment_type = aptType;

      const { data: apt, error: aptErr } = await supabase
        .from("medical_appointments")
        .insert(aptData)
        .select("id")
        .single();

      if (aptErr) {
        revalidatePath("/saude");
        redirect("/saude?error=" + encodeURIComponent("Doenca registrada, mas erro ao criar consulta: " + aptErr.message));
      }
      if (apt) {
        captureServerEvent(user.id, "appointment_created", { appointmentType: aptType });

        // Create calendar event
        try {
          const serviceClient = getServiceClient();
          const { data: calEvent } = await serviceClient
            .from("custody_events")
            .insert({
              group_id: groupId,
              child_id: childId,
              responsible_user_id: user.id,
              start_date: aptDate,
              end_date: aptDate,
              custody_type: "special",
              notes: `Consulta: ${aptTitle}`,
              created_by: user.id,
            })
            .select("id")
            .single();
          if (calEvent) {
            await serviceClient
              .from("medical_appointments")
              .update({ calendar_event_id: calEvent.id })
              .eq("id", apt.id);
          }
        } catch {
          // Calendar sync failure should not break the action
        }
      }
    }
  }

  // --- Notifications ---
  try {
    const { data: child } = await supabase.from("children").select("full_name").eq("id", childId).single();
    const childName = child?.full_name?.split(" ")[0] || "crianca";
    const sevEmoji = severity === "grave" ? "\uD83D\uDD34" : severity === "moderado" ? "\uD83D\uDFE1" : "\uD83D\uDFE2";
    let chatMsg = `\uD83E\uDD12 Registrou doenca: ${title} ${sevEmoji} (${childName})`;
    if (medName) chatMsg += ` + \uD83D\uDC8A ${medName}`;
    if (aptTitle) chatMsg += ` + \uD83D\uDCC5 Consulta agendada`;

    await postChatNotification(supabase, groupId, user.id, chatMsg);

    const otherMembers = await getOtherGroupMembers(supabase, groupId, user.id);
    if (otherMembers.length > 0) {
      await Promise.allSettled(otherMembers.map((uid) => createNotificationWithPush(uid, "system", `${childName} esta doente`, `${title} (${severity || "leve"})${medName ? ` + ${medName}` : ""}`, "/saude")));
    }
  } catch {
    // Notification failure should not break the action
  }

  revalidatePath("/saude");
  revalidatePath("/saude/doencas");
  revalidatePath("/saude/medicamentos");
  revalidatePath("/saude/consultas");
  revalidatePath("/chat");
  redirect("/saude?success=" + encodeURIComponent("Registro completo — doenca" + (medName ? " + medicamento" : "") + (aptTitle ? " + consulta" : "")));
}

// ---------------------------------------------------------------------------
// Quick Action: resolveIllnessQuick
// ---------------------------------------------------------------------------

export async function resolveIllnessQuick(
  formData: FormData,
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();
  const user = await getAuthenticatedUser(supabase);

  const episodeId = formData.get("episodeId") as string;
  const finishMeds = formData.get("finishMeds") === "true";

  const groupId = await getGroupIdFromRecord(supabase, "illness_episodes", episodeId, user.id);

  const { error } = await supabase
    .from("illness_episodes")
    .update({
      status: "resolved",
      end_date: new Date().toISOString().slice(0, 10),
    })
    .eq("id", episodeId);

  if (error) return { success: false, error: error.message };

  // Optionally finish related medications
  if (finishMeds) {
    // First try by illness_episode_id (new FK), fallback to text match for legacy data
    const { data: byEpisodeId } = await supabase
      .from("active_medications")
      .update({ status: "completed", end_date: new Date().toISOString().slice(0, 10) })
      .eq("illness_episode_id", episodeId)
      .eq("status", "active")
      .select("id");

    // Fallback: if no medications found by FK, try legacy text match
    if (!byEpisodeId || byEpisodeId.length === 0) {
      const { data: episode } = await supabase
        .from("illness_episodes")
        .select("child_id, title")
        .eq("id", episodeId)
        .single();

      if (episode) {
        await supabase
          .from("active_medications")
          .update({ status: "completed", end_date: new Date().toISOString().slice(0, 10) })
          .eq("child_id", episode.child_id)
          .eq("reason", episode.title)
          .eq("status", "active");
      }
    }
  }

  // Notify co-parent
  try {
    const { data: episode } = await supabase
      .from("illness_episodes")
      .select("title, child_id")
      .eq("id", episodeId)
      .single();
    if (episode) {
      const { data: child } = await supabase.from("children").select("full_name").eq("id", episode.child_id).single();
      const childName = child?.full_name?.split(" ")[0] || "crianca";
      await postChatNotification(
        supabase, groupId as string, user.id,
        `\u2705 ${episode.title} resolvida (${childName})${finishMeds ? " — medicamentos finalizados" : ""}`
      );
    }
  } catch {
    // Notification failure should not break the action
  }

  revalidatePath("/saude");
  revalidatePath("/saude/doencas");
  revalidatePath("/saude/medicamentos");
  revalidatePath("/chat");
  return { success: true };
}

// ---------------------------------------------------------------------------
// Quick Action: addEvolutionQuick (no redirect, returns result)
// ---------------------------------------------------------------------------

export async function addEvolutionQuick(
  formData: FormData,
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();
  const user = await getAuthenticatedUser(supabase);

  const episodeId = formData.get("episodeId") as string;
  const type = formData.get("type") as string; // "improving" | "worsening"
  const note = sanitizeText(formData.get("note") as string, 500);

  await getGroupIdFromRecord(supabase, "illness_episodes", episodeId, user.id);

  const { data: episode } = await supabase
    .from("illness_episodes")
    .select("notes, title, group_id, child_id")
    .eq("id", episodeId)
    .single();

  if (!episode) return { success: false, error: "Episodio nao encontrado" };

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", user.id)
    .single();

  const authorName = profile?.full_name?.split(" ")[0] || "Responsavel";
  const now = new Date();
  const dateStr = now.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "America/Sao_Paulo" });
  const timeStr = now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });

  const typeLabel = type === "improving" ? "melhorou" : "piorou";
  const evolutionText = note ? `${typeLabel}: ${note}` : typeLabel;
  const newEntry = `[${dateStr} ${timeStr} - ${authorName}] ${evolutionText}`;
  const updatedNotes = episode.notes ? `${newEntry}\n${episode.notes}` : newEntry;

  const { error } = await supabase
    .from("illness_episodes")
    .update({ notes: updatedNotes })
    .eq("id", episodeId);

  if (error) return { success: false, error: error.message };

  // Notify
  try {
    const { data: child } = await supabase.from("children").select("full_name").eq("id", episode.child_id).single();
    const childName = child?.full_name?.split(" ")[0] || "crianca";
    const emoji = type === "improving" ? "\uD83D\uDCC8" : "\uD83D\uDCC9";
    await postChatNotification(
      supabase, episode.group_id, user.id,
      `${emoji} ${episode.title} (${childName}): ${evolutionText}`
    );
  } catch {
    // Notification failure should not break the action
  }

  revalidatePath("/saude");
  revalidatePath("/saude/doencas");
  revalidatePath("/chat");
  return { success: true };
}
