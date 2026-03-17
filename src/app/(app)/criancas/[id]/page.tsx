import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { updateChild } from "@/actions/group";
import Link from "next/link";

export default async function ChildDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: child } = await supabase
    .from("children")
    .select("*")
    .eq("id", id)
    .single();

  if (!child) notFound();

  // Get health logs for this child
  const { data: healthLogs } = await supabase
    .from("health_logs")
    .select("*, profiles!health_logs_logged_by_fkey(full_name)")
    .eq("child_id", id)
    .order("logged_at", { ascending: false })
    .limit(5);

  const age = Math.floor(
    (Date.now() - new Date(child.birth_date).getTime()) / (365.25 * 24 * 60 * 60 * 1000)
  );

  return (
    <div className="max-w-lg mx-auto space-y-6 pb-20">
      <div className="flex items-center gap-3">
        <Link href="/criancas" className="text-muted hover:text-dark">
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </Link>
        <h1 className="text-2xl font-bold text-dark">{child.full_name}</h1>
      </div>

      {/* Info Card */}
      <div className="bg-white rounded-xl p-6 shadow-sm">
        <div className="flex items-center gap-4 mb-4">
          <div className="w-16 h-16 bg-accent/20 rounded-full flex items-center justify-center">
            <span className="text-3xl">👶</span>
          </div>
          <div>
            <h2 className="text-xl font-bold text-dark">{child.full_name}</h2>
            <p className="text-muted">{age} {age === 1 ? "ano" : "anos"} - {new Date(child.birth_date).toLocaleDateString("pt-BR")}</p>
          </div>
        </div>

        {child.allergies && child.allergies.length > 0 && (
          <div className="mb-3">
            <p className="text-sm font-medium text-dark mb-1">Alergias:</p>
            <div className="flex flex-wrap gap-1">
              {child.allergies.map((a: string, i: number) => (
                <span key={i} className="text-xs bg-error/10 text-error px-2 py-1 rounded-full">{a}</span>
              ))}
            </div>
          </div>
        )}

        {child.notes && (
          <div>
            <p className="text-sm font-medium text-dark mb-1">Observacoes:</p>
            <p className="text-sm text-muted">{child.notes}</p>
          </div>
        )}
      </div>

      {/* Edit Form */}
      <details className="bg-white rounded-xl shadow-sm">
        <summary className="p-4 font-semibold text-dark cursor-pointer">Editar informacoes</summary>
        <form action={updateChild} className="p-4 pt-0 space-y-4">
          <input type="hidden" name="id" value={child.id} />
          <div>
            <label className="block text-sm font-medium text-dark mb-1">Nome completo</label>
            <input type="text" name="fullName" defaultValue={child.full_name} required
              className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary" />
          </div>
          <div>
            <label className="block text-sm font-medium text-dark mb-1">Data de nascimento</label>
            <input type="date" name="birthDate" defaultValue={child.birth_date} required
              className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary" />
          </div>
          <div>
            <label className="block text-sm font-medium text-dark mb-1">Alergias</label>
            <input type="text" name="allergies" defaultValue={child.allergies?.join(", ")}
              className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary" />
          </div>
          <div>
            <label className="block text-sm font-medium text-dark mb-1">Observacoes</label>
            <textarea name="notes" rows={3} defaultValue={child.notes || ""}
              className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary" />
          </div>
          <button type="submit" className="w-full py-3 bg-primary text-white font-semibold rounded-lg hover:bg-primary-dark transition-colors">
            Salvar alteracoes
          </button>
        </form>
      </details>

      {/* Recent Health Logs */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg font-semibold text-dark">Registros de Saude</h3>
          <Link href={`/saude?child=${id}`} className="text-sm text-primary font-medium">Ver todos</Link>
        </div>
        {healthLogs && healthLogs.length > 0 ? (
          <div className="space-y-2">
            {healthLogs.map((log) => (
              <div key={log.id} className="bg-white rounded-xl p-3 shadow-sm">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-dark capitalize">{log.log_type}</span>
                  <span className="text-xs text-muted">{new Date(log.logged_at).toLocaleDateString("pt-BR")}</span>
                </div>
                {log.value && <p className="text-sm text-muted mt-1">{log.value}</p>}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted bg-white rounded-xl p-4 shadow-sm">Nenhum registro ainda.</p>
        )}
      </div>
    </div>
  );
}
