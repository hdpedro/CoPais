import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { getActiveGroup } from "@/lib/group-utils";
import AlergiasClient from "./AlergiasClient";

export default async function AlergiasPage({
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
      <AlergiasClient
        children={[]}
        selectedChildId=""
        allergies={null}
        info={null}
        pediatrician={null}
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

  // Use service role for allergies query (workaround for RLS session issues)
  // (verified: user membership is checked above via getActiveGroup)
  const serviceSupabase = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const [
    { data: allergies },
    { data: medicalInfo },
  ] = await Promise.all([
    serviceSupabase
      .from("child_allergies")
      .select("id, name, allergy_type, severity, reaction")
      .eq("child_id", selectedChildId)
      .eq("group_id", groupId)
      .order("severity"),
    supabase
      .from("child_medical_info")
      .select("*, medical_professionals(id, name, specialty, crm, phone, whatsapp, address)")
      .eq("child_id", selectedChildId)
      .maybeSingle(),
  ]);

  const info = medicalInfo || null;
  const pediatrician = (info?.medical_professionals as any) || null;

  return (
    <AlergiasClient
      children={children}
      selectedChildId={selectedChildId}
      allergies={allergies}
      info={info ? { blood_type: info.blood_type, insurance_name: info.insurance_name, insurance_number: info.insurance_number, sus_number: info.sus_number } : null}
      pediatrician={pediatrician}
      isReadonly={isReadonly}
      success={params.success}
      error={params.error}
    />
  );
}
