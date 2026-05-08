import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getActiveGroup } from "@/lib/group-utils";
import { compareVaccinations } from "@/lib/sbp-vaccine-calendar";
import { getBrazilToday } from "@/lib/calendar-utils";
import HealthReportClient, { type MedicalInfo, type Illness, type Appointment } from "./HealthReportClient";

export default async function HealthExportPage({
  searchParams,
}: {
  searchParams: Promise<{ childId?: string }>;
}) {
  const params = await searchParams;
  const childId = params.childId;
  if (!childId) redirect("/saude");

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const activeGroup = await getActiveGroup(supabase, user.id);
  if (!activeGroup) redirect("/onboarding");
  const { groupId } = activeGroup;

  // Verify child belongs to group
  const { data: child } = await supabase
    .from("children")
    .select("id, full_name, birth_date")
    .eq("id", childId)
    .eq("group_id", groupId)
    .single();

  if (!child) redirect("/saude");

  // Fetch all health data in parallel
  const [
    { data: medicalInfo },
    { data: allergies },
    { data: medications },
    { data: illnesses },
    { data: appointments },
    { data: vaccinations },
    { data: growthRecords },
    { data: professionals },
  ] = await Promise.all([
    supabase
      .from("child_medical_info")
      .select("blood_type, insurance_name, insurance_number, sus_number, primary_pediatrician_id, medical_professionals(name, specialty, crm, phone)")
      .eq("child_id", childId)
      .maybeSingle(),
    supabase
      .from("child_allergies")
      .select("name, allergy_type, severity, reaction")
      .eq("child_id", childId)
      .order("severity"),
    supabase
      .from("active_medications")
      .select("name, dosage, frequency, start_date, end_date, status, reason, prescribed_by")
      .eq("child_id", childId)
      .in("status", ["active", "paused"])
      .order("start_date", { ascending: false }),
    supabase
      .from("illness_episodes")
      .select("title, symptoms, start_date, end_date, status, diagnosis, severity, hospital_visit, notes")
      .eq("child_id", childId)
      .order("start_date", { ascending: false }),
    supabase
      .from("medical_appointments")
      .select("title, appointment_date, appointment_type, location, status, summary, diagnosis, medical_professionals(name)")
      .eq("child_id", childId)
      .order("appointment_date", { ascending: false }),
    supabase
      .from("vaccination_records")
      .select("vaccine_name, dose_label, administered_date, batch_number, location")
      .eq("child_id", childId)
      .order("administered_date", { ascending: true }),
    supabase
      .from("growth_records")
      .select("measured_date, weight_kg, height_cm, head_cm")
      .eq("child_id", childId)
      .order("measured_date", { ascending: false })
      .limit(5),
    supabase
      .from("medical_professionals")
      .select("name, specialty, crm, phone, whatsapp")
      .eq("group_id", groupId)
      .order("name"),
  ]);

  // Calculate age
  const birth = new Date(child.birth_date + "T12:00:00");
  const todayParts = getBrazilToday().split("-").map(Number);
  const now = new Date(todayParts[0], todayParts[1] - 1, todayParts[2], 12, 0, 0);
  const ageYears = now.getFullYear() - birth.getFullYear();
  const ageMonths = now.getMonth() - birth.getMonth();
  const totalMonths = ageYears * 12 + ageMonths;
  const ageLabel =
    totalMonths < 24
      ? `${totalMonths} meses`
      : `${Math.floor(totalMonths / 12)} anos e ${totalMonths % 12} meses`;

  // Vaccine comparison
  const vaccineComparison = compareVaccinations(
    child.birth_date,
    vaccinations || [],
  );

  const generatedDate = now.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    timeZone: "America/Sao_Paulo",
  });

  const generatedTime = now.toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  });

  return (
    <HealthReportClient
      child={{ full_name: child.full_name, birth_date: child.birth_date }}
      ageLabel={ageLabel}
      generatedDate={generatedDate}
      generatedTime={generatedTime}
      medicalInfo={medicalInfo as unknown as MedicalInfo | null}
      allergies={allergies}
      medications={medications}
      illnesses={illnesses as unknown as Illness[] | null}
      appointments={appointments as unknown as Appointment[] | null}
      vaccinations={vaccinations}
      growthRecords={growthRecords}
      professionals={professionals}
      vaccineComparison={vaccineComparison}
    />
  );
}
