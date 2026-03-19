"use client";

import { useState } from "react";
import { updateEvent, deleteEvent, cancelEvent } from "@/actions/events";

interface EventCardProps {
  event: {
    id: string;
    title: string;
    description: string | null;
    event_date: string;
    event_time: string | null;
    location: string | null;
    image_url: string | null;
    child_id: string | null;
    status?: string;
    children: { full_name: string } | null;
  };
  groupId: string;
  childrenList: { id: string; full_name: string }[];
  isPast?: boolean;
}

export default function EventCard({ event, groupId, childrenList, isPast = false }: EventCardProps) {
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);

  const isCancelled = event.status === "cancelled";

  const inputClass =
    "w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-dark placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary/50";

  if (editing) {
    return (
      <div className="bg-white rounded-xl shadow-sm p-4 border-2 border-primary/30">
        <form action={updateEvent} className="space-y-3">
          <input type="hidden" name="eventId" value={event.id} />
          <input type="hidden" name="groupId" value={groupId} />

          <div className="flex items-center justify-between mb-1">
            <h4 className="text-sm font-semibold text-primary">Editar evento</h4>
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="text-xs text-muted hover:text-dark"
            >
              Cancelar
            </button>
          </div>

          <input
            type="text"
            name="title"
            required
            defaultValue={event.title}
            placeholder="Nome do evento"
            className={inputClass}
          />

          <textarea
            name="description"
            rows={2}
            defaultValue={event.description || ""}
            placeholder="Detalhes..."
            className={inputClass}
          />

          <div className="grid grid-cols-2 gap-2">
            <input
              type="date"
              name="eventDate"
              required
              defaultValue={event.event_date}
              className={inputClass}
            />
            <input
              type="time"
              name="eventTime"
              defaultValue={event.event_time || ""}
              className={inputClass}
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <input
              type="text"
              name="location"
              defaultValue={event.location || ""}
              placeholder="Local"
              className={inputClass}
            />
            <select
              name="childId"
              defaultValue={event.child_id || ""}
              className={inputClass}
            >
              <option value="">Crianca...</option>
              {childrenList.map((c) => (
                <option key={c.id} value={c.id}>{c.full_name}</option>
              ))}
            </select>
          </div>

          <button
            type="submit"
            className="w-full py-2 bg-primary text-white text-sm font-semibold rounded-lg hover:bg-primary-dark transition-colors"
          >
            Salvar Alteracoes
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className={`bg-white rounded-xl shadow-sm overflow-hidden ${isCancelled ? "opacity-60" : ""}`}>
      {event.image_url && (
        <img src={event.image_url} alt={event.title} className="w-full h-40 object-cover" />
      )}
      <div className="p-4">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <h3 className={`font-semibold text-base ${isCancelled ? "text-muted line-through" : "text-dark"}`}>
              {event.title}
            </h3>
            {isCancelled && (
              <span className="text-xs bg-red-100 text-red-600 px-2 py-0.5 rounded-full font-medium">
                Cancelado
              </span>
            )}
          </div>
          <span className={`text-xs px-2 py-1 rounded-full whitespace-nowrap ml-2 ${
            isCancelled ? "bg-gray-100 text-muted" : "bg-primary/10 text-primary"
          }`}>
            {new Date(event.event_date).toLocaleDateString("pt-BR")}
          </span>
        </div>
        {event.description && (
          <p className={`text-base mb-3 leading-relaxed ${isCancelled ? "text-muted" : "text-dark/80"}`}>
            {event.description}
          </p>
        )}
        <div className="flex flex-wrap items-center gap-3 text-sm text-muted">
          {event.event_time && <span>🕐 {event.event_time}</span>}
          {event.location && <span>📍 {event.location}</span>}
          {(event.children as any)?.full_name && (
            <span>👶 {(event.children as any).full_name}</span>
          )}
        </div>

        {/* Action buttons - only show for non-cancelled events */}
        {!isCancelled && (
          <div className="flex items-center gap-2 mt-3 pt-3 border-t border-gray-100">
            <button
              onClick={() => setEditing(true)}
              className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-primary bg-primary/10 rounded-lg hover:bg-primary/20 transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
              Editar
            </button>

            {!confirmCancel ? (
              <button
                onClick={() => setConfirmCancel(true)}
                className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-amber-600 bg-amber-50 rounded-lg hover:bg-amber-100 transition-colors"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                </svg>
                Cancelar Evento
              </button>
            ) : (
              <form action={cancelEvent} className="flex items-center gap-1">
                <input type="hidden" name="eventId" value={event.id} />
                <input type="hidden" name="groupId" value={groupId} />
                <span className="text-xs text-amber-600 mr-1">Cancelar evento?</span>
                <button
                  type="submit"
                  className="px-2 py-1 text-xs font-medium text-white bg-amber-500 rounded-lg hover:bg-amber-600"
                >
                  Sim
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmCancel(false)}
                  className="px-2 py-1 text-xs font-medium text-muted bg-gray-100 rounded-lg hover:bg-gray-200"
                >
                  Nao
                </button>
              </form>
            )}

            {!confirmDelete ? (
              <button
                onClick={() => setConfirmDelete(true)}
                className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-red-500 bg-red-50 rounded-lg hover:bg-red-100 transition-colors"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
                Excluir
              </button>
            ) : (
              <form action={deleteEvent} className="flex items-center gap-1">
                <input type="hidden" name="eventId" value={event.id} />
                <input type="hidden" name="groupId" value={groupId} />
                <span className="text-xs text-red-500 mr-1">Excluir?</span>
                <button
                  type="submit"
                  className="px-2 py-1 text-xs font-medium text-white bg-red-500 rounded-lg hover:bg-red-600"
                >
                  Sim
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmDelete(false)}
                  className="px-2 py-1 text-xs font-medium text-muted bg-gray-100 rounded-lg hover:bg-gray-200"
                >
                  Nao
                </button>
              </form>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
