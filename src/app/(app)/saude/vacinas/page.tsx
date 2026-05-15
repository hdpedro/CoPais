import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getActiveGroup } from "@/lib/group-utils";
import { getVaccineStatus, type CalendarPreference } from "@/lib/services/vaccines";
import VacinasClient from "./VacinasClient";

/**
 * /saude/vacinas — hub do Motor de Saúde Preventiva.
 *
 * Consome `getVaccineStatus` (service) que lê `vaccine_recommended_doses`
 * (derivado por trigger). Banco já manteve o estado atualizado — server só
 * agrega.
 */
export default async function VacinasPage({
  searchParams,
}: {
  searchParams: Promise<{
    crianca?: string;
    success?: string;
    error?: string;
    duplicate?: string;
    vaccineName?: string;
    doseNumber?: string;
    postVaccine?: string;
    postVaccineDone?: string;
  }>;
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
    .select("id, full_name, birth_date, vaccination_calendar_preference")
    .eq("group_id", groupId)
    .order("birth_date");

  const childrenList = (children || []).map((c) => ({
    id: c.id as string,
    full_name: c.full_name as string,
    birth_date: c.birth_date as string | null,
    calendarPreference: (c.vaccination_calendar_preference as CalendarPreference) || "both",
  }));

  if (childrenList.length === 0) {
    return (
      <VacinasClient
        childrenList={[]}
        selectedChildId=""
        selectedChild={null}
        status={null}
        recentRecords={[]}
        nextAppointment={null}
        isReadonly={isReadonly}
        duplicate={params.duplicate === "1"
          ? { vaccineName: decodeURIComponent(params.vaccineName || ""), doseNumber: Number(params.doseNumber) || null }
          : null}
        postVaccineRecordId={null}
        postVaccineDone={false}
        successMessage={params.success ? decodeURIComponent(params.success) : null}
        errorMessage={params.error ? decodeURIComponent(params.error) : null}
      />
    );
  }

  const selectedChildId =
    params.crianca && childrenList.find((c) => c.id === params.crianca)
      ? params.crianca
      : childrenList[0].id;

  const selectedChild = childrenList.find((c) => c.id === selectedChildId) || null;

  if (!selectedChild) {
    redirect("/saude/vacinas");
  }

  // 3 queries em paralelo
  const today = new Date().toISOString();
  const [statusResult, recentRes, apptRes] = await Promise.all([
    getVaccineStatus(supabase, selectedChildId),
    supabase
      .from("vaccination_records")
      .select("id, vaccine_name, dose_label, dose_number, administered_date, location, batch_number, catalog_id")
      .eq("child_id", selectedChildId)
      .order("administered_date", { ascending: false })
      .limit(30),
    supabase
      .from("medical_appointments")
      .select("id, title, appointment_date, related_vaccine_dose_id")
      .eq("child_id", selectedChildId)
      .eq("status", "scheduled")
      .gte("appointment_date", today)
      .order("appointment_date", { ascending: true })
      .limit(1),
  ]);

  const status = statusResult.ok ? statusResult.data : null;

  return (
    <VacinasClient
      childrenList={childrenList}
      selectedChildId={selectedChildId}
      selectedChild={selectedChild}
      status={status}
      recentRecords={(recentRes.data || []).map((r) => ({
        id: r.id as string,
        vaccine_name: r.vaccine_name as string,
        dose_label: (r.dose_label as string | null) || null,
        dose_number: (r.dose_number as number | null) || null,
        administered_date: r.administered_date as string,
        location: (r.location as string | null) || null,
        batch_number: (r.batch_number as string | null) || null,
      }))}
      nextAppointment={apptRes.data?.[0]
        ? {
            id: apptRes.data[0].id as string,
            title: apptRes.data[0].title as string,
            appointment_date: apptRes.data[0].appointment_date as string,
            related_vaccine_dose_id: (apptRes.data[0].related_vaccine_dose_id as string | null) || null,
          }
        : null}
      isReadonly={isReadonly}
      duplicate={params.duplicate === "1"
        ? { vaccineName: decodeURIComponent(params.vaccineName || ""), doseNumber: Number(params.doseNumber) || null }
        : null}
      postVaccineRecordId={params.postVaccine || null}
      postVaccineDone={params.postVaccineDone === "1"}
      successMessage={params.success ? decodeURIComponent(params.success) : null}
      errorMessage={params.error ? decodeURIComponent(params.error) : null}
    />
  );
}
