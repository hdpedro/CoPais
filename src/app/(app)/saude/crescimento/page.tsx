import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";

export default async function CrescimentoPage({
  searchParams,
}: {
  searchParams: Promise<{ crianca?: string; success?: string; error?: string }>;
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
    .select("group_id")
    .eq("user_id", user.id);

  if (!memberships || memberships.length === 0) redirect("/onboarding");

  const groupId = memberships[0].group_id;

  const { data: children } = await supabase
    .from("children")
    .select("id, full_name, birth_date")
    .eq("group_id", groupId)
    .order("birth_date");

  if (!children || children.length === 0) {
    return (
      <div className="max-w-lg mx-auto pb-20">
        <div className="flex items-center gap-3 mb-6">
          <Link href="/saude" className="text-muted hover:text-dark">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </Link>
          <h1 className="text-2xl font-bold text-dark">Crescimento</h1>
        </div>
        <div className="bg-white rounded-xl p-8 shadow-sm text-center">
          <p className="text-muted text-sm">Adicione uma crianca primeiro.</p>
        </div>
      </div>
    );
  }

  const selectedChildId =
    params.crianca && children.find((c) => c.id === params.crianca)
      ? params.crianca
      : children[0].id;

  const selectedChild = children.find((c) => c.id === selectedChildId)!;

  // Fetch growth records
  const { data: records } = await supabase
    .from("growth_records")
    .select("id, measured_date, weight_kg, height_cm, head_cm, notes")
    .eq("child_id", selectedChildId)
    .order("measured_date", { ascending: false });

  const growthRecords = records || [];
  const latest = growthRecords[0] || null;

  function formatDate(dateStr: string) {
    return new Date(dateStr + "T12:00:00").toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  }

  function formatShortDate(dateStr: string) {
    return new Date(dateStr + "T12:00:00").toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  }

  return (
    <div className="max-w-lg mx-auto pb-20">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Link href="/saude" className="text-muted hover:text-dark">
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-dark">Crescimento</h1>
          <p className="text-sm text-muted">
            Acompanhamento de {selectedChild.full_name.split(" ")[0]}
          </p>
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

      {/* Child Selector */}
      {children.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-1 mb-6 scrollbar-hide">
          {children.map((child) => {
            const isActive = child.id === selectedChildId;
            return (
              <Link
                key={child.id}
                href={`/saude/crescimento?crianca=${child.id}`}
                className={`flex-shrink-0 px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-primary text-white border-2 border-primary"
                    : "bg-white text-dark border-2 border-gray-200 hover:border-primary/40"
                }`}
              >
                {child.full_name.split(" ")[0]}
              </Link>
            );
          })}
        </div>
      )}

      {/* Current Stats */}
      {latest ? (
        <div className="grid grid-cols-3 gap-3 mb-6">
          <div className="bg-white rounded-xl p-3 shadow-sm text-center">
            <p className="text-xs text-muted mb-1">Peso</p>
            <p className="text-xl font-bold text-dark">
              {latest.weight_kg ? `${latest.weight_kg}` : "—"}
            </p>
            <p className="text-[10px] text-muted">kg</p>
          </div>
          <div className="bg-white rounded-xl p-3 shadow-sm text-center">
            <p className="text-xs text-muted mb-1">Altura</p>
            <p className="text-xl font-bold text-dark">
              {latest.height_cm ? `${latest.height_cm}` : "—"}
            </p>
            <p className="text-[10px] text-muted">cm</p>
          </div>
          <div className="bg-white rounded-xl p-3 shadow-sm text-center">
            <p className="text-xs text-muted mb-1">Cabeca</p>
            <p className="text-xl font-bold text-dark">
              {latest.head_cm ? `${latest.head_cm}` : "—"}
            </p>
            <p className="text-[10px] text-muted">cm</p>
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-xl p-8 shadow-sm text-center mb-6">
          <p className="text-4xl mb-3">📏</p>
          <p className="text-muted text-sm">Nenhuma medida registrada ainda.</p>
        </div>
      )}

      {latest && (
        <p className="text-xs text-muted text-center mb-6">
          Ultima medida: {formatDate(latest.measured_date)}
        </p>
      )}

      {/* History */}
      {growthRecords.length > 0 && (
        <section className="mb-6">
          <h2 className="text-sm font-semibold text-dark mb-3 px-1">
            Historico de Medidas
          </h2>
          <div className="space-y-3">
            {growthRecords.map((record) => (
              <div
                key={record.id}
                className="bg-white rounded-xl p-4 shadow-sm"
              >
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-full bg-emerald-50 flex items-center justify-center flex-shrink-0">
                    <span className="text-base">📏</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3">
                      <p className="text-sm font-semibold text-dark">
                        {record.weight_kg ? `${record.weight_kg} kg` : ""}
                        {record.weight_kg && record.height_cm ? " — " : ""}
                        {record.height_cm ? `${record.height_cm} cm` : ""}
                      </p>
                      {record.head_cm && (
                        <span className="text-xs text-muted">
                          PC: {record.head_cm} cm
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted mt-0.5">
                      {formatShortDate(record.measured_date)}
                    </p>
                    {record.notes && (
                      <p className="text-xs text-muted mt-1">{record.notes}</p>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Add button */}
      <Link
        href="/saude/crescimento/novo"
        className="fixed bottom-24 left-1/2 -translate-x-1/2 z-10 inline-flex items-center gap-2 px-5 py-3 bg-accent text-white text-sm font-semibold rounded-full shadow-lg hover:shadow-xl transition-all"
      >
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
        </svg>
        Registrar Medida
      </Link>
    </div>
  );
}
