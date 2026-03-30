import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { getActiveGroup } from "@/lib/group-utils";
import EmergencyCardClient from "./EmergencyCardClient";

export default async function EmergencyPage({
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
  const { groupId } = activeGroup;

  const { data: children } = await supabase
    .from("children")
    .select("id, full_name, birth_date, emergency_token")
    .eq("group_id", groupId)
    .order("birth_date");

  if (!children || children.length === 0) {
    return (
      <div className="max-w-lg mx-auto pb-20">
        <div className="flex items-center gap-3 mb-6">
          <Link href="/saude" className="text-muted hover:text-dark">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </Link>
          <h1 className="text-2xl font-bold text-dark">Ficha de Emergência</h1>
        </div>
        <EmergencyCardClient
          childrenList={[]}
          selectedChildId=""
          groupId={groupId}
          healthSummary={{
            bloodType: null,
            allergiesCount: 0,
            medicationsCount: 0,
            hasInsurance: false,
            hasSus: false,
            contactsCount: 0,
            hasPediatrician: false,
          }}
        />
      </div>
    );
  }

  const selectedChildId =
    params.crianca && children.find((c) => c.id === params.crianca)
      ? params.crianca
      : children[0].id;

  // Use service role for queries (consistent with alergias pattern)
  const serviceSupabase = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Fetch health summary data in parallel
  const [
    { data: medicalInfo },
    { data: allergies },
    { data: medications },
    { data: groupMembers },
  ] = await Promise.all([
    serviceSupabase
      .from("child_medical_info")
      .select("blood_type, insurance_name, sus_number, primary_pediatrician_id")
      .eq("child_id", selectedChildId)
      .maybeSingle(),
    serviceSupabase
      .from("child_allergies")
      .select("id")
      .eq("child_id", selectedChildId),
    serviceSupabase
      .from("active_medications")
      .select("id")
      .eq("child_id", selectedChildId)
      .eq("status", "active"),
    serviceSupabase
      .from("group_members")
      .select("id")
      .eq("group_id", groupId),
  ]);

  const healthSummary = {
    bloodType: medicalInfo?.blood_type || null,
    allergiesCount: allergies?.length ?? 0,
    medicationsCount: medications?.length ?? 0,
    hasInsurance: !!(medicalInfo?.insurance_name),
    hasSus: !!(medicalInfo?.sus_number),
    contactsCount: groupMembers?.length ?? 0,
    hasPediatrician: !!(medicalInfo?.primary_pediatrician_id),
  };

  return (
    <div className="max-w-lg mx-auto pb-20">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/saude" className="text-muted hover:text-dark">
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </Link>
        <h1 className="text-2xl font-bold text-dark">Ficha de Emergência</h1>
      </div>

      {params.success && (
        <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-3 mb-4 text-sm text-green-700">
          {decodeURIComponent(params.success)}
        </div>
      )}
      {params.error && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 mb-4 text-sm text-red-700">
          {decodeURIComponent(params.error)}
        </div>
      )}

      <EmergencyCardClient
        childrenList={children.map((c) => ({
          id: c.id,
          full_name: c.full_name,
          emergency_token: c.emergency_token || "",
        }))}
        selectedChildId={selectedChildId}
        groupId={groupId}
        healthSummary={healthSummary}
      />
    </div>
  );
}
