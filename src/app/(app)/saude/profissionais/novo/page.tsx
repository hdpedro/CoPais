import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createProfessional } from "@/actions/health";
import { getActiveGroup } from "@/lib/group-utils";
import ProfessionalFormClient from "./ProfessionalFormClient";

export default async function NewProfessionalPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const activeGroup = await getActiveGroup(supabase, user.id);
  if (!activeGroup) redirect("/onboarding");
  if (activeGroup.isReadonly) redirect("/dashboard");
  const { groupId } = activeGroup;

  return (
    <ProfessionalFormClient
      groupId={groupId}
      createAction={createProfessional}
    />
  );
}
