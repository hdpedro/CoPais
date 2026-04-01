import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getActiveGroup } from "@/lib/group-utils";
import { getBrazilToday } from "@/lib/calendar-utils";
import MedicationDetailClient from "./MedicationDetailClient";

export default async function MedicationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const activeGroup = await getActiveGroup(supabase, user.id);
  if (!activeGroup) redirect("/onboarding");
  const { groupId, isReadonly } = activeGroup;

  const { data: medication } = await supabase
    .from("active_medications")
    .select("id, name, dosage, frequency, frequency_hours, reason, prescribed_by, start_date, end_date, status, notes, child_id, created_by, children(full_name)")
    .eq("id", id)
    .eq("group_id", groupId)
    .single();

  if (!medication) notFound();

  const { data: doses } = await supabase
    .from("medication_doses")
    .select("id, medication_id, administered_at, administered_by, notes, profiles!medication_doses_administered_by_fkey(full_name)")
    .eq("medication_id", id)
    .order("administered_at", { ascending: false })
    .limit(500);

  const allDoses = doses ?? [];

  // Progress calculation
  function calcProgress(startDate: string | null, endDate: string | null) {
    if (!startDate || !endDate) return null;
    const start = new Date(startDate + "T00:00:00");
    const end = new Date(endDate + "T00:00:00");
    const tp = getBrazilToday().split("-").map(Number);
    const now = new Date(tp[0], tp[1] - 1, tp[2], 12, 0, 0);
    const totalDays = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)));
    const elapsed = Math.max(0, Math.min(totalDays, Math.ceil((now.getTime() - start.getTime()) / (1000 * 60 * 60 * 24))));
    return { elapsed, totalDays };
  }

  // Stats
  const totalDoses = allDoses.length;
  let avgIntervalHours: number | null = null;
  if (allDoses.length >= 2) {
    const sorted = [...allDoses].sort((a, b) => new Date(a.administered_at).getTime() - new Date(b.administered_at).getTime());
    let totalMs = 0;
    for (let i = 1; i < sorted.length; i++) {
      totalMs += new Date(sorted[i].administered_at).getTime() - new Date(sorted[i - 1].administered_at).getTime();
    }
    avgIntervalHours = totalMs / (sorted.length - 1) / (1000 * 60 * 60);
  }

  function formatInterval(hours: number): string {
    if (hours < 1) return `${Math.round(hours * 60)}min`;
    const h = Math.floor(hours);
    const m = Math.round((hours - h) * 60);
    if (m === 0) return `${h}h`;
    return `${h}h${m.toString().padStart(2, "0")}`;
  }

  const avgIntervalFormatted = avgIntervalHours !== null ? formatInterval(avgIntervalHours) : "—";

  // Who administered
  const dosesByPerson: Record<string, number> = {};
  for (const dose of allDoses) {
    const name = (dose.profiles as unknown as { full_name: string } | null)?.full_name ?? "Desconhecido";
    dosesByPerson[name] = (dosesByPerson[name] ?? 0) + 1;
  }
  const personEntries = Object.entries(dosesByPerson).sort((a, b) => b[1] - a[1]) as [string, number][];

  // Group by day
  function formatFullDateBR(dateStr: string) {
    return new Date(dateStr).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
  }

  const dosesByDay: Record<string, typeof allDoses> = {};
  for (const dose of allDoses) {
    const dayKey = formatFullDateBR(dose.administered_at);
    if (!dosesByDay[dayKey]) dosesByDay[dayKey] = [];
    dosesByDay[dayKey].push(dose);
  }
  const dayKeys = Object.keys(dosesByDay);

  // Time since previous
  const sortedDosesAsc = [...allDoses].sort((a, b) => new Date(a.administered_at).getTime() - new Date(b.administered_at).getTime());
  const timeSincePrevMap: Record<string, string> = {};
  for (let i = 0; i < sortedDosesAsc.length; i++) {
    if (i === 0) {
      timeSincePrevMap[sortedDosesAsc[i].id] = "—";
    } else {
      const diffMs = new Date(sortedDosesAsc[i].administered_at).getTime() - new Date(sortedDosesAsc[i - 1].administered_at).getTime();
      const diffH = diffMs / (1000 * 60 * 60);
      timeSincePrevMap[sortedDosesAsc[i].id] = formatInterval(diffH);
    }
  }

  const progress = calcProgress(medication.start_date, medication.end_date);

  // Continuous use info (server component — Date.now() is safe here)
  const isContinuous = !medication.end_date;
  const nowMs = new Date().getTime();
  const daysSinceStart = Math.max(1, Math.ceil((nowMs - new Date(medication.start_date + "T00:00:00").getTime()) / (1000 * 60 * 60 * 24)));

  // Last dose info for ConfirmDoseButton
  const lastDose = allDoses[0] ?? null;
  const lastDoseMinutesAgo = lastDose
    ? Math.floor((nowMs - new Date(lastDose.administered_at).getTime()) / (1000 * 60))
    : null;
  const freqHours = medication.frequency_hours || 8;
  const isOverdue = lastDoseMinutesAgo !== null && lastDoseMinutesAgo > freqHours * 60;

  // Estimated next dose based on avg interval or frequency
  let estimatedNextDose: string | null = null;
  if (lastDose) {
    const intervalMs = avgIntervalHours !== null
      ? avgIntervalHours * 60 * 60 * 1000
      : (medication.frequency_hours || 0) * 60 * 60 * 1000;
    if (intervalMs > 0) {
      const nextTime = new Date(new Date(lastDose.administered_at).getTime() + intervalMs);
      estimatedNextDose = nextTime.toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" });
    }
  }

  return (
    <MedicationDetailClient
      medication={medication}
      allDoses={allDoses}
      progress={progress}
      totalDoses={totalDoses}
      avgIntervalFormatted={avgIntervalFormatted}
      personEntries={personEntries}
      dosesByDay={dosesByDay}
      dayKeys={dayKeys}
      timeSincePrevMap={timeSincePrevMap}
      isReadonly={isReadonly}
      isContinuous={isContinuous}
      daysSinceStart={daysSinceStart}
      lastDoseMinutesAgo={lastDoseMinutesAgo}
      freqHours={freqHours}
      isOverdue={isOverdue}
      estimatedNextDose={estimatedNextDose}
    />
  );
}
