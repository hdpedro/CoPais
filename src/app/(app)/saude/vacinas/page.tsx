import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { VACCINE_CALENDAR } from "@/lib/health-constants";
import { compareVaccinations } from "@/lib/sbp-vaccine-calendar";
import { getActiveGroup } from "@/lib/group-utils";
import { getBrazilToday } from "@/lib/calendar-utils";
import VacinasClient from "./VacinasClient";

export default async function VacinasPage({
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
    return (
      <VacinasClient
        children={[]}
        selectedChildId=""
        selectedChild={{ id: "", full_name: "", birth_date: "" }}
        ageDisplay=""
        takenCount={0}
        overdueCount={0}
        upcomingCount={0}
        futureCount={0}
        overdueItems={[]}
        upcomingItems={[]}
        onTimeItems={[]}
        calendarStatus={[]}
        vaccineRecordsCount={0}
        isReadonly={isReadonly}
        success={params.success}
        error={params.error}
      />
    );
  }

  const selectedChildId =
    params.crianca && children.find((c) => c.id === params.crianca)
      ? params.crianca
      : children[0].id;

  const selectedChild = children.find((c) => c.id === selectedChildId)!;

  // Calculate child age
  const birthDate = new Date(selectedChild.birth_date + "T12:00:00");
  const todayParts = getBrazilToday().split("-").map(Number);
  const now = new Date(todayParts[0], todayParts[1] - 1, todayParts[2], 12, 0, 0);
  const ageMonths =
    (now.getFullYear() - birthDate.getFullYear()) * 12 +
    (now.getMonth() - birthDate.getMonth());

  const ageDisplay =
    ageMonths < 12
      ? `${ageMonths} ${ageMonths === 1 ? "mes" : "meses"}`
      : `${Math.floor(ageMonths / 12)} ano${Math.floor(ageMonths / 12) !== 1 ? "s" : ""}${
          ageMonths % 12 > 0
            ? ` e ${ageMonths % 12} ${ageMonths % 12 === 1 ? "mes" : "meses"}`
            : ""
        }`;

  // Fetch vaccination records
  const { data: records } = await supabase
    .from("vaccination_records")
    .select("id, vaccine_name, dose_label, administered_date")
    .eq("child_id", selectedChildId)
    .order("administered_date", { ascending: false });

  const vaccineRecords = records || [];

  // SBP Comparison
  const comparison = compareVaccinations(selectedChild.birth_date, vaccineRecords);

  // Legacy calendar status
  type VaccineStatus = "taken" | "overdue" | "future";

  const calendarStatus = VACCINE_CALENDAR.map((group) => ({
    age: group.age,
    ageMonths: group.ageMonths,
    vaccines: group.vaccines.map((vaccine) => {
      const record = vaccineRecords.find((r) => {
        const recordName = r.vaccine_name.trim().toLowerCase();
        const calendarName = vaccine.name.trim().toLowerCase();
        if (recordName === calendarName) return true;
        if (recordName.startsWith(calendarName) || calendarName.startsWith(recordName)) return true;
        return recordName.includes(calendarName) || calendarName.includes(recordName);
      });

      let status: VaccineStatus;
      if (record) {
        status = "taken";
      } else if (ageMonths >= group.ageMonths) {
        status = "overdue";
      } else {
        status = "future";
      }

      return {
        name: vaccine.name,
        doses: vaccine.doses,
        status,
        date: record?.administered_date || undefined,
      };
    }),
  }));

  return (
    <VacinasClient
      children={children}
      selectedChildId={selectedChildId}
      selectedChild={selectedChild}
      ageDisplay={ageDisplay}
      takenCount={comparison.onTime.length}
      overdueCount={comparison.overdue.length}
      upcomingCount={comparison.upcoming.length}
      futureCount={comparison.future.length}
      overdueItems={comparison.overdue}
      upcomingItems={comparison.upcoming}
      onTimeItems={comparison.onTime}
      calendarStatus={calendarStatus}
      vaccineRecordsCount={vaccineRecords.length}
      isReadonly={isReadonly}
      success={params.success}
      error={params.error}
    />
  );
}
