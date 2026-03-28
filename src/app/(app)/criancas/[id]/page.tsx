import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getActiveGroup } from "@/lib/group-utils";
import dynamic from "next/dynamic";

const ChildDetailClient = dynamic(() => import("./ChildDetailClient"), {
  loading: () => <div className="animate-pulse bg-gray-100 rounded-xl h-96" />,
});

export default async function ChildDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string; success?: string; error?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const tab = sp.tab || "geral";
  const successMsg = sp.success || null;
  const errorMsg = sp.error || null;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const activeGroup = await getActiveGroup(supabase, user.id);
  if (!activeGroup) redirect("/onboarding");
  const { groupId, isReadonly } = activeGroup;

  // Fetch all data in parallel
  const [
    childRes,
    medicalInfoRes,
    latestGrowthRes,
    allergiesRes,
    medicationsRes,
    vaccinationsRes,
    documentsRes,
    educationRes,
  ] = await Promise.all([
    // Child
    supabase
      .from("children")
      .select("*")
      .eq("id", id)
      .eq("group_id", groupId)
      .single(),
    // Medical info
    supabase
      .from("child_medical_info")
      .select("*")
      .eq("child_id", id)
      .single(),
    // Latest growth record
    supabase
      .from("growth_records")
      .select("*")
      .eq("child_id", id)
      .order("recorded_at", { ascending: false })
      .limit(1),
    // Allergies
    supabase
      .from("child_allergies")
      .select("*")
      .eq("child_id", id)
      .order("created_at", { ascending: false }),
    // Active medications
    supabase
      .from("active_medications")
      .select("*")
      .eq("child_id", id)
      .eq("status", "active"),
    // Vaccination records
    supabase
      .from("vaccination_records")
      .select("*")
      .eq("child_id", id)
      .order("applied_date", { ascending: false }),
    // Documents for this child
    supabase
      .from("documents")
      .select("*, profiles!documents_uploaded_by_fkey(full_name)")
      .eq("group_id", groupId)
      .eq("child_id", id)
      .order("created_at", { ascending: false }),
    // Education
    supabase
      .from("child_education")
      .select("*")
      .eq("child_id", id)
      .single(),
  ]);

  if (!childRes.data) notFound();

  return (
    <ChildDetailClient
      child={childRes.data}
      medicalInfo={medicalInfoRes.data || null}
      latestGrowth={latestGrowthRes.data?.[0] || null}
      allergies={allergiesRes.data || []}
      medications={medicationsRes.data || []}
      vaccinations={vaccinationsRes.data || []}
      documents={documentsRes.data || []}
      education={educationRes.data || null}
      groupId={groupId}
      isReadonly={isReadonly}
      tab={tab}
      successMsg={successMsg}
      errorMsg={errorMsg}
    />
  );
}
