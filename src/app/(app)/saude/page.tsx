import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { createHealthLog } from "@/actions/health";

export default async function HealthPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
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
    .from("health_logs")
    .select("*, children(full_name), profiles!health_logs_logged_by_fkey(full_name)")
    .eq("group_id", groupId)
    .order("logged_at", { ascending: false })
    .limit(30);

  const typeLabels: Record<string, string> = {
    fever: "Febre",
    medication: "Medicacao",
    mood: "Humor",
    screen_time: "Tempo de tela",
    food: "Alimentacao",
    sleep: "Sono",
    weight: "Peso",
    height: "Altura",
    vaccine: "Vacina",
    other: "Outro",
  };

  const typeIcons: Record<string, string> = {
    fever: "🌡️",
    medication: "💊",
    mood: "😊",
    screen_time: "📱",
    food: "🍽️",
    sleep: "😴",
    weight: "⚖️",
    height: "📏",
    vaccine: "💉",
    other: "📝",
  };

  return (
    <div className="space-y-6 pb-20">
      <h1 className="text-2xl font-bold text-dark">Saude</h1>

      {/* Quick Log Form */}
      <form action={createHealthLog} className="bg-white rounded-xl p-4 shadow-sm space-y-3">
        <h3 className="font-semibold text-dark">Novo registro</h3>
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

        <input type="text" name="value" placeholder="Valor (ex: 38.5°C, Bom, 2h)"
          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
        <textarea name="notes" rows={2} placeholder="Observacoes..."
          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />

        <button type="submit"
          className="w-full py-2 bg-primary text-white text-sm font-semibold rounded-lg hover:bg-primary-dark transition-colors">
          Registrar
        </button>
      </form>

      {/* Logs */}
      {logs && logs.length > 0 ? (
        <div className="space-y-2">
          {logs.map((log) => (
            <div key={log.id} className="bg-white rounded-xl p-4 shadow-sm">
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <span>{typeIcons[log.log_type] || "📝"}</span>
                  <span className="font-medium text-dark text-sm">{typeLabels[log.log_type] || log.log_type}</span>
                  <span className="text-xs text-muted">- {(log.children as any)?.full_name}</span>
                </div>
                <span className="text-xs text-muted">{new Date(log.logged_at).toLocaleDateString("pt-BR")}</span>
              </div>
              {log.value && <p className="text-sm text-dark">{log.value}</p>}
              {log.notes && <p className="text-xs text-muted mt-1">{log.notes}</p>}
              <p className="text-xs text-muted mt-1">Por {(log.profiles as any)?.full_name}</p>
            </div>
          ))}
        </div>
      ) : (
        <div className="bg-white rounded-xl p-8 shadow-sm text-center">
          <p className="text-muted">Nenhum registro de saude ainda.</p>
        </div>
      )}
    </div>
  );
}
