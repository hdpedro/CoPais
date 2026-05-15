import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getActiveGroup } from "@/lib/group-utils";
import { editVaccinationRecord, deleteVaccinationRecord } from "@/actions/vaccines";
import VaccineDetailClient from "./VaccineDetailClient";

/**
 * /saude/vacinas/[id] — detalhe de um vaccination_record.
 *
 * Card grande com todos campos + Editar (toggle inline form) + Excluir
 * (confirm). Edit + delete acionam trigger `trg_vaccination_records_recompute`
 * → motor recalcula status (taken pode voltar pra overdue/due_soon se a
 * dose for excluída).
 */
export default async function VaccineDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ success?: string; error?: string }>;
}) {
  const { id } = await params;
  const search = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const activeGroup = await getActiveGroup(supabase, user.id);
  if (!activeGroup) redirect("/onboarding");
  const { groupId, isReadonly } = activeGroup;

  const { data: record } = await supabase
    .from("vaccination_records")
    .select(
      "id, child_id, group_id, vaccine_name, dose_label, dose_number, administered_date, batch_number, location, notes, source, catalog_id, created_by, created_at, profiles:created_by(full_name)",
    )
    .eq("id", id)
    .maybeSingle();

  if (!record || record.group_id !== groupId) {
    notFound();
  }

  const [childRes, catalogRes] = await Promise.all([
    supabase
      .from("children")
      .select("id, full_name")
      .eq("id", record.child_id as string)
      .single(),
    record.catalog_id
      ? supabase
          .from("vaccine_catalog")
          .select("id, name, code, equivalence_group")
          .eq("id", record.catalog_id as string)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const authorRaw = record.profiles as { full_name: string } | { full_name: string }[] | null;
  const authorName = Array.isArray(authorRaw)
    ? authorRaw[0]?.full_name
    : authorRaw?.full_name;

  return (
    <VaccineDetailClient
      record={{
        id: record.id as string,
        child_id: record.child_id as string,
        vaccine_name: record.vaccine_name as string,
        dose_label: (record.dose_label as string | null) || null,
        dose_number: (record.dose_number as number | null) || null,
        administered_date: record.administered_date as string,
        batch_number: (record.batch_number as string | null) || null,
        location: (record.location as string | null) || null,
        notes: (record.notes as string | null) || null,
        source: (record.source as string | null) || "manual",
        catalog_id: (record.catalog_id as string | null) || null,
        created_at: record.created_at as string,
        author_name: authorName || null,
      }}
      childName={(childRes.data?.full_name as string) || "Criança"}
      catalogName={(catalogRes.data?.name as string | null) || null}
      isReadonly={isReadonly}
      successMessage={search.success ? decodeURIComponent(search.success) : null}
      errorMessage={search.error ? decodeURIComponent(search.error) : null}
      editAction={editVaccinationRecord}
      deleteAction={deleteVaccinationRecord}
    />
  );
}
