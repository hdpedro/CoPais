import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getActiveGroup } from "@/lib/group-utils";
import { getSignedFileUrl } from "@/lib/storage-signed-url";
import dynamic from "next/dynamic";

const ChildDetailClient = dynamic(() => import("./ChildDetailClient"), {
  loading: () => <div className="animate-pulse bg-gray-100 rounded-xl h-96" />,
});

export default async function ChildDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string; error?: string; success?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const tab = sp.tab || "geral";
  const uploadError = sp.error || null;
  const uploadSuccess = sp.success || null;

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
    // Latest growth record. Schema usa `measured_date` (date) — `recorded_at`
    // era um typo historico que fazia PostgREST retornar 400 e o query
    // falhar silenciosamente (cards Peso/Altura ficavam vazios mesmo com
    // dados no banco). Fix 2026-05-11.
    supabase
      .from("growth_records")
      .select("*")
      .eq("child_id", id)
      .order("measured_date", { ascending: false })
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
    // Vaccination records — coluna e `administered_date` (schema migration
    // 00005). `applied_date` nao existe; o `.order()` antigo fazia o
    // PostgREST devolver 400 e a contagem ficava zero silenciosamente.
    // Bug 2026-05-13, simetrico ao fix em kindar-native.
    supabase
      .from("vaccination_records")
      .select("*")
      .eq("child_id", id)
      .order("administered_date", { ascending: false }),
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

  // Sign document URLs server-side. Buckets are private after migration 062.
  // We pass through any extra fields (profiles join etc.) by spreading.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const docRows = (documentsRes.data || []) as any[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const signedDocs: any[] = await Promise.all(
    docRows.map(async (d) => ({
      ...d,
      file_url: (await getSignedFileUrl(supabase, "documents", d.file_url)) || d.file_url,
    })),
  );

  return (
    <ChildDetailClient
      child={childRes.data}
      medicalInfo={medicalInfoRes.data || null}
      latestGrowth={latestGrowthRes.data?.[0] || null}
      allergies={allergiesRes.data || []}
      medications={medicationsRes.data || []}
      vaccinations={vaccinationsRes.data || []}
      documents={signedDocs}
      education={educationRes.data || null}
      groupId={groupId}
      isReadonly={isReadonly}
      tab={tab}
      uploadError={uploadError}
      uploadSuccess={uploadSuccess}
    />
  );
}
