import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getBrazilToday } from "@/lib/calendar-utils";
import { getActiveGroup } from "@/lib/group-utils";
import { registerVaccination } from "@/actions/vaccines";
import VaccineFormClient from "./VaccineFormClient";

export default async function NovaVacinaPage({
  searchParams,
}: {
  searchParams: Promise<{
    success?: string;
    error?: string;
    crianca?: string;
    duplicate?: string;
    vaccineName?: string;
    catalogId?: string;
    doseLabel?: string;
    doseNumber?: string;
    administeredDate?: string;
    batchNumber?: string;
    location?: string;
    notes?: string;
  }>;
}) {
  const params = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const activeGroup = await getActiveGroup(supabase, user.id);
  if (!activeGroup) redirect("/onboarding");
  if (activeGroup.isReadonly) redirect("/dashboard");
  const { groupId } = activeGroup;

  const [childrenRes, catalogRes] = await Promise.all([
    supabase
      .from("children")
      .select("id, full_name")
      .eq("group_id", groupId)
      .order("birth_date"),
    supabase
      .from("vaccine_catalog")
      .select("id, code, name, aliases")
      .eq("country_code", "BR")
      .order("name"),
  ]);

  const children = (childrenRes.data || []).map((c) => ({
    id: c.id as string,
    full_name: c.full_name as string,
  }));

  const catalog = (catalogRes.data || []).map((c) => ({
    id: c.id as string,
    code: c.code as string,
    name: c.name as string,
    aliases: (c.aliases as string[]) || [],
  }));

  const today = getBrazilToday();
  const initialChildId = params.crianca && children.find((c) => c.id === params.crianca)
    ? params.crianca
    : children[0]?.id || "";

  const duplicate = params.duplicate === "1"
    ? {
        vaccineName: params.vaccineName || "",
        catalogId: params.catalogId || null,
        doseLabel: params.doseLabel || null,
        doseNumber: params.doseNumber ? Number(params.doseNumber) : null,
        administeredDate: params.administeredDate || today,
        batchNumber: params.batchNumber || null,
        location: params.location || null,
        notes: params.notes || null,
      }
    : null;

  return (
    <VaccineFormClient
      groupId={groupId}
      children={children}
      catalog={catalog}
      today={today}
      error={params.error}
      initialChildId={initialChildId}
      createAction={registerVaccination}
      duplicate={duplicate}
    />
  );
}
