import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getActiveGroup } from "@/lib/group-utils";
import ResumoConsultaClient from "./ResumoConsultaClient";

export default async function ResumoConsultaPage({
  searchParams,
}: {
  searchParams: Promise<{ crianca?: string }>;
}) {
  const params = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const activeGroup = await getActiveGroup(supabase, user.id);
  if (!activeGroup) redirect("/onboarding");
  const { groupId } = activeGroup;

  const { data: children } = await supabase
    .from("children")
    .select("id, full_name, birth_date, sex")
    .eq("group_id", groupId)
    .order("birth_date");

  if (!children || children.length === 0) redirect("/saude");

  const selectedChildId =
    params.crianca && children.find((c) => c.id === params.crianca)
      ? params.crianca
      : children[0].id;

  const child = children.find((c) => c.id === selectedChildId)!;

  // Find last completed appointment
  const { data: lastAppointments } = await supabase
    .from("medical_appointments")
    .select("id, appointment_date, title")
    .eq("child_id", selectedChildId)
    .eq("status", "completed")
    .order("appointment_date", { ascending: false })
    .limit(1);

  const lastAppointment = lastAppointments?.[0] || null;
  const sinceDate = lastAppointment
    ? lastAppointment.appointment_date.split("T")[0]
    : child.birth_date;

  // Fetch all health data since last appointment in parallel
  const [
    { data: illnesses },
    { data: medications },
    { data: vaccines },
    { data: growthRecords },
    { data: allergies },
    { data: medicalInfo },
    { data: symptoms },
    { data: pastAppointments },
  ] = await Promise.all([
    supabase
      .from("illness_episodes")
      .select(
        "title, symptoms, start_date, end_date, status, severity, hospital_visit, diagnosis, notes"
      )
      .eq("child_id", selectedChildId)
      .gte("start_date", sinceDate)
      .order("start_date", { ascending: false }),
    supabase
      .from("active_medications")
      .select(
        "id, name, dosage, frequency, frequency_hours, start_date, end_date, status, reason"
      )
      .eq("child_id", selectedChildId)
      .or(`start_date.gte.${sinceDate},status.eq.active`),
    supabase
      .from("vaccination_records")
      .select("vaccine_name, dose_label, administered_date")
      .eq("child_id", selectedChildId)
      .gte("administered_date", sinceDate)
      .order("administered_date", { ascending: false }),
    supabase
      .from("growth_records")
      .select("measured_date, weight_kg, height_cm, head_cm")
      .eq("child_id", selectedChildId)
      .gte("measured_date", sinceDate)
      .order("measured_date", { ascending: false })
      .limit(5),
    supabase
      .from("child_allergies")
      .select("name, allergy_type, severity, reaction")
      .eq("child_id", selectedChildId),
    supabase
      .from("child_medical_info")
      .select("blood_type, insurance_name, insurance_number")
      .eq("child_id", selectedChildId)
      .maybeSingle(),
    supabase
      .from("symptom_entries")
      .select("symptom_type, temperature, intensity, recorded_at, notes")
      .eq("child_id", selectedChildId)
      .gte("recorded_at", new Date(sinceDate + "T00:00:00").toISOString())
      .order("recorded_at", { ascending: false }),
    supabase
      .from("medical_appointments")
      .select(
        "title, appointment_date, appointment_type, status, diagnosis, summary"
      )
      .eq("child_id", selectedChildId)
      .eq("status", "completed")
      .gte("appointment_date", sinceDate)
      .order("appointment_date", { ascending: false }),
  ]);

  // Calculate medication adherence for each active medication
  const medIds = (medications || [])
    .filter((m) => m.status === "active")
    .map((m) => m.id);
  let doseLogs: { medication_id: string; administered_at: string }[] = [];
  if (medIds.length > 0) {
    const { data } = await supabase
      .from("medication_doses")
      .select("medication_id, administered_at")
      .in("medication_id", medIds)
      .gte(
        "administered_at",
        new Date(sinceDate + "T00:00:00").toISOString()
      );
    doseLogs = data || [];
  }

  // Calculate adherence per medication
  const medsWithAdherence = (medications || []).map((med) => {
    if (med.status !== "active" || !med.frequency_hours)
      return { ...med, adherence: null };
    const medDoses = doseLogs.filter((d) => d.medication_id === med.id);
    const startDate = new Date(
      Math.max(
        new Date(sinceDate).getTime(),
        new Date(med.start_date).getTime()
      )
    );
    const now = new Date();
    const hoursElapsed =
      (now.getTime() - startDate.getTime()) / (1000 * 60 * 60);
    const expectedDoses = Math.floor(hoursElapsed / med.frequency_hours);
    if (expectedDoses <= 0) return { ...med, adherence: 100 };
    const adherence = Math.min(
      100,
      Math.round((medDoses.length / expectedDoses) * 100)
    );
    return { ...med, adherence };
  });

  return (
    <ResumoConsultaClient
      child={child}
      childrenList={children}
      sinceDate={sinceDate}
      lastAppointmentTitle={lastAppointment?.title || null}
      illnesses={illnesses || []}
      medications={medsWithAdherence}
      vaccines={vaccines || []}
      growthRecords={(growthRecords || []).map((r) => ({
        ...r,
        weight_kg: r.weight_kg ? Number(r.weight_kg) : null,
        height_cm: r.height_cm ? Number(r.height_cm) : null,
        head_cm: r.head_cm ? Number(r.head_cm) : null,
      }))}
      allergies={allergies || []}
      medicalInfo={medicalInfo}
      symptoms={symptoms || []}
      pastAppointments={pastAppointments || []}
    />
  );
}
