import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { createAppointment } from "@/actions/health";
import WhatsAppScheduleButton from "../WhatsAppScheduleButton";
import { getBrazilToday } from "@/lib/calendar-utils";
import AppointmentFormClient from "./AppointmentFormClient";
import { getActiveGroup } from "@/lib/group-utils";

export default async function NewAppointmentPage({
  searchParams,
}: {
  searchParams: Promise<{ crianca?: string; vaccineDoseId?: string; type?: string }>;
}) {
  const params = await searchParams;
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

  const { data: professionals } = await supabase
    .from("medical_professionals")
    .select("id, name, specialty, whatsapp")
    .eq("group_id", groupId)
    .order("name", { ascending: true });

  const today = getBrazilToday();

  // Quando user veio do CTA "Agendar pediatra" de uma pendência vacinal, pré-popula
  // child + título "Vacina: {nome}" e passa vaccineDoseId pro action gravar
  // `related_vaccine_dose_id` no medical_appointment criado.
  let prefilledChildId: string | null = params.crianca || null;
  let prefilledTitle: string | null = null;
  let vaccineDoseId: string | null = null;
  if (params.vaccineDoseId) {
    const { data: dose } = await supabase
      .from("vaccine_recommended_doses")
      .select("id, child_id, group_id, vaccine_catalog!inner(name), vaccine_schedule_rules!inner(dose_label)")
      .eq("id", params.vaccineDoseId)
      .maybeSingle();
    if (dose && (dose as { group_id: string }).group_id === groupId) {
      vaccineDoseId = (dose as { id: string }).id;
      prefilledChildId = prefilledChildId || (dose as { child_id: string }).child_id;
      const cat = (dose as { vaccine_catalog: { name: string } | { name: string }[] }).vaccine_catalog;
      const catName = Array.isArray(cat) ? cat[0]?.name : cat?.name;
      const rule = (dose as { vaccine_schedule_rules: { dose_label: string } | { dose_label: string }[] }).vaccine_schedule_rules;
      const ruleLabel = Array.isArray(rule) ? rule[0]?.dose_label : rule?.dose_label;
      prefilledTitle = `Vacina: ${catName || ""}${ruleLabel ? ` (${ruleLabel})` : ""}`.trim();
    }
  }

  const whatsappProfessionals = (professionals || []).map((p) => ({
    id: p.id,
    name: p.name,
    whatsapp: p.whatsapp,
    specialty: p.specialty,
  }));

  const childrenList = (children || []).map((c) => ({
    id: c.id,
    full_name: c.full_name,
  }));

  return (
    <div className="max-w-lg mx-auto pb-20">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/saude/consultas" className="text-muted hover:text-dark">
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </Link>
        <h1 className="text-xl font-bold text-dark">Nova Consulta</h1>
      </div>

      <AppointmentFormClient
        groupId={groupId}
        children={childrenList}
        professionals={professionals || []}
        today={today}
        createAction={createAppointment}
        prefilledChildId={prefilledChildId}
        prefilledTitle={prefilledTitle}
        vaccineDoseId={vaccineDoseId}
      />

      {/* WhatsApp scheduling section */}
      {whatsappProfessionals.some((p) => p.whatsapp) && (
        <div className="mt-6">
          <WhatsAppScheduleButton
            professionals={whatsappProfessionals}
            children={childrenList}
          />
        </div>
      )}
    </div>
  );
}
