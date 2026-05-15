/**
 * /calendario/ferias — Listar + Criar períodos de Férias.
 *
 * Bug Amanda 2026-05-14: férias como cidadão de primeira classe.
 *
 * - Server component (page.tsx) faz fetch de children + members + lista
 *   de férias existentes via service `listVacations`.
 * - Client form (NewVacationForm.tsx) recebe os dados como props e
 *   submete pra server action `createVacation`.
 */

import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getActiveGroup } from "@/lib/group-utils";
import { listVacations } from "@/lib/services/vacation";
import { deleteVacation } from "@/actions/vacation";
import NewVacationForm from "./NewVacationForm";

export const dynamic = "force-dynamic";

interface VacationsPageProps {
  searchParams: Promise<{ error?: string; success?: string }>;
}

export default async function VacationsPage({ searchParams }: VacationsPageProps) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const activeGroup = await getActiveGroup(supabase, user.id);
  if (!activeGroup) redirect("/onboarding");
  if (activeGroup.isReadonly) redirect("/dashboard");

  const { groupId } = activeGroup;

  // Children + members (pro form)
  const [{ data: children }, { data: members }] = await Promise.all([
    supabase.from("children").select("id, full_name").eq("group_id", groupId).order("birth_date"),
    supabase.from("group_members").select("user_id, profiles(full_name, display_name)").eq("group_id", groupId),
  ]);

  const membersList = (members || []).map((m) => {
    const p = Array.isArray(m.profiles) ? m.profiles[0] : m.profiles;
    return {
      user_id: m.user_id,
      full_name: p?.display_name || p?.full_name || "Coparente",
    };
  });

  // Vacations list (próximas + atuais)
  const listResult = await listVacations(supabase, groupId, { includesPast: false, limit: 20 });
  const vacations = listResult.ok ? listResult.data : [];

  const params = await searchParams;
  const errorMsg = typeof params.error === "string" ? params.error : null;
  const successMsg = typeof params.success === "string" ? params.success : null;

  return (
    <div className="max-w-2xl mx-auto pb-20 px-4 md:px-0">
      {/* Header */}
      <div className="flex items-center gap-3 py-4">
        <Link href="/calendario" className="text-gray-500 hover:text-gray-700">
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </Link>
        <h1 className="text-xl font-bold text-dark">Períodos de Férias</h1>
      </div>

      {/* Flash messages */}
      {errorMsg ? (
        <div className="mb-4 bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700">
          {errorMsg}
        </div>
      ) : null}
      {successMsg ? (
        <div className="mb-4 bg-green-50 border border-green-200 rounded-xl p-4 text-sm text-green-700">
          {successMsg}
        </div>
      ) : null}

      {/* Explainer */}
      <div className="bg-primary/10 border border-primary/20 rounded-xl p-4 mb-6 flex gap-3">
        <svg className="w-6 h-6 text-primary flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 19.5l16.5-4.125M12 6.75v-1.5m0 1.5c-1.036 0-2.087.158-3.09.47-1.002.31-1.94.745-2.748 1.27l5.838 4.405M12 6.75c1.036 0 2.087.158 3.09.47 1.002.31 1.94.745 2.748 1.27l-5.838 4.405M19.5 6.5l1.5 1.5-3.5 3.5L15 8l4.5-1.5z" />
        </svg>
        <p className="text-sm text-dark leading-relaxed">
          <span className="font-semibold">Período de férias</span> sobrepõe a escala regular no calendário, agenda e próxima troca.
          Use isto pra viagens, recesso escolar, ou qualquer período onde o coparente padrão da escala não estará com a criança.
        </p>
      </div>

      {/* Upcoming vacations list */}
      {vacations.length > 0 ? (
        <section className="mb-6">
          <h2 className="text-sm font-semibold text-gray-600 uppercase tracking-wide mb-3">
            Próximas / em andamento ({vacations.length})
          </h2>
          <ul className="space-y-2">
            {vacations.map((v) => (
              <li key={v.id} className="bg-white rounded-xl border border-gray-100 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">✈️</span>
                      <span className="font-semibold text-dark truncate">
                        {v.childName || "Família"} · com {v.responsibleName || "Coparente"}
                      </span>
                    </div>
                    <div className="text-sm text-muted mt-1">
                      {formatRangePtBr(v.startDate, v.endDate)} ({daysBetween(v.startDate, v.endDate)} {daysBetween(v.startDate, v.endDate) === 1 ? "dia" : "dias"})
                    </div>
                    {v.notes ? (
                      <p className="text-xs text-muted mt-2 italic line-clamp-2">{v.notes}</p>
                    ) : null}
                  </div>
                  <form action={deleteVacation}>
                    <input type="hidden" name="vacationId" value={v.id} />
                    <input type="hidden" name="groupId" value={groupId} />
                    <button
                      type="submit"
                      className="text-red-500 hover:text-red-700 hover:bg-red-50 rounded-lg p-2 transition-colors"
                      aria-label="Remover este período de férias"
                      title="Remover"
                    >
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M1 7h22M11 3h2a2 2 0 012 2v2H9V5a2 2 0 012-2z" />
                      </svg>
                    </button>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : (
        <section className="mb-6 bg-gray-50 border border-gray-100 rounded-xl p-6 text-center">
          <div className="text-3xl mb-2">📭</div>
          <p className="text-sm text-muted">Nenhum período de férias cadastrado ainda.</p>
        </section>
      )}

      {/* Create form */}
      <section>
        <h2 className="text-sm font-semibold text-gray-600 uppercase tracking-wide mb-3">
          Cadastrar novas férias
        </h2>
        <NewVacationForm
          groupId={groupId}
          // eslint-disable-next-line react/no-children-prop -- "children" é a lista de filhos da família, não slot React
          children={children || []}
          members={membersList}
          currentUserId={user.id}
        />
      </section>
    </div>
  );
}

function formatRangePtBr(start: string, end: string): string {
  const s = new Date(start + "T12:00:00");
  const e = new Date(end + "T12:00:00");
  const sLabel = s.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
  const eLabel = e.toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: s.getFullYear() !== e.getFullYear() ? "numeric" : undefined });
  if (start === end) return sLabel;
  return `${sLabel} – ${eLabel}`;
}

function daysBetween(start: string, end: string): number {
  const s = new Date(start + "T12:00:00").getTime();
  const e = new Date(end + "T12:00:00").getTime();
  return Math.round((e - s) / 86400000) + 1;
}
