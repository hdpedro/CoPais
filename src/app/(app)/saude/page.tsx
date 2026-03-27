import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getActiveGroup } from "@/lib/group-utils";
import { compareVaccinations } from "@/lib/sbp-vaccine-calendar";
import { getBrazilToday } from "@/lib/calendar-utils";
import { getDisplayName } from "@/lib/constants";
import dynamic from "next/dynamic";
import { type SaudeClientProps } from "./SaudeClient";

const SaudeClient = dynamic(() => import("./SaudeClient"), {
  loading: () => <div className="animate-pulse bg-gray-100 rounded-xl h-96" />,
});

export default async function SaudePage({
  searchParams,
}: {
  searchParams: Promise<{ crianca?: string; success?: string; error?: string }>;
}) {
  const params = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const activeGroup = await getActiveGroup(supabase, user.id);
  if (!activeGroup) redirect("/onboarding");
  const { groupId, isReadonly } = activeGroup;

  const { data: children } = await supabase
    .from("children")
    .select("id, full_name, birth_date")
    .eq("group_id", groupId)
    .order("birth_date");

  if (!children || children.length === 0) {
    const emptyProps: SaudeClientProps = {
      children: [],
      selectedChildId: "",
      selectedChild: { id: "", full_name: "", birth_date: "" },
      childFirstName: "",
      isReadonly,
      userId: user.id,
      groupId,
      successMessage: params.success ? decodeURIComponent(params.success) : null,
      errorMessage: params.error ? decodeURIComponent(params.error) : null,
      activeIllnesses: [],
      hasActiveIllness: false,
      medications: [],
      hasActiveMeds: false,
      urgentMedsCount: 0,
      primaryIllness: null,
      otherIllnesses: [],
      primaryMed: null,
      allergies: [],
      hasAllergies: false,
      appointment: null,
      pendingReturns: [],
      illnessCount: 0,
      vaccineCount: 0,
      growthCount: 0,
      appointmentCount: 0,
      professionalsCount: 0,
      overdueVaccineCount: 0,
      lastUpdateRelative: null,
      healthViews: [],
    };
    return <SaudeClient {...emptyProps} />;
  }

  const selectedChildId =
    params.crianca && children.find((c) => c.id === params.crianca)
      ? params.crianca
      : children[0].id;

  const selectedChild = children.find((c) => c.id === selectedChildId)!;
  const todayDate = getBrazilToday();
  const today = todayDate + "T23:59:59-03:00";
  const todayStart = todayDate + "T00:00:00-03:00";

  // Fetch all data in parallel
  const [
    { data: activeIllnesses },
    { data: medications },
    { data: allergies },
    { data: nextAppointment },
    { data: pendingReturns },
    { data: recentDoses },
    { count: illnessCount },
    { count: vaccineCount },
    { count: growthCount },
    { count: appointmentCount },
    { count: professionalsCount },
    { data: vaccineRecordsForComparison },
    { data: healthViews },
  ] = await Promise.all([
    supabase
      .from("illness_episodes")
      .select("id, title, severity, status, symptoms, hospital_visit, hospital_name, start_date, created_at, notes, profiles:created_by(full_name)")
      .eq("child_id", selectedChildId)
      .eq("status", "active")
      .order("created_at", { ascending: false }),

    supabase
      .from("active_medications")
      .select("id, name, dosage, frequency, frequency_hours, start_date, end_date, reason, created_at, profiles:created_by(full_name)")
      .eq("child_id", selectedChildId)
      .eq("status", "active"),

    supabase
      .from("child_allergies")
      .select("id, name, allergy_type, severity, reaction")
      .eq("child_id", selectedChildId)
      .order("severity"),

    supabase
      .from("medical_appointments")
      .select("id, title, appointment_type, appointment_date, location, medical_professionals(name, specialty)")
      .eq("child_id", selectedChildId)
      .eq("status", "scheduled")
      .gte("appointment_date", todayStart)
      .order("appointment_date", { ascending: true })
      .limit(1),

    supabase
      .from("medical_appointments")
      .select("id, title, return_date, return_notes, appointment_type, medical_professionals(name, specialty)")
      .eq("child_id", selectedChildId)
      .not("return_date", "is", null)
      .gte("return_date", todayDate)
      .neq("status", "cancelled")
      .order("return_date", { ascending: true })
      .limit(5),

    supabase
      .from("medication_doses")
      .select("id, medication_id, administered_at, administered_by, profiles:administered_by(full_name), active_medications!inner(child_id)")
      .eq("active_medications.child_id", selectedChildId)
      .order("administered_at", { ascending: false })
      .limit(50),

    supabase.from("illness_episodes").select("id", { count: "exact", head: true }).eq("child_id", selectedChildId),
    supabase.from("vaccination_records").select("id", { count: "exact", head: true }).eq("child_id", selectedChildId),
    supabase.from("growth_records").select("id", { count: "exact", head: true }).eq("child_id", selectedChildId),
    supabase.from("medical_appointments").select("id", { count: "exact", head: true }).eq("child_id", selectedChildId),
    supabase.from("medical_professionals").select("id", { count: "exact", head: true }).eq("group_id", groupId),
    supabase.from("vaccination_records").select("vaccine_name, dose_label, administered_date").eq("child_id", selectedChildId).order("administered_date", { ascending: false }),
    // Health views — moved into parallel batch (was a sequential query after Promise.all)
    supabase
      .from("health_views")
      .select("viewed_by, viewed_at, record_type, record_id, profiles:viewed_by(full_name)")
      .eq("group_id", groupId)
      .eq("child_id", selectedChildId)
      .order("viewed_at", { ascending: false })
      .limit(20),
  ]);

  // SBP Vaccine Comparison for overdue badge
  const vaccineComparison = compareVaccinations(
    selectedChild.birth_date,
    vaccineRecordsForComparison || []
  );
  const overdueVaccineCount = vaccineComparison.overdue.length;

  const appointment = nextAppointment?.[0] || null;
  const hasActiveIllness = (activeIllnesses?.length ?? 0) > 0;
  const hasActiveMeds = (medications?.length ?? 0) > 0;
  const hasAllergies = (allergies?.length ?? 0) > 0;
  const childFirstName = selectedChild.full_name.split(" ")[0];

  // ─── Helper functions ───

  function getNextDose(med: any) {
    if (!med.frequency_hours || med.frequency_hours === 0) return null;
    const medDoses = recentDoses?.filter((d) => d.medication_id === med.id) || [];
    if (medDoses.length === 0) {
      const start = new Date(med.start_date + "T08:00:00");
      if (start.getTime() > Date.now()) return { time: start, overdue: false, lastBy: null, lastDoseMinutesAgo: null };
      return { time: new Date(), overdue: true, lastBy: null, lastDoseMinutesAgo: null };
    }
    const lastDose = medDoses[0];
    const lastTime = new Date(lastDose.administered_at);
    const nextTime = new Date(lastTime.getTime() + med.frequency_hours * 60 * 60 * 1000);
    const lastByName = getDisplayName((lastDose.profiles as any)?.full_name, true) || null;
    const lastDoseMinutesAgo = (Date.now() - lastTime.getTime()) / (1000 * 60);
    return {
      time: nextTime,
      overdue: nextTime.getTime() < Date.now(),
      lastBy: lastByName,
      lastDoseMinutesAgo,
    };
  }

  function getMedProgress(startDate: string, endDate: string | null) {
    if (!endDate) return null;
    const start = new Date(startDate).getTime();
    const end = new Date(endDate).getTime();
    const now = Date.now();
    const totalDays = Math.max(1, Math.ceil((end - start) / (1000 * 60 * 60 * 24)));
    const elapsedDays = Math.max(0, Math.ceil((now - start) / (1000 * 60 * 60 * 24)));
    const percent = Math.min(100, Math.round((elapsedDays / totalDays) * 100));
    return { totalDays, elapsedDays: Math.min(elapsedDays, totalDays), percent };
  }

  function getEvolutionTrend(notes: string | null): { label: string; icon: string; color: string; textColor: string } {
    if (!notes) return { label: "Estável", icon: "➡️", color: "bg-white/20", textColor: "text-red-100" };
    const lines = notes.split("\n").filter(Boolean).slice(0, 3);
    if (lines.length === 0) return { label: "Estável", icon: "➡️", color: "bg-white/20", textColor: "text-red-100" };
    const positiveWords = /melhorou|sem febre/i;
    const negativeWords = /piorou|febre|vomito|vômito/i;
    const lastLine = lines[0];
    const lastPositive = positiveWords.test(lastLine);
    const lastNegative = negativeWords.test(lastLine);
    if (lastPositive && !lastNegative) return { label: "Melhorando", icon: "📈", color: "bg-green-400/20", textColor: "text-green-100" };
    if (lastNegative && !lastPositive) return { label: "Piorando", icon: "📉", color: "bg-red-900/30", textColor: "text-red-100" };
    return { label: "Estável", icon: "➡️", color: "bg-white/20", textColor: "text-red-100" };
  }

  function formatTime(date: Date) {
    return date.toLocaleTimeString("pt-BR", {
      timeZone: "America/Sao_Paulo",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  function formatRelativeTime(date: Date): string {
    const diffMs = Date.now() - date.getTime();
    const diffMin = Math.floor(diffMs / (1000 * 60));
    if (diffMin < 1) return "__now__";
    if (diffMin < 60) return `__min__${diffMin}`;
    const diffHours = Math.floor(diffMin / 60);
    if (diffHours < 24) return `__hours__${diffHours}`;
    const diffDays = Math.floor(diffHours / 24);
    return `__days__${diffDays}`;
  }

  // ─── Pre-compute serializable data ───

  // Last update timestamp
  const lastUpdateSources: (string | null | undefined)[] = [
    activeIllnesses?.[0]?.created_at,
    medications?.[0]?.created_at,
    recentDoses?.[0]?.administered_at,
    ...(allergies?.map(a => (a as any).created_at) || []),
  ].filter(Boolean);
  const lastUpdateTime = lastUpdateSources.length > 0
    ? new Date(Math.max(...lastUpdateSources.map(d => new Date(d!).getTime())))
    : null;
  const lastUpdateRelative = lastUpdateTime ? formatRelativeTime(lastUpdateTime) : null;

  // Process illnesses
  const processedIllnesses = (activeIllnesses || []).map(ill => ({
    id: ill.id,
    title: ill.title,
    severity: ill.severity,
    status: ill.status,
    symptoms: ill.symptoms,
    hospital_visit: ill.hospital_visit,
    hospital_name: ill.hospital_name,
    start_date: ill.start_date,
    created_at: ill.created_at,
    notes: ill.notes,
    authorName: getDisplayName((ill.profiles as any)?.full_name, true) || null,
    daysActive: Math.max(1, Math.ceil((Date.now() - new Date(ill.start_date + "T12:00:00").getTime()) / (1000 * 60 * 60 * 24))),
    trend: getEvolutionTrend(ill.notes),
  }));

  // Process medications
  const processedMeds = (medications || []).map(med => {
    const nd = getNextDose(med);
    return {
      id: med.id,
      name: med.name,
      dosage: med.dosage,
      frequency: med.frequency,
      frequency_hours: med.frequency_hours,
      start_date: med.start_date,
      end_date: med.end_date,
      reason: med.reason,
      created_at: med.created_at,
      authorName: getDisplayName((med.profiles as any)?.full_name, true) || null,
      doseInfo: nd ? {
        formattedTime: formatTime(nd.time),
        overdue: nd.overdue,
        lastBy: nd.lastBy,
        lastDoseMinutesAgo: nd.lastDoseMinutesAgo,
      } : null,
      progress: getMedProgress(med.start_date, med.end_date),
    };
  });

  // Urgent meds
  const urgentMedsCount = processedMeds.filter(m => m.doseInfo?.overdue).length;

  // Primary hero data
  const primaryIllness = processedIllnesses[0] || null;
  const otherIllnessesData = processedIllnesses.slice(1);

  // Primary medication (urgent first, then pending within 2h, then first med)
  const urgentMed = processedMeds.find(m => m.doseInfo?.overdue) || null;
  const primaryMed = urgentMed || processedMeds[0] || null;

  // Process appointment
  const processedAppointment = appointment ? {
    id: appointment.id,
    title: appointment.title,
    appointment_type: appointment.appointment_type,
    appointment_date: appointment.appointment_date,
    location: appointment.location,
    professionalName: (appointment.medical_professionals as any)?.name || null,
    professionalSpecialty: (appointment.medical_professionals as any)?.specialty || null,
    formattedDate: new Date(appointment.appointment_date).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "short" }),
    formattedTime: new Date(appointment.appointment_date).toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" }),
  } : null;

  // Process pending returns
  const processedReturns = (pendingReturns || []).map(apt => {
    const returnD = new Date(apt.return_date + "T12:00:00");
    const daysUntil = Math.ceil((returnD.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    return {
      id: apt.id,
      title: apt.title,
      return_date: apt.return_date,
      return_notes: apt.return_notes,
      appointment_type: apt.appointment_type,
      professionalSpecialty: (apt.medical_professionals as any)?.specialty || null,
      formattedDate: returnD.toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" }),
      daysUntil,
      isUrgent: daysUntil <= 7,
    };
  });

  // Process health views
  const processedHealthViews = (healthViews || []).map(v => ({
    viewed_by: v.viewed_by,
    viewed_at: v.viewed_at,
    record_type: v.record_type,
    record_id: v.record_id,
    profiles: v.profiles ? { full_name: (v.profiles as any).full_name } : null,
  }));

  // Process allergies
  const processedAllergies = (allergies || []).map(a => ({
    id: a.id,
    name: a.name,
    allergy_type: a.allergy_type,
    severity: a.severity,
    reaction: a.reaction,
  }));

  const clientProps: SaudeClientProps = {
    children: children.map(c => ({ id: c.id, full_name: c.full_name, birth_date: c.birth_date })),
    selectedChildId,
    selectedChild: { id: selectedChild.id, full_name: selectedChild.full_name, birth_date: selectedChild.birth_date },
    childFirstName,
    isReadonly,
    userId: user.id,
    groupId,
    successMessage: params.success ? decodeURIComponent(params.success) : null,
    errorMessage: params.error ? decodeURIComponent(params.error) : null,
    activeIllnesses: processedIllnesses,
    hasActiveIllness,
    medications: processedMeds,
    hasActiveMeds,
    urgentMedsCount,
    primaryIllness,
    otherIllnesses: otherIllnessesData,
    primaryMed,
    allergies: processedAllergies,
    hasAllergies,
    appointment: processedAppointment,
    pendingReturns: processedReturns,
    illnessCount: illnessCount ?? 0,
    vaccineCount: vaccineCount ?? 0,
    growthCount: growthCount ?? 0,
    appointmentCount: appointmentCount ?? 0,
    professionalsCount: professionalsCount ?? 0,
    overdueVaccineCount,
    lastUpdateRelative,
    healthViews: processedHealthViews,
  };

  return <SaudeClient {...clientProps} />;
}
