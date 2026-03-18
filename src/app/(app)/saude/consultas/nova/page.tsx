import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { createAppointment } from "@/actions/health";
import WhatsAppScheduleButton from "../WhatsAppScheduleButton";

export default async function NewAppointmentPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: memberships } = await supabase
    .from("group_members")
    .select("group_id")
    .eq("user_id", user.id);

  if (!memberships || memberships.length === 0) redirect("/onboarding");
  const groupId = memberships[0].group_id;

  const { data: children } = await supabase
    .from("children")
    .select("id, full_name")
    .eq("group_id", groupId);

  const { data: professionals } = await supabase
    .from("medical_professionals")
    .select("id, name, specialty, whatsapp")
    .eq("group_id", groupId)
    .order("name", { ascending: true });

  const today = new Date().toISOString().split("T")[0];

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
          <svg
            className="w-6 h-6"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15 19l-7-7 7-7"
            />
          </svg>
        </Link>
        <h1 className="text-2xl font-bold text-dark">Agendar Consulta</h1>
      </div>

      <form
        action={createAppointment}
        className="bg-white rounded-xl p-6 shadow-sm space-y-4 mb-6"
      >
        <input type="hidden" name="groupId" value={groupId} />

        <div>
          <label className="block text-sm font-medium text-dark mb-1">
            Crianca <span className="text-error">*</span>
          </label>
          <select
            name="childId"
            required
            className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary"
          >
            <option value="">Selecione a crianca...</option>
            {children?.map((child) => (
              <option key={child.id} value={child.id}>
                {child.full_name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-dark mb-1">
            Profissional
          </label>
          <select
            name="professionalId"
            className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary"
          >
            <option value="">Selecione (opcional)...</option>
            {professionals?.map((prof) => (
              <option key={prof.id} value={prof.id}>
                {prof.name}
                {prof.specialty ? ` - ${prof.specialty}` : ""}
              </option>
            ))}
          </select>
          <Link
            href="/saude/profissionais/novo"
            className="text-xs text-primary hover:underline mt-1 inline-block"
          >
            ou cadastre um novo profissional
          </Link>
        </div>

        <div>
          <label className="block text-sm font-medium text-dark mb-1">
            Titulo / Motivo <span className="text-error">*</span>
          </label>
          <input
            type="text"
            name="title"
            required
            placeholder="Ex: Consulta de rotina, Retorno"
            className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-dark mb-1">
              Data <span className="text-error">*</span>
            </label>
            <input
              type="date"
              name="appointmentDate"
              required
              defaultValue={today}
              className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-dark mb-1">
              Horario <span className="text-error">*</span>
            </label>
            <input
              type="time"
              name="appointmentTime"
              required
              className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-dark mb-1">
            Local
          </label>
          <input
            type="text"
            name="location"
            placeholder="Clinica, hospital, endereco..."
            className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-dark mb-1">
            Observacoes
          </label>
          <textarea
            name="notes"
            rows={3}
            placeholder="Levar exames, chegar 15min antes..."
            className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary resize-none"
          />
        </div>

        <button
          type="submit"
          className="w-full py-3 bg-primary text-white font-semibold rounded-lg hover:bg-primary-dark transition-colors"
        >
          Agendar Consulta
        </button>
      </form>

      {/* WhatsApp scheduling section */}
      {whatsappProfessionals.some((p) => p.whatsapp) && (
        <WhatsAppScheduleButton
          professionals={whatsappProfessionals}
          children={childrenList}
        />
      )}
    </div>
  );
}
