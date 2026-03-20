import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { updateIllnessEpisode } from "@/actions/health";
import { getBrazilToday } from "@/lib/calendar-utils";

export default async function DoencasPage({
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

  const groupId = memberships[0].group_id;
  const isReadonly = memberships[0].role === "readonly";

  const { data: episodes } = await supabase
    .from("illness_episodes")
    .select("*, children(full_name)")
    .eq("group_id", groupId)
    .order("start_date", { ascending: false });

  const activeEpisodes = (episodes || []).filter(
    (e) => e.status === "active"
  );
  const recoveredEpisodes = (episodes || []).filter(
    (e) => e.status === "recovered"
  );

  const today = getBrazilToday();

  function formatDate(dateStr: string) {
    return new Date(dateStr + "T12:00:00").toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  }

  function daysBetween(start: string, end: string) {
    const s = new Date(start + "T12:00:00").getTime();
    const e = new Date(end + "T12:00:00").getTime();
    return Math.max(1, Math.ceil((e - s) / (1000 * 60 * 60 * 24)));
  }

  return (
    <div className="max-w-lg mx-auto pb-20">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Link href="/saude" className="text-muted hover:text-dark">
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
          <h1 className="text-2xl font-bold text-dark">
            Historico de Doencas
          </h1>
          <p className="text-sm text-muted">Episodios de doencas</p>
        </div>
      </div>

      {/* Alerts */}
      {params.success && (
        <div className="bg-green-50 border border-green-200 text-green-700 rounded-lg p-3 mb-4 text-sm">
          {decodeURIComponent(params.success)}
        </div>
      )}
      {params.error && (
        <div className="bg-red-50 border border-error/20 text-error rounded-lg p-3 mb-4 text-sm">
          {decodeURIComponent(params.error)}
        </div>
      )}

      {/* Active Episodes */}
      {activeEpisodes.length > 0 && (
        <section className="mb-6">
          <h2 className="text-sm font-semibold text-dark mb-3 px-1">
            Episodios ativos
          </h2>
          <div className="space-y-3">
            {activeEpisodes.map((ep) => (
              <div
                key={ep.id}
                className="bg-white rounded-xl p-4 shadow-sm border-l-4 border-red-400"
              >
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <h3 className="text-sm font-bold text-dark">{ep.title}</h3>
                    <p className="text-xs text-muted">
                      {(ep.children as any)?.full_name} &middot;{" "}
                      {formatDate(ep.start_date)}
                    </p>
                  </div>
                  <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-600 bg-red-50 px-2 py-1 rounded-full">
                    <span className="text-[10px]">●</span> Ativo
                  </span>
                </div>

                {ep.symptoms && ep.symptoms.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {ep.symptoms.map((s: string, i: number) => (
                      <span
                        key={i}
                        className="bg-gray-100 text-gray-600 rounded px-2 py-0.5 text-xs"
                      >
                        {s}
                      </span>
                    ))}
                  </div>
                )}

                {ep.diagnosis && (
                  <p className="text-xs text-muted mb-3">
                    <span className="font-medium">Diagnostico:</span>{" "}
                    {ep.diagnosis}
                  </p>
                )}

                {!isReadonly && (
                  <form action={updateIllnessEpisode}>
                    <input type="hidden" name="episodeId" value={ep.id} />
                    <input type="hidden" name="status" value="recovered" />
                    <input type="hidden" name="endDate" value={today} />
                    <button
                      type="submit"
                      className="w-full text-center text-xs font-semibold text-green-700 bg-green-50 hover:bg-green-100 rounded-lg py-2 transition-colors"
                    >
                      Marcar como recuperada
                    </button>
                  </form>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Recovered Episodes */}
      <section className="mb-6">
        <h2 className="text-sm font-semibold text-dark mb-3 px-1">
          Recuperadas
        </h2>
        {recoveredEpisodes.length > 0 ? (
          <div className="space-y-3">
            {recoveredEpisodes.map((ep) => (
              <div
                key={ep.id}
                className="bg-white/80 rounded-xl p-4 shadow-sm border-l-4 border-green-400"
              >
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <h3 className="text-sm font-bold text-dark">{ep.title}</h3>
                    <p className="text-xs text-muted">
                      {(ep.children as any)?.full_name} &middot;{" "}
                      {formatDate(ep.start_date)}
                      {ep.end_date && (
                        <>
                          {" "}
                          &rarr; {formatDate(ep.end_date)} (
                          {daysBetween(ep.start_date, ep.end_date)} dias)
                        </>
                      )}
                    </p>
                  </div>
                  <span className="inline-flex items-center gap-1 text-xs font-semibold text-green-600 bg-green-50 px-2 py-1 rounded-full">
                    ✓ Recuperada
                  </span>
                </div>

                {ep.symptoms && ep.symptoms.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mb-1">
                    {ep.symptoms.map((s: string, i: number) => (
                      <span
                        key={i}
                        className="bg-gray-100 text-gray-500 rounded px-2 py-0.5 text-xs"
                      >
                        {s}
                      </span>
                    ))}
                  </div>
                )}

                {ep.diagnosis && (
                  <p className="text-xs text-muted">
                    <span className="font-medium">Diagnostico:</span>{" "}
                    {ep.diagnosis}
                  </p>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="bg-white rounded-xl p-6 shadow-sm text-center">
            <p className="text-muted text-sm">
              Nenhum episodio recuperado registrado.
            </p>
          </div>
        )}
      </section>

      {/* Empty state */}
      {(!episodes || episodes.length === 0) && (
        <div className="bg-white rounded-xl p-8 shadow-sm text-center mb-6">
          <p className="text-4xl mb-3">🤒</p>
          <p className="text-muted text-sm mb-1">
            Nenhum episodio de doenca registrado.
          </p>
          <p className="text-muted text-xs">
            Registre episodios para acompanhar o historico de saude.
          </p>
        </div>
      )}

      {/* Add button */}
      {!isReadonly && (
        <Link
          href="/saude/doencas/nova"
          className="fixed bottom-24 left-1/2 -translate-x-1/2 z-10 inline-flex items-center gap-2 px-5 py-3 bg-accent text-white text-sm font-semibold rounded-full shadow-lg hover:shadow-xl transition-all"
        >
          <svg
            className="w-5 h-5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 4v16m8-8H4"
            />
          </svg>
          Registrar Episodio
        </Link>
      )}
    </div>
  );
}
