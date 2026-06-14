import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { updateMedicationStatus } from "@/actions/health";
import { getActiveGroup } from "@/lib/group-utils";
import { getBrazilToday } from "@/lib/calendar-utils";
import MedicamentosClient from "./MedicamentosClient";

export default async function MedicamentosPage({
  searchParams,
}: {
  searchParams: Promise<{ success?: string; error?: string }>;
}) {
  const { success, error: errorMsg } = await searchParams;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const activeGroup = await getActiveGroup(supabase, user.id);
  if (!activeGroup) redirect("/onboarding");
  const { groupId, isReadonly } = activeGroup;

  const { data: medications } = await supabase
    .from("active_medications")
    .select("id, name, dosage, frequency, frequency_hours, reason, prescribed_by, start_date, end_date, status, notes, child_id, children(full_name)")
    .eq("group_id", groupId)
    .eq("care_type", "medication") // tela de Medicamentos só lista meds (tratamento/procedimento têm care_type próprio, migration 00119)
    .order("created_at", { ascending: false });

  const activeMeds = medications?.filter((m) => m.status === "active") ?? [];
  const historyMeds = medications?.filter((m) => m.status === "completed" || m.status === "cancelled") ?? [];

  const activeMedIds = activeMeds.map((m) => m.id);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let doses: any[] = [];
  if (activeMedIds.length > 0) {
    const { data: dosesData } = await supabase
      .from("medication_doses")
      .select("id, medication_id, administered_at, notes, profiles!medication_doses_administered_by_fkey(full_name)")
      .in("medication_id", activeMedIds)
      .order("administered_at", { ascending: false })
      .limit(50);
    doses = dosesData ?? [];
  }

  // Pre-compute progress for each medication (cannot pass functions to client components)
  const progressMap: Record<string, { elapsed: number; totalDays: number; percent: number } | null> = {};
  const tp = getBrazilToday().split("-").map(Number);
  const nowDate = new Date(tp[0], tp[1] - 1, tp[2], 12, 0, 0);

  for (const med of [...activeMeds, ...historyMeds]) {
    if (!med.start_date || !med.end_date) {
      progressMap[med.id] = null;
      continue;
    }
    const start = new Date(med.start_date + "T00:00:00");
    const end = new Date(med.end_date + "T00:00:00");
    const totalDays = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)));
    if (med.status === "completed" || med.status === "cancelled") {
      progressMap[med.id] = { elapsed: totalDays, totalDays, percent: 100 };
    } else {
      const elapsed = Math.max(0, Math.min(totalDays, Math.ceil((nowDate.getTime() - start.getTime()) / (1000 * 60 * 60 * 24))));
      const percent = Math.min(100, (elapsed / totalDays) * 100);
      progressMap[med.id] = { elapsed, totalDays, percent };
    }
  }

  return (
    <MedicamentosClient
      activeMeds={activeMeds}
      historyMeds={historyMeds}
      doses={doses}
      isReadonly={isReadonly}
      success={success}
      error={errorMsg}
      updateStatusAction={updateMedicationStatus}
      progressMap={progressMap}
    />
  );
}
