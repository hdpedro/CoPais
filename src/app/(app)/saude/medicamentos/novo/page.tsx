import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createMedication } from "@/actions/health";
import { getBrazilToday } from "@/lib/calendar-utils";
import { getActiveGroup } from "@/lib/group-utils";
import MedicationFormClient from "./MedicationFormClient";

export default async function NovoMedicamentoPage() {
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
    .eq("group_id", groupId);

  const today = getBrazilToday();

  return (
    <MedicationFormClient
      groupId={groupId}
      children={children}
      today={today}
      createAction={createMedication}
    />
  );
}
