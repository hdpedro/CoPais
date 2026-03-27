import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { createAppointment } from "@/actions/health";
import WhatsAppScheduleButton from "../WhatsAppScheduleButton";
import { getBrazilToday } from "@/lib/calendar-utils";
import AppointmentFormClient from "./AppointmentFormClient";
import { getActiveGroup } from "@/lib/group-utils";

export default async function NewAppointmentPage() {
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
