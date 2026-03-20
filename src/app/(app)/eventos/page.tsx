import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createEvent } from "@/actions/events";
import EventCard from "./EventCard";

export default async function EventosPage() {
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

  const { data: events } = await supabase
    .from("events")
    .select("*, children(full_name), profiles!events_created_by_fkey(full_name)")
    .eq("group_id", groupId)
    .order("event_date", { ascending: true });

  const today = new Date().toISOString().split("T")[0];

  // Active upcoming events (not cancelled, future date)
  const upcoming = events?.filter(e => e.event_date >= today && e.status !== "cancelled") || [];
  // Past events OR cancelled events (regardless of date)
  const pastAndCancelled = events?.filter(e => e.event_date < today || e.status === "cancelled") || [];

  return (
    <div className="space-y-6 pb-20">
      <div>
        <h1 className="text-2xl font-bold text-dark">Eventos</h1>
        <p className="text-sm text-muted mt-1">Festas, encontros e compromissos sociais das criancas.</p>
      </div>

      {/* New Event Form */}
      <form action={createEvent} className="bg-white rounded-xl p-4 shadow-sm space-y-3">
        <h3 className="font-semibold text-dark">Novo evento</h3>
        <input type="hidden" name="groupId" value={groupId} />

        <input type="text" name="title" required placeholder="Nome do evento (ex: Festa do Joao)"
          className="w-full px-3 py-3 border border-gray-200 rounded-lg text-base text-dark placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary/50" />

        <textarea name="description" rows={3} placeholder="Detalhes do evento..."
          className="w-full px-3 py-3 border border-gray-200 rounded-lg text-base text-dark placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary/50" />

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-dark mb-1">Data</label>
            <input type="date" name="eventDate" required
              className="w-full px-3 py-3 border border-gray-200 rounded-lg text-base text-dark focus:outline-none focus:ring-2 focus:ring-primary/50" />
          </div>
          <div>
            <label className="block text-sm font-medium text-dark mb-1">Horario</label>
            <input type="time" name="eventTime" placeholder="Horario"
              className="w-full px-3 py-3 border border-gray-200 rounded-lg text-base text-dark placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary/50" />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-dark mb-1">Local</label>
            <input type="text" name="location" placeholder="Local do evento"
              className="w-full px-3 py-3 border border-gray-200 rounded-lg text-base text-dark placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary/50" />
          </div>
          <div>
            <label className="block text-sm font-medium text-dark mb-1">Crianca</label>
            <select name="childId"
              className="w-full px-3 py-3 border border-gray-200 rounded-lg text-base text-dark focus:outline-none focus:ring-2 focus:ring-primary/50">
              <option value="">Selecione...</option>
              {children?.map((c) => (
                <option key={c.id} value={c.id}>{c.full_name}</option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-dark mb-1">Convite / Arte (imagem)</label>
          <input type="file" name="image" accept="image/*"
            className="w-full text-sm text-muted file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-accent/10 file:text-accent hover:file:bg-accent/20" />
        </div>

        <button type="submit"
          className="w-full py-3 bg-primary text-white font-semibold rounded-lg hover:bg-primary-dark transition-colors">
          Adicionar Evento
        </button>
      </form>

      {/* Upcoming Events (active only) */}
      {upcoming.length > 0 && (
        <div>
          <h3 className="text-lg font-semibold text-dark mb-3">Proximos eventos</h3>
          <div className="space-y-3">
            {upcoming.map((event) => (
              <EventCard
                key={event.id}
                event={event}
                groupId={groupId}
                childrenList={children || []}
              />
            ))}
          </div>
        </div>
      )}

      {/* Past & Cancelled Events */}
      {pastAndCancelled.length > 0 && (
        <div>
          <h3 className="text-lg font-semibold text-dark mb-3">Eventos passados e cancelados</h3>
          <div className="space-y-2">
            {pastAndCancelled.map((event) => (
              <EventCard
                key={event.id}
                event={event}
                groupId={groupId}
                childrenList={children || []}
                isPast
              />
            ))}
          </div>
        </div>
      )}

      {(!events || events.length === 0) && (
        <div className="bg-white rounded-xl p-8 shadow-sm text-center">
          <p className="text-muted">Nenhum evento cadastrado ainda.</p>
        </div>
      )}
    </div>
  );
}
