import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { createVaccinationRecord } from "@/actions/health";
import { VACCINE_CALENDAR } from "@/lib/health-constants";
import { getBrazilToday } from "@/lib/calendar-utils";

export default async function NovaVacinaPage({
  searchParams,
}: {
  searchParams: Promise<{ success?: string; error?: string }>;
}) {
  const params = await searchParams;
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
    .eq("group_id", groupId)
    .order("birth_date");

  // Flatten vaccine names from calendar
  const allVaccineNames = Array.from(
    new Set(
      VACCINE_CALENDAR.flatMap((group) =>
        group.vaccines.map((v) => v.name)
      )
    )
  );

  const today = getBrazilToday();

  return (
    <div className="max-w-lg mx-auto pb-20">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Link href="/saude/vacinas" className="text-muted hover:text-dark">
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
        <div>
          <h1 className="text-2xl font-bold text-dark">Registrar Vacina</h1>
          <p className="text-sm text-muted">Novo registro de vacinacao</p>
        </div>
      </div>

      {/* Alerts */}
      {params.error && (
        <div className="bg-red-50 border border-error/20 text-error rounded-lg p-3 mb-4 text-sm">
          {decodeURIComponent(params.error)}
        </div>
      )}

      <form action={createVaccinationRecord} className="space-y-4">
        <input type="hidden" name="groupId" value={groupId} />

        {/* Child Select */}
        <div className="bg-white rounded-xl p-4 shadow-sm">
          <label className="block text-xs font-semibold text-dark mb-1.5">
            Crianca *
          </label>
          <select
            name="childId"
            required
            className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-dark focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
          >
            <option value="">Selecione...</option>
            {(children || []).map((child) => (
              <option key={child.id} value={child.id}>
                {child.full_name}
              </option>
            ))}
          </select>
        </div>

        {/* Vaccine Name */}
        <div className="bg-white rounded-xl p-4 shadow-sm">
          <label className="block text-xs font-semibold text-dark mb-1.5">
            Vacina *
          </label>
          <select
            name="vaccineName"
            required
            className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-dark focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
          >
            <option value="">Selecione a vacina...</option>
            {allVaccineNames.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
            <option value="__outra">Outra (digitar manualmente)</option>
          </select>
          <input
            type="text"
            name="vaccineNameCustom"
            placeholder="Nome da vacina (se 'Outra')"
            className="w-full mt-2 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-dark placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
          />
        </div>

        {/* Dose Label */}
        <div className="bg-white rounded-xl p-4 shadow-sm">
          <label className="block text-xs font-semibold text-dark mb-1.5">
            Dose
          </label>
          <input
            type="text"
            name="doseLabel"
            placeholder="Ex: 1a dose, 2a dose, Reforco"
            className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-dark placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
          />
        </div>

        {/* Date */}
        <div className="bg-white rounded-xl p-4 shadow-sm">
          <label className="block text-xs font-semibold text-dark mb-1.5">
            Data de aplicacao *
          </label>
          <input
            type="date"
            name="administeredDate"
            required
            defaultValue={today}
            className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-dark focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
          />
        </div>

        {/* Batch Number */}
        <div className="bg-white rounded-xl p-4 shadow-sm">
          <label className="block text-xs font-semibold text-dark mb-1.5">
            Lote{" "}
            <span className="font-normal text-muted">(opcional)</span>
          </label>
          <input
            type="text"
            name="batchNumber"
            placeholder="Numero do lote"
            className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-dark placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
          />
        </div>

        {/* Location */}
        <div className="bg-white rounded-xl p-4 shadow-sm">
          <label className="block text-xs font-semibold text-dark mb-1.5">
            Local{" "}
            <span className="font-normal text-muted">(opcional)</span>
          </label>
          <input
            type="text"
            name="location"
            placeholder="UBS, clinica, hospital..."
            className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-dark placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
          />
        </div>

        {/* Notes */}
        <div className="bg-white rounded-xl p-4 shadow-sm">
          <label className="block text-xs font-semibold text-dark mb-1.5">
            Observacoes{" "}
            <span className="font-normal text-muted">(opcional)</span>
          </label>
          <textarea
            name="notes"
            rows={3}
            placeholder="Reacoes, informacoes adicionais..."
            className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-dark placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary resize-none"
          />
        </div>

        {/* Submit */}
        <button
          type="submit"
          className="w-full bg-primary text-white font-semibold py-3 rounded-xl hover:bg-primary/90 transition-colors shadow-sm"
        >
          Registrar Vacina
        </button>
      </form>
    </div>
  );
}
