import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { completeAppointment } from "@/actions/health";
import { getActiveGroup } from "@/lib/group-utils";
import { getBrazilToday } from "@/lib/calendar-utils";
import ConsultasClient from "./ConsultasClient";

export default async function AppointmentsPage({
  searchParams,
}: {
  searchParams: Promise<{ success?: string; error?: string }>;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const activeGroup = await getActiveGroup(supabase, user.id);
  if (!activeGroup) redirect("/onboarding");
  const { groupId, isReadonly } = activeGroup;

  const { data: appointments } = await supabase
    .from("medical_appointments")
    .select(
      "id, title, appointment_date, location, status, notes, summary, return_date, appointment_type, child_id, professional_id, created_by, medical_professionals(name, specialty, whatsapp), children(full_name)"
    )
    .eq("group_id", groupId)
    .order("appointment_date", { ascending: true })
    .limit(200);

  const params = await searchParams;
  const todayStr = getBrazilToday();
  const now = new Date().toISOString();

  const upcoming =
    appointments?.filter(
      (a) => a.status === "scheduled" && a.appointment_date >= now
    ) || [];

  const past =
    appointments?.filter(
      (a) =>
        a.status === "completed" ||
        a.status === "cancelled" ||
        (a.status === "scheduled" && a.appointment_date < now)
    ) || [];

  const pendingReturns =
    appointments?.filter(
      (a) => a.return_date && a.status === "completed" && a.return_date >= todayStr
    ) || [];

  return (
    <ConsultasClient
      appointments={appointments || []}
      upcoming={upcoming}
      past={past}
      pendingReturns={pendingReturns}
      isReadonly={isReadonly}
      success={params.success}
      error={params.error}
      completeAction={completeAppointment}
    />
  );
}
