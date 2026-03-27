import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createVaccinationRecord } from "@/actions/health";
import { VACCINE_CALENDAR } from "@/lib/health-constants";
import { getBrazilToday } from "@/lib/calendar-utils";
import { getActiveGroup } from "@/lib/group-utils";
import VaccineFormClient from "./VaccineFormClient";

export default async function NovaVacinaPage({
  searchParams,
}: {
  searchParams: Promise<{ success?: string; error?: string }>;
}) {
  const params = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const activeGroup = await getActiveGroup(supabase, user.id);
  if (!activeGroup) redirect("/onboarding");
  if (activeGroup.isReadonly) redirect("/dashboard");
  const { groupId } = activeGroup;

  const { data: children } = await supabase
    .from("children")
    .select("id, full_name")
    .eq("group_id", groupId)
    .order("birth_date");

  const allVaccineNames = Array.from(
    new Set(
      VACCINE_CALENDAR.flatMap((group) =>
        group.vaccines.map((v) => v.name)
      )
    )
  );

  const today = getBrazilToday();

  return (
    <VaccineFormClient
      groupId={groupId}
      children={children}
      allVaccineNames={allVaccineNames}
      today={today}
      error={params.error}
      createAction={createVaccinationRecord}
    />
  );
}
