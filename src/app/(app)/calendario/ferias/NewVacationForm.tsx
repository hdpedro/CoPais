"use client";

/**
 * NewVacationForm — formulário PWA pra criar período de férias.
 *
 * Submete via server action `createVacation` (src/actions/vacation.ts).
 *
 * Validações client-side servem só pra UX (mensagens inline). A validação
 * autoritativa fica no service src/lib/services/vacation.ts — server vê
 * o FormData, valida, e redireciona com `?error=...` se algo errado.
 */

import { useState } from "react";
import { createVacation } from "@/actions/vacation";

interface Props {
  groupId: string;
  children: { id: string; full_name: string }[];
  members: { user_id: string; full_name: string }[];
  currentUserId: string;
}

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function daysBetween(start: string, end: string): number {
  if (!start || !end || end < start) return 0;
  const a = new Date(start + "T12:00:00").getTime();
  const b = new Date(end + "T12:00:00").getTime();
  return Math.round((b - a) / 86400000) + 1;
}

export default function NewVacationForm({ groupId, children, members, currentUserId: _currentUserId }: Props) {
  void _currentUserId; // reservado pra defaults futuros (ex: pré-seleção)
  const today = todayIso();
  const [childId, setChildId] = useState<string>(children.length === 1 ? children[0].id : "");
  const [responsibleUserId, setResponsibleUserId] = useState<string>("");
  const [startDate, setStartDate] = useState<string>(today);
  const [endDate, setEndDate] = useState<string>(today);
  const [notes, setNotes] = useState<string>("");

  const days = daysBetween(startDate, endDate);
  const tooLong = days > 90;
  const invalidRange = !!endDate && !!startDate && endDate < startDate;

  const canSubmit =
    !!startDate &&
    !!endDate &&
    !invalidRange &&
    !tooLong &&
    !!responsibleUserId;

  return (
    <form action={createVacation} className="space-y-5 bg-white rounded-xl border border-gray-100 p-5">
      <input type="hidden" name="groupId" value={groupId} />

      {/* Criança */}
      {children.length > 0 ? (
        <div>
          <label className="block text-sm font-semibold text-dark mb-2">
            Para quem (opcional — vazio = família toda)
          </label>
          <div className="flex flex-wrap gap-2">
            <Chip
              selected={childId === ""}
              onClick={() => setChildId("")}
              label="Família"
            />
            {children.map((c) => (
              <Chip
                key={c.id}
                selected={childId === c.id}
                onClick={() => setChildId(childId === c.id ? "" : c.id)}
                label={c.full_name}
              />
            ))}
          </div>
          <input type="hidden" name="childId" value={childId || "none"} />
        </div>
      ) : null}

      {/* Data início */}
      <div>
        <label className="block text-sm font-semibold text-dark mb-2">Início *</label>
        <input
          type="date"
          name="startDate"
          value={startDate}
          onChange={(e) => {
            const v = e.target.value;
            setStartDate(v);
            // Auto-bump end se ficou menor
            if (endDate && endDate < v) setEndDate(v);
          }}
          required
          className="w-full px-4 py-3 bg-white border border-gray-200 rounded-lg text-dark focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
        />
      </div>

      {/* Data fim */}
      <div>
        <label className="block text-sm font-semibold text-dark mb-2">Fim *</label>
        <input
          type="date"
          name="endDate"
          value={endDate}
          min={startDate}
          onChange={(e) => setEndDate(e.target.value)}
          required
          className="w-full px-4 py-3 bg-white border border-gray-200 rounded-lg text-dark focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
        />
      </div>

      {/* Inline preview */}
      {days > 0 && !invalidRange ? (
        <div className={`text-xs ${tooLong ? "text-red-600" : "text-muted"}`}>
          {tooLong
            ? `${days} dias — máximo permitido: 90 dias. Quebre em vários registros.`
            : `${days} ${days === 1 ? "dia" : "dias"} de férias.`}
        </div>
      ) : null}
      {invalidRange ? (
        <div className="text-xs text-red-600">A data final deve ser depois da inicial.</div>
      ) : null}

      {/* Responsável (obrigatório) */}
      {members.length > 0 ? (
        <div>
          <label className="block text-sm font-semibold text-dark mb-2">
            Quem está com a criança *
          </label>
          <div className="flex flex-wrap gap-2">
            {members.map((m) => (
              <Chip
                key={m.user_id}
                selected={responsibleUserId === m.user_id}
                onClick={() => setResponsibleUserId(m.user_id)}
                label={m.full_name.split(" ")[0]}
                accent
              />
            ))}
          </div>
          <input type="hidden" name="responsibleUserId" value={responsibleUserId} />
          {!responsibleUserId ? (
            <p className="text-xs text-muted mt-2">
              Férias sempre têm alguém com a criança. Escolha um responsável acima.
            </p>
          ) : null}
        </div>
      ) : (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-700">
          Nenhum membro encontrado neste grupo. Convide um coparente primeiro.
        </div>
      )}

      {/* Notes */}
      <div>
        <label className="block text-sm font-semibold text-dark mb-2">
          Anotação (opcional)
        </label>
        <textarea
          name="notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Ex: Viagem pra Caraguá, acampamento de inverno..."
          rows={3}
          className="w-full px-4 py-3 bg-white border border-gray-200 rounded-lg text-dark focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent resize-none"
        />
      </div>

      <button
        type="submit"
        disabled={!canSubmit}
        className="w-full py-3 px-4 bg-primary text-white font-semibold rounded-lg hover:bg-primary/90 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
      >
        Salvar férias
      </button>
    </form>
  );
}

function Chip({ selected, onClick, label, accent }: { selected: boolean; onClick: () => void; label: string; accent?: boolean }) {
  const bg = selected
    ? accent
      ? "bg-accent text-white border-accent"
      : "bg-primary text-white border-primary"
    : "bg-white text-dark border-gray-200 hover:border-gray-300";
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-1.5 rounded-full border text-sm font-medium transition-colors ${bg}`}
    >
      {label}
    </button>
  );
}
