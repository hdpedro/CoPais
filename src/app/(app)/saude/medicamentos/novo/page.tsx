import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { createMedication } from "@/actions/health";
import { MEDICATION_FREQUENCIES } from "@/lib/health-constants";
import FrequencySelect from "../FrequencySelect";
import { getBrazilToday } from "@/lib/calendar-utils";

export default async function NovoMedicamentoPage() {
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const user = session?.user;
  if (!user) redirect("/login");

  const { data: memberships } = await supabase
    .from("group_members")
    .select("group_id, role")
    .eq("user_id", user.id);

  if (!memberships || memberships.length === 0) redirect("/onboarding");
  if (memberships[0].role === "readonly") redirect("/dashboard");
  const groupId = memberships[0].group_id;

  const { data: children } = await supabase
    .from("children")
    .select("id, full_name")
    .eq("group_id", groupId);

  const today = getBrazilToday();

  return (
    <div className="max-w-lg mx-auto pb-20 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link
          href="/saude/medicamentos"
          className="w-9 h-9 flex items-center justify-center rounded-full bg-white shadow-sm text-[#8E8E93] hover:bg-gray-50 transition-colors"
        >
          ←
        </Link>
        <h1 className="text-2xl font-bold text-[#2D2D2D]">Novo Medicamento</h1>
      </div>

      {/* Form */}
      <form action={createMedication} className="bg-white rounded-xl p-4 shadow-sm space-y-4">
        <input type="hidden" name="groupId" value={groupId} />

        {/* Child */}
        <div>
          <label className="block text-sm font-medium text-[#2D2D2D] mb-1">
            Criança
          </label>
          <select
            name="childId"
            required
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#5B9B8A]/50"
          >
            <option value="">Selecione...</option>
            {children?.map((c) => (
              <option key={c.id} value={c.id}>
                {c.full_name}
              </option>
            ))}
          </select>
        </div>

        {/* Medication Name */}
        <div>
          <label className="block text-sm font-medium text-[#2D2D2D] mb-1">
            Nome do medicamento
          </label>
          <input
            type="text"
            name="name"
            required
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#5B9B8A]/50"
          />
        </div>

        {/* Dosage */}
        <div>
          <label className="block text-sm font-medium text-[#2D2D2D] mb-1">
            Dosagem
          </label>
          <input
            type="text"
            name="dosage"
            required
            placeholder="Ex: 5ml, 12 gotas, 1 comprimido"
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#5B9B8A]/50"
          />
        </div>

        {/* Frequency (client component) */}
        <div>
          <FrequencySelect frequencies={MEDICATION_FREQUENCIES} />
        </div>

        {/* Reason */}
        <div>
          <label className="block text-sm font-medium text-[#2D2D2D] mb-1">
            Motivo
          </label>
          <input
            type="text"
            name="reason"
            placeholder="Ex: Infecção de ouvido"
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#5B9B8A]/50"
          />
        </div>

        {/* Prescribed By */}
        <div>
          <label className="block text-sm font-medium text-[#2D2D2D] mb-1">
            Prescrito por
          </label>
          <input
            type="text"
            name="prescribedBy"
            placeholder="Nome do médico"
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#5B9B8A]/50"
          />
        </div>

        {/* Dates */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-[#2D2D2D] mb-1">
              Data de início
            </label>
            <input
              type="date"
              name="startDate"
              required
              defaultValue={today}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#5B9B8A]/50"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-[#2D2D2D] mb-1">
              Data de fim
            </label>
            <input
              type="date"
              name="endDate"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#5B9B8A]/50"
            />
          </div>
        </div>

        {/* Notes */}
        <div>
          <label className="block text-sm font-medium text-[#2D2D2D] mb-1">
            Observações
          </label>
          <textarea
            name="notes"
            rows={3}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#5B9B8A]/50"
          />
        </div>

        {/* Submit */}
        <button
          type="submit"
          className="w-full py-3 bg-[#5B9B8A] text-white text-sm font-semibold rounded-lg hover:bg-[#4a8a79] transition-colors"
        >
          Adicionar Medicamento
        </button>
      </form>
    </div>
  );
}
