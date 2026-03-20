import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createSchoolLog } from "@/actions/school";

export default async function EscolaPage() {
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
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
    .select("id, full_name")
    .eq("group_id", groupId);

  const { data: logs } = await supabase
    .from("school_logs")
    .select("*, children(full_name), profiles!school_logs_logged_by_fkey(full_name)")
    .eq("group_id", groupId)
    .order("log_date", { ascending: false })
    .limit(30);

  const typeLabels: Record<string, string> = {
    grade: "Nota / Avaliacao",
    meeting: "Reuniao",
    behavior: "Comportamento",
    homework: "Tarefa / Licao",
    event: "Evento Escolar",
    absence: "Falta",
    achievement: "Conquista",
    concern: "Preocupacao",
    other: "Outro",
  };

  const typeIcons: Record<string, string> = {
    grade: "📊",
    meeting: "👥",
    behavior: "📝",
    homework: "📚",
    event: "🎉",
    absence: "🚫",
    achievement: "🏆",
    concern: "⚠️",
    other: "📌",
  };

  const today = new Date().toISOString().split("T")[0];

  return (
    <div className="space-y-6 pb-20">
      <div>
        <h1 className="text-2xl font-bold text-dark">Escola</h1>
        <p className="text-sm text-muted mt-1">
          Acompanhamento da rotina escolar e desenvolvimento das criancas.
        </p>
      </div>

      {/* New School Log Form */}
      <form action={createSchoolLog} className="bg-white rounded-xl p-4 shadow-sm space-y-3">
        <h3 className="font-semibold text-dark">Novo registro escolar</h3>
        <input type="hidden" name="groupId" value={groupId} />

        <div className="grid grid-cols-2 gap-3">
          <select name="childId" required
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/50">
            <option value="">Crianca...</option>
            {children?.map((c) => (
              <option key={c.id} value={c.id}>{c.full_name}</option>
            ))}
          </select>
          <select name="logType" required
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/50">
            <option value="">Tipo...</option>
            {Object.entries(typeLabels).map(([k, v]) => (
              <option key={k} value={k}>{typeIcons[k]} {v}</option>
            ))}
          </select>
        </div>

        <input type="text" name="title" required placeholder="Titulo (ex: Reuniao de pais, Prova de matematica)"
          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />

        <textarea name="description" rows={2} placeholder="Detalhes..."
          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />

        <input type="date" name="logDate" defaultValue={today}
          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />

        <button type="submit"
          className="w-full py-2 bg-primary text-white text-sm font-semibold rounded-lg hover:bg-primary-dark transition-colors">
          Registrar
        </button>
      </form>

      {/* School Logs */}
      {logs && logs.length > 0 ? (
        <div className="space-y-2">
          {logs.map((log) => (
            <div key={log.id} className="bg-white rounded-xl p-4 shadow-sm">
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <span className="text-lg">{typeIcons[log.log_type] || "📌"}</span>
                  <div>
                    <h4 className="font-medium text-dark text-sm">{log.title}</h4>
                    <p className="text-xs text-muted">
                      {typeLabels[log.log_type]} - {(log.children as any)?.full_name}
                    </p>
                  </div>
                </div>
                <span className="text-xs text-muted">{new Date(log.log_date).toLocaleDateString("pt-BR")}</span>
              </div>
              {log.description && <p className="text-sm text-muted mt-2 ml-8">{log.description}</p>}
              <p className="text-xs text-muted mt-1 ml-8">Por {(log.profiles as any)?.full_name}</p>
            </div>
          ))}
        </div>
      ) : (
        <div className="bg-white rounded-xl p-8 shadow-sm text-center">
          <p className="text-muted">Nenhum registro escolar ainda.</p>
          <p className="text-sm text-muted mt-1">Registre reunioes, notas, tarefas e mais.</p>
        </div>
      )}
    </div>
  );
}
