import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { logMedicationDose, updateMedicationStatus } from "@/actions/health";
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
    .select("*, children(full_name)")
    .eq("group_id", groupId)
    .order("created_at", { ascending: false });

  const activeMeds = medications?.filter((m) => m.status === "active") ?? [];
  const historyMeds = medications?.filter((m) => m.status === "completed" || m.status === "cancelled") ?? [];

  const activeMedIds = activeMeds.map((m) => m.id);
  let doses: any[] = [];
  if (activeMedIds.length > 0) {
    const { data: dosesData } = await supabase
      .from("medication_doses")
      .select("*, profiles!medication_doses_administered_by_fkey(full_name)")
      .in("medication_id", activeMedIds)
      .order("administered_at", { ascending: false })
      .limit(50);
    doses = dosesData ?? [];
  }

  function calcProgress(startDate: string | null, endDate: string | null, status?: string) {
    if (!startDate || !endDate) return null;
    if (status === "completed" || status === "cancelled") {
      const start = new Date(startDate + "T00:00:00");
      const end = new Date(endDate + "T00:00:00");
      const totalDays = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)));
      return { elapsed: totalDays, totalDays, percent: 100 };
    }
    const start = new Date(startDate + "T00:00:00");
    const end = new Date(endDate + "T00:00:00");
    const tp = getBrazilToday().split("-").map(Number);
    const now = new Date(tp[0], tp[1] - 1, tp[2], 12, 0, 0);
    const totalDays = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)));
    const elapsed = Math.max(0, Math.min(totalDays, Math.ceil((now.getTime() - start.getTime()) / (1000 * 60 * 60 * 24))));
    const percent = Math.min(100, (elapsed / totalDays) * 100);
    return { elapsed, totalDays, percent };
  }

  return (
    <MedicamentosClient
      activeMeds={activeMeds}
      historyMeds={historyMeds}
      doses={doses}
      isReadonly={isReadonly}
      success={success}
      error={errorMsg}
      logDoseAction={logMedicationDose}
      updateStatusAction={updateMedicationStatus}
      calcProgress={calcProgress}
    />
  );
}
