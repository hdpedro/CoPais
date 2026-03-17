import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";

export default async function CalendarPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: memberships } = await supabase
    .from("group_members")
    .select("group_id")
    .eq("user_id", user.id);

  if (!memberships || memberships.length === 0) redirect("/onboarding");
  const groupId = memberships[0].group_id;

  // Get current month events
  const now = new Date();
  const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split("T")[0];
  const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split("T")[0];

  const { data: events } = await supabase
    .from("custody_events")
    .select("*, children(full_name), profiles!custody_events_responsible_user_id_fkey(full_name)")
    .eq("group_id", groupId)
    .gte("end_date", firstDay)
    .lte("start_date", lastDay)
    .order("start_date");

  // Get all events from today forward
  const today = new Date().toISOString().split("T")[0];
  const { data: upcomingEvents } = await supabase
    .from("custody_events")
    .select("*, children(full_name), profiles!custody_events_responsible_user_id_fkey(full_name)")
    .eq("group_id", groupId)
    .gte("end_date", today)
    .order("start_date")
    .limit(20);

  const monthNames = [
    "Janeiro", "Fevereiro", "Marco", "Abril", "Maio", "Junho",
    "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"
  ];

  const typeLabels: Record<string, string> = {
    regular: "Regular",
    holiday: "Feriado",
    swap: "Troca",
    vacation: "Ferias",
    special: "Especial",
  };

  const typeColors: Record<string, string> = {
    regular: "bg-primary/10 text-primary",
    holiday: "bg-accent/10 text-accent",
    swap: "bg-secondary/10 text-secondary",
    vacation: "bg-success/10 text-success",
    special: "bg-purple-100 text-purple-600",
  };

  return (
    <div className="space-y-6 pb-20">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-dark">Calendario</h1>
          <p className="text-muted text-sm">{monthNames[now.getMonth()]} {now.getFullYear()}</p>
        </div>
        <Link href="/calendario/novo"
          className="px-4 py-2 bg-primary text-white text-sm font-semibold rounded-lg hover:bg-primary-dark transition-colors">
          + Evento
        </Link>
      </div>

      {/* Month Summary */}
      {events && events.length > 0 ? (
        <div className="bg-white rounded-xl p-4 shadow-sm">
          <h3 className="font-semibold text-dark mb-3">Eventos do mes</h3>
          <div className="space-y-2">
            {events.map((event) => (
              <div key={event.id} className="flex items-center gap-3 p-3 bg-light rounded-lg">
                <div className="w-12 text-center flex-shrink-0">
                  <p className="text-lg font-bold text-primary">{new Date(event.start_date).getDate()}</p>
                  <p className="text-xs text-muted">
                    {event.start_date !== event.end_date ? `- ${new Date(event.end_date).getDate()}` : ""}
                  </p>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-dark text-sm truncate">{(event.children as any)?.full_name}</p>
                  <p className="text-xs text-muted">Com {(event.profiles as any)?.full_name}</p>
                </div>
                <span className={`text-xs px-2 py-1 rounded-full ${typeColors[event.custody_type] || typeColors.regular}`}>
                  {typeLabels[event.custody_type] || event.custody_type}
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-xl p-8 shadow-sm text-center">
          <p className="text-muted">Nenhum evento neste mes.</p>
        </div>
      )}

      {/* Upcoming */}
      {upcomingEvents && upcomingEvents.length > 0 && (
        <div>
          <h3 className="text-lg font-semibold text-dark mb-3">Proximos eventos</h3>
          <div className="space-y-2">
            {upcomingEvents.map((event) => (
              <div key={event.id} className="bg-white rounded-xl p-4 shadow-sm">
                <div className="flex items-center justify-between mb-1">
                  <span className="font-medium text-dark text-sm">{(event.children as any)?.full_name}</span>
                  <span className={`text-xs px-2 py-1 rounded-full ${typeColors[event.custody_type] || typeColors.regular}`}>
                    {typeLabels[event.custody_type] || event.custody_type}
                  </span>
                </div>
                <p className="text-xs text-muted">
                  {new Date(event.start_date).toLocaleDateString("pt-BR")} - {new Date(event.end_date).toLocaleDateString("pt-BR")}
                </p>
                <p className="text-xs text-muted">Responsavel: {(event.profiles as any)?.full_name}</p>
                {event.notes && <p className="text-xs text-muted mt-1 italic">{event.notes}</p>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
