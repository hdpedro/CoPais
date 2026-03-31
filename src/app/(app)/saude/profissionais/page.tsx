import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getActiveGroup } from "@/lib/group-utils";
import ProfissionaisClient from "./ProfissionaisClient";

export default async function ProfessionalsPage({
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

  const { data: professionals } = await supabase
    .from("medical_professionals")
    .select("id, name, specialty, crm, phone, whatsapp, address, notes")
    .eq("group_id", groupId)
    .order("name", { ascending: true });

  const params = await searchParams;

  return (
    <ProfissionaisClient
      professionals={professionals}
      isReadonly={isReadonly}
      success={params.success}
      error={params.error}
    />
  );
}
