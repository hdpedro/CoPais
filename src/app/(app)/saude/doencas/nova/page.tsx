import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { createIllnessEpisode } from "@/actions/health";
import SymptomsSelector from "../SymptomsSelector";

export default async function NovaDoencaPage({
  searchParams,
}: {
  searchParams: Promise<{ success?: string; error?: string }>;
}) {
  const params = await searchParams;
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
    .eq("group_id", groupId)
    .order("birth_date");

  const today = new Date().toISOString().split("T")[0];

  return (
    <div className="max-w-lg mx-auto pb-20">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Link href="/saude/doencas" className="text-muted hover:text-dark">
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
          <h1 className="text-2xl font-bold text-dark">Registrar Doenca</h1>
          <p className="text-sm text-muted">Novo episodio de doenca</p>
        </div>
      </div>

      {/* Alerts */}
      {params.error && (
        <div className="bg-red-50 border border-error/20 text-error rounded-lg p-3 mb-4 text-sm">
          {decodeURIComponent(params.error)}
        </div>
      )}

      <form action={createIllnessEpisode} className="space-y-4">
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

        {/* Title */}
        <div className="bg-white rounded-xl p-4 shadow-sm">
          <label className="block text-xs font-semibold text-dark mb-1.5">
            Titulo *
          </label>
          <input
            type="text"
            name="title"
            required
            placeholder="Ex: Otite, Gripe"
            className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-dark placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
          />
        </div>

        {/* Symptoms */}
        <div className="bg-white rounded-xl p-4 shadow-sm">
          <label className="block text-xs font-semibold text-dark mb-2">
            Sintomas
          </label>
          <p className="text-xs text-muted mb-3">
            Toque nos sintomas para selecionar:
          </p>
          <SymptomsSelector />
        </div>

        {/* Start Date */}
        <div className="bg-white rounded-xl p-4 shadow-sm">
          <label className="block text-xs font-semibold text-dark mb-1.5">
            Data de inicio
          </label>
          <input
            type="date"
            name="startDate"
            defaultValue={today}
            className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-dark focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
          />
        </div>

        {/* Diagnosis */}
        <div className="bg-white rounded-xl p-4 shadow-sm">
          <label className="block text-xs font-semibold text-dark mb-1.5">
            Diagnostico{" "}
            <span className="font-normal text-muted">(opcional)</span>
          </label>
          <input
            type="text"
            name="diagnosis"
            placeholder="Diagnostico medico, se houver"
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
            placeholder="Informacoes adicionais..."
            className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-dark placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary resize-none"
          />
        </div>

        {/* Submit */}
        <button
          type="submit"
          className="w-full bg-primary text-white font-semibold py-3 rounded-xl hover:bg-primary/90 transition-colors shadow-sm"
        >
          Registrar Episodio
        </button>
      </form>
    </div>
  );
}
