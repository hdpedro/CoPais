import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getActiveGroup } from "@/lib/group-utils";
import { getVaccineStatus } from "@/lib/services/vaccines";
import { getBrazilToday } from "@/lib/calendar-utils";
import { getDisplayName } from "@/lib/constants";
import dynamic from "next/dynamic";
import { type SaudeClientProps } from "./SaudeClient";
import { type TimelineEvent } from "./HealthTimeline";

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
      preventiveCare: null,
      lastUpdateRelative: null,
      healthViews: [],
      timeline: [],
    };
    return <SaudeClient {...emptyProps} />;
  }

  const selectedChildId =
    params.crianca && children.find((c) => c.id === params.crianca)
      ? params.crianca
      : children[0].id;

  const selectedChild = children.find((c) => c.id === selectedChildId)!;
  const todayDate = getBrazilToday();
  const todayStart = todayDate + "T00:00:00-03:00";
  // Server component — runs once per request, Date.now() is safe here
  // eslint-disable-next-line react-hooks/purity
  const now = Date.now();

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
    vaccineStatusResult,
    { data: healthViews },
    { data: recentSymptoms },
    { data: recentCompletedApts },
    { data: recentGrowth },
    { data: recentIllnesses },
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
      .select("id, medication_id, administered_at, administered_by, profiles:administered_by(full_name), active_medications!inner(child_id, name)")
      .eq("active_medications.child_id", selectedChildId)
      .order("administered_at", { ascending: false })
      .limit(50),

    supabase.from("illness_episodes").select("id", { count: "exact", head: true }).eq("child_id", selectedChildId),
    supabase.from("vaccination_records").select("id", { count: "exact", head: true }).eq("child_id", selectedChildId),
    supabase.from("growth_records").select("id", { count: "exact", head: true }).eq("child_id", selectedChildId),
    supabase.from("medical_appointments").select("id", { count: "exact", head: true }).eq("child_id", selectedChildId),
    supabase.from("medical_professionals").select("id", { count: "exact", head: true }).eq("group_id", groupId),
    supabase.from("vaccination_records").select("vaccine_name, dose_label, administered_date").eq("child_id", selectedChildId).order("administered_date", { ascending: false }),
    // Motor de Saúde Preventiva — status calmo + nextDue (banco já mantém via triggers)
    getVaccineStatus(supabase, selectedChildId),
    // Health views — moved into parallel batch (was a sequential query after Promise.all)
    supabase
      .from("health_views")
      .select("viewed_by, viewed_at, record_type, record_id, profiles:viewed_by(full_name)")
      .eq("group_id", groupId)
      .eq("child_id", selectedChildId)
      .order("viewed_at", { ascending: false })
      .limit(20),
    // Timeline: recent symptom entries
    supabase
      .from("symptom_entries")
      .select("id, symptom_type, intensity, temperature, created_at, profiles:created_by(full_name)")
      .eq("child_id", selectedChildId)
      .order("created_at", { ascending: false })
      .limit(5),
    // Timeline: recent completed appointments
    supabase
      .from("medical_appointments")
      .select("id, title, appointment_date, appointment_type")
      .eq("child_id", selectedChildId)
      .eq("status", "completed")
      .order("appointment_date", { ascending: false })
      .limit(5),
    // Timeline: recent growth records
    supabase
      .from("growth_records")
      .select("id, weight_kg, height_cm, measurement_date")
      .eq("child_id", selectedChildId)
      .order("measurement_date", { ascending: false })
      .limit(3),
    // Timeline: recent illness episodes (all statuses, for timeline)
    supabase
      .from("illness_episodes")
      .select("id, title, start_date, status, created_at")
      .eq("child_id", selectedChildId)
      .order("created_at", { ascending: false })
      .limit(5),
  ]);

  // Motor de Saúde Preventiva — fonte de verdade vem do banco via getVaccineStatus.
  // vaccineRecordsForComparison continua disponível pra outros consumidores legados,
  // mas overdueVaccineCount agora vem do motor (com `historical_gap` excluído).
  const preventiveCare = vaccineStatusResult.ok
    ? {
        statusLabel: vaccineStatusResult.data.statusLabel,
        overdueCount: vaccineStatusResult.data.totals.overdue,
        dueSoonCount: vaccineStatusResult.data.totals.dueSoon,
        upcomingCount: vaccineStatusResult.data.totals.upcoming,
        historicalGapCount: vaccineStatusResult.data.totals.historicalGap,
        coveragePct: vaccineStatusResult.data.coveragePct,
        nextDue: vaccineStatusResult.data.nextDue,
      }
    : null;
  // Backwards compat — outros consumers leem só overdueVaccineCount.
  const overdueVaccineCount = preventiveCare?.overdueCount ?? 0;
  void vaccineRecordsForComparison;

  const appointment = nextAppointment?.[0] || null;
  const hasActiveIllness = (activeIllnesses?.length ?? 0) > 0;
  const hasActiveMeds = (medications?.length ?? 0) > 0;
  const hasAllergies = (allergies?.length ?? 0) > 0;
  const childFirstName = selectedChild.full_name.split(" ")[0];

  // ─── Helper functions ───

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function getNextDose(med: any) {
    const medDoses = recentDoses?.filter((d) => d.medication_id === med.id) || [];

    // SOS / "se necessário" medications (no fixed frequency)
    if (!med.frequency_hours || med.frequency_hours === 0) {
      if (medDoses.length === 0) return { time: null, overdue: false, lastBy: null, lastDoseMinutesAgo: null, onDemand: true };
      const lastDose = medDoses[0];
      const lastTime = new Date(lastDose.administered_at);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const lastByName = getDisplayName((lastDose.profiles as any)?.full_name, true) || null;
      const lastDoseMinutesAgo = (now - lastTime.getTime()) / (1000 * 60);
      return { time: null, overdue: false, lastBy: lastByName, lastDoseMinutesAgo, onDemand: true };
    }

    if (medDoses.length === 0) {
      const start = new Date(med.start_date + "T08:00:00");
      if (start.getTime() > now) return { time: start, overdue: false, lastBy: null, lastDoseMinutesAgo: null, onDemand: false };
      return { time: new Date(now), overdue: true, lastBy: null, lastDoseMinutesAgo: null, onDemand: false };
    }
    const lastDose = medDoses[0];
    const lastTime = new Date(lastDose.administered_at);
    const nextTime = new Date(lastTime.getTime() + med.frequency_hours * 60 * 60 * 1000);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const lastByName = getDisplayName((lastDose.profiles as any)?.full_name, true) || null;
    const lastDoseMinutesAgo = (now - lastTime.getTime()) / (1000 * 60);
    return {
      time: nextTime,
      overdue: nextTime.getTime() < now,
      lastBy: lastByName,
      lastDoseMinutesAgo,
      onDemand: false,
    };
  }

  function getMedProgress(startDate: string, endDate: string | null) {
    const start = new Date(startDate).getTime();
    if (!endDate) {
      const elapsedDays = Math.max(1, Math.ceil((now - start) / (1000 * 60 * 60 * 24)));
      return { totalDays: null, elapsedDays, percent: null, continuous: true };
    }
    const end = new Date(endDate).getTime();
    const totalDays = Math.max(1, Math.ceil((end - start) / (1000 * 60 * 60 * 24)));
    const elapsedDays = Math.max(0, Math.ceil((now - start) / (1000 * 60 * 60 * 24)));
    const percent = Math.min(100, Math.round((elapsedDays / totalDays) * 100));
    return { totalDays, elapsedDays: Math.min(elapsedDays, totalDays), percent, continuous: false };
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
    const diffMs = now - date.getTime();
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    authorName: getDisplayName((ill.profiles as any)?.full_name, true) || null,
    daysActive: Math.max(1, Math.ceil((now - new Date(ill.start_date + "T12:00:00").getTime()) / (1000 * 60 * 60 * 24))),
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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      authorName: getDisplayName((med.profiles as any)?.full_name, true) || null,
      doseInfo: nd ? {
        formattedTime: nd.time ? formatTime(nd.time) : null,
        overdue: nd.overdue,
        lastBy: nd.lastBy,
        lastDoseMinutesAgo: nd.lastDoseMinutesAgo,
        onDemand: nd.onDemand ?? false,
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    professionalName: (appointment.medical_professionals as any)?.name || null,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    professionalSpecialty: (appointment.medical_professionals as any)?.specialty || null,
    formattedDate: new Date(appointment.appointment_date).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "short" }),
    formattedTime: new Date(appointment.appointment_date).toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" }),
  } : null;

  // Process pending returns
  const processedReturns = (pendingReturns || []).map(apt => {
    const returnD = new Date(apt.return_date + "T12:00:00");
    const daysUntil = Math.ceil((returnD.getTime() - now) / (1000 * 60 * 60 * 24));
    return {
      id: apt.id,
      title: apt.title,
      return_date: apt.return_date,
      return_notes: apt.return_notes,
      appointment_type: apt.appointment_type,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
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

  // ─── Build timeline events ───
  const timelineEvents: TimelineEvent[] = [];

  // Illness events
  (recentIllnesses || []).forEach(ill => {
    timelineEvents.push({
      id: ill.id,
      type: "illness",
      title: ill.title,
      subtitle: ill.status === "resolved" ? "Recuperada" : ill.status === "active" ? "Ativa" : ill.status,
      timestamp: ill.created_at,
      relativeTime: formatRelativeTime(new Date(ill.created_at)),
      href: `/saude/doencas?crianca=${selectedChildId}`,
      icon: "🤒",
      color: "bg-red-50",
    });
  });

  // Dose events
  (recentDoses || []).slice(0, 5).forEach(dose => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const medName = (dose.active_medications as any)?.name || (medications || []).find(m => m.id === dose.medication_id)?.name || "Medicamento";
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const authorName = getDisplayName((dose.profiles as any)?.full_name, true) || null;
    timelineEvents.push({
      id: dose.id,
      type: "dose",
      title: `Dose: ${medName}`,
      subtitle: authorName ? `Por ${authorName}` : null,
      timestamp: dose.administered_at,
      relativeTime: formatRelativeTime(new Date(dose.administered_at)),
      href: `/saude/medicamentos/${dose.medication_id}`,
      icon: "💊",
      color: "bg-blue-50",
    });
  });

  // Symptom events
  (recentSymptoms || []).forEach(sym => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const authorName = getDisplayName((sym.profiles as any)?.full_name, true) || null;
    const tempSuffix = sym.temperature ? ` ${sym.temperature}°C` : "";
    timelineEvents.push({
      id: sym.id,
      type: "symptom",
      title: `${sym.symptom_type}${tempSuffix}`,
      subtitle: authorName ? `Por ${authorName}` : (sym.intensity || null),
      timestamp: sym.created_at,
      relativeTime: formatRelativeTime(new Date(sym.created_at)),
      href: `/saude/sintomas?crianca=${selectedChildId}`,
      icon: "📝",
      color: "bg-orange-50",
    });
  });

  // Completed appointment events
  (recentCompletedApts || []).forEach(apt => {
    timelineEvents.push({
      id: apt.id,
      type: "appointment",
      title: apt.title,
      subtitle: apt.appointment_type || null,
      timestamp: apt.appointment_date,
      relativeTime: formatRelativeTime(new Date(apt.appointment_date)),
      href: `/saude/consultas?crianca=${selectedChildId}`,
      icon: "📅",
      color: "bg-teal-50",
    });
  });

  // Growth events
  (recentGrowth || []).forEach(gr => {
    const parts: string[] = [];
    if (gr.weight_kg) parts.push(`${gr.weight_kg}kg`);
    if (gr.height_cm) parts.push(`${gr.height_cm}cm`);
    timelineEvents.push({
      id: gr.id,
      type: "growth",
      title: `Medida: ${parts.join(" · ") || "registrada"}`,
      subtitle: null,
      timestamp: gr.measurement_date + "T12:00:00",
      relativeTime: formatRelativeTime(new Date(gr.measurement_date + "T12:00:00")),
      href: `/saude/crescimento?crianca=${selectedChildId}`,
      icon: "📏",
      color: "bg-emerald-50",
    });
  });

  // Sort by timestamp desc and take top 10
  timelineEvents.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  const timeline = timelineEvents.slice(0, 10);

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
    preventiveCare,
    lastUpdateRelative,
    healthViews: processedHealthViews,
    timeline,
  };

  return <SaudeClient {...clientProps} />;
}
