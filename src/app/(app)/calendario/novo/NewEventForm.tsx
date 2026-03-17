"use client";

import { useState } from "react";
import { createCustodyEvent } from "@/actions/calendar";

interface NewEventFormProps {
  groupId: string;
  children: { id: string; full_name: string }[];
  members: { user_id: string; full_name: string }[];
}

export default function NewEventForm({ groupId, children, members }: NewEventFormProps) {
  const [isRecurring, setIsRecurring] = useState(false);
  const [hasTime, setHasTime] = useState(false);

  const inputClass =
    "w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary";

  return (
    <form action={createCustodyEvent} className="bg-white rounded-xl p-6 shadow-sm space-y-4">
      <input type="hidden" name="groupId" value={groupId} />
      <input type="hidden" name="isRecurring" value={String(isRecurring)} />

      <div>
        <label className="block text-sm font-medium text-dark mb-1">Crianca</label>
        <select name="childId" required className={inputClass}>
          <option value="">Selecione...</option>
          {children.map((child) => (
            <option key={child.id} value={child.id}>{child.full_name}</option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium text-dark mb-1">Responsavel</label>
        <select name="responsibleUserId" required className={inputClass}>
          <option value="">Selecione...</option>
          {members.map((m) => (
            <option key={m.user_id} value={m.user_id}>{m.full_name}</option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-dark mb-1">Data inicio</label>
          <input type="date" name="startDate" required className={inputClass} />
        </div>
        <div>
          <label className="block text-sm font-medium text-dark mb-1">Data fim</label>
          <input type="date" name="endDate" required className={inputClass} />
        </div>
      </div>

      {/* Time toggle */}
      <div className="flex items-center gap-3">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={hasTime}
            onChange={(e) => setHasTime(e.target.checked)}
            className="w-4 h-4 text-primary rounded border-gray-300 focus:ring-primary"
          />
          <span className="text-sm text-dark">Definir horario</span>
        </label>
      </div>

      {hasTime && (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-dark mb-1">Hora inicio</label>
            <input type="time" name="startTime" className={inputClass} />
          </div>
          <div>
            <label className="block text-sm font-medium text-dark mb-1">Hora fim</label>
            <input type="time" name="endTime" className={inputClass} />
          </div>
        </div>
      )}

      <div>
        <label className="block text-sm font-medium text-dark mb-1">Tipo</label>
        <select name="custodyType" required className={inputClass}>
          <option value="regular">Regular</option>
          <option value="holiday">Feriado</option>
          <option value="swap">Troca</option>
          <option value="vacation">Ferias</option>
          <option value="special">Especial</option>
        </select>
      </div>

      {/* Recurring toggle */}
      <div className="flex items-center gap-3">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={isRecurring}
            onChange={(e) => setIsRecurring(e.target.checked)}
            className="w-4 h-4 text-primary rounded border-gray-300 focus:ring-primary"
          />
          <span className="text-sm text-dark">Evento recorrente</span>
        </label>
      </div>

      {isRecurring && (
        <div className="bg-gray-50 rounded-lg p-4 space-y-3">
          <div>
            <label className="block text-sm font-medium text-dark mb-1">Frequencia</label>
            <select name="recurrenceRule" required className={inputClass}>
              <option value="weekly">Semanal (toda semana)</option>
              <option value="biweekly">Quinzenal (a cada 2 semanas)</option>
              <option value="daily">Diario</option>
              <option value="monthly">Mensal</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-dark mb-1">Repetir ate</label>
            <input type="date" name="recurrenceUntil" required className={inputClass} />
          </div>
          <p className="text-xs text-muted">
            Ex: Ingles toda segunda, Judo toda quarta — selecione a data inicio no dia da semana desejado.
          </p>
        </div>
      )}

      <div>
        <label className="block text-sm font-medium text-dark mb-1">Observacoes</label>
        <textarea
          name="notes"
          rows={3}
          placeholder="Ex: Aula de ingles, Judo..."
          className={inputClass}
        />
      </div>

      <button
        type="submit"
        className="w-full py-3 bg-primary text-white font-semibold rounded-lg hover:bg-primary-dark transition-colors"
      >
        {isRecurring ? "Criar Eventos Recorrentes" : "Criar Evento"}
      </button>
    </form>
  );
}
