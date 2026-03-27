import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getActiveGroup } from "@/lib/group-utils";
import CrescimentoClient from "./CrescimentoClient";

export default async function CrescimentoPage({
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
      <CrescimentoClient
        children={[]}
        selectedChildId=""
        selectedChild={{ id: "", full_name: "", birth_date: "" }}
        growthRecords={[]}
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

  const { data: records } = await supabase
    .from("growth_records")
    .select("id, measured_date, weight_kg, height_cm, head_cm, notes")
    .eq("child_id", selectedChildId)
    .order("measured_date", { ascending: false });

  return (
    <CrescimentoClient
      children={children}
      selectedChildId={selectedChildId}
      selectedChild={selectedChild}
      growthRecords={(records || []).map(r => ({
        id: r.id,
        measured_date: r.measured_date,
        weight_kg: r.weight_kg ? Number(r.weight_kg) : null,
        height_cm: r.height_cm ? Number(r.height_cm) : null,
        head_cm: r.head_cm ? Number(r.head_cm) : null,
        notes: r.notes,
      }))}
      isReadonly={isReadonly}
      success={params.success}
      error={params.error}
    />
  );
}
