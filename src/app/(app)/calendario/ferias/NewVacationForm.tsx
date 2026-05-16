"use client";

/**
 * NewVacationForm — formulário PWA pra criar período de férias.
 *
 * Submete via server action `createVacation` (src/actions/vacation.ts) usando
 * useActionState (React 19). Em caso de erro server-side (overlap, validação),
 * a action retorna `{ error: '...' }` em vez de redirecionar — assim o
 * formulário PRESERVA tudo que a usuária digitou (bug crítico anterior:
 * redirect com ?error= recriava o componente do zero perdendo notes etc).
 */

import { useState, useActionState } from "react";
import { createVacation, type CreateVacationState } from "@/actions/vacation";
import { useI18n } from "@/i18n/provider";

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
  const { t } = useI18n();
  const today = todayIso();
  const [childId, setChildId] = useState<string>(children.length === 1 ? children[0].id : "");
  const [responsibleUserId, setResponsibleUserId] = useState<string>("");
  const [startDate, setStartDate] = useState<string>(today);
  const [endDate, setEndDate] = useState<string>(today);
  const [notes, setNotes] = useState<string>("");

  const [actionState, formAction, isPending] = useActionState<CreateVacationState | undefined, FormData>(
    createVacation,
    undefined,
  );

  const days = daysBetween(startDate, endDate);
  const tooLong = days > 90;
  const invalidRange = !!endDate && !!startDate && endDate < startDate;

  const canSubmit =
    !!startDate &&
    !!endDate &&
    !invalidRange &&
    !tooLong &&
    !!responsibleUserId &&
    !isPending;

  return (
    <form action={formAction} className="space-y-5 bg-white rounded-xl border border-gray-100 p-5">
      <input type="hidden" name="groupId" value={groupId} />

      {actionState?.error ? (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
          {actionState.error}
        </div>
      ) : null}

      {/* Criança */}
      {children.length > 0 ? (
        <div>
          <label className="block text-sm font-semibold text-dark mb-2">
            {t("calendar.vacations.formForLabel")}
          </label>
          <div className="flex flex-wrap gap-2">
            <Chip
              selected={childId === ""}
              onClick={() => setChildId("")}
              label={t("calendar.vacations.familyFallback")}
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

      <div>
        <label className="block text-sm font-semibold text-dark mb-2">{t("calendar.vacations.formStartLabel")}</label>
        <input
          type="date"
          name="startDate"
          value={startDate}
          onChange={(e) => {
            const v = e.target.value;
            setStartDate(v);
            if (endDate && endDate < v) setEndDate(v);
          }}
          required
          aria-label={t("calendar.vacations.formStartLabel")}
          className="w-full px-4 py-3 bg-white border border-gray-200 rounded-lg text-dark focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
        />
      </div>

      <div>
        <label className="block text-sm font-semibold text-dark mb-2">{t("calendar.vacations.formEndLabel")}</label>
        <input
          type="date"
          name="endDate"
          value={endDate}
          min={startDate}
          onChange={(e) => setEndDate(e.target.value)}
          required
          aria-label={t("calendar.vacations.formEndLabel")}
          className="w-full px-4 py-3 bg-white border border-gray-200 rounded-lg text-dark focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
        />
      </div>

      {/* Inline preview */}
      {days > 0 && !invalidRange ? (
        <div className={`text-xs ${tooLong ? "text-red-600" : "text-muted"}`}>
          {tooLong
            ? t("calendar.vacations.formTooLong", { days })
            : t("calendar.vacations.formDaysSummary", {
                days,
                label: days === 1
                  ? t("calendar.vacations.daysSingular")
                  : t("calendar.vacations.daysPlural"),
              })}
        </div>
      ) : null}
      {invalidRange ? (
        <div className="text-xs text-red-600">{t("calendar.vacations.formInvalidRange")}</div>
      ) : null}

      {/* Responsável (obrigatório) */}
      {members.length > 0 ? (
        <div>
          <label className="block text-sm font-semibold text-dark mb-2">
            {t("calendar.vacations.formResponsibleLabel")}
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
              {t("calendar.vacations.formResponsibleHint")}
            </p>
          ) : null}
        </div>
      ) : (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-700">
          {t("calendar.vacations.formNoMembers")}
        </div>
      )}

      <div>
        <label className="block text-sm font-semibold text-dark mb-2">
          {t("calendar.vacations.formNotesLabel")}
        </label>
        <textarea
          name="notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder={t("calendar.vacations.formNotesPlaceholder")}
          aria-label={t("calendar.vacations.formNotesLabel")}
          rows={3}
          className="w-full px-4 py-3 bg-white border border-gray-200 rounded-lg text-dark focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent resize-none"
        />
      </div>

      <button
        type="submit"
        disabled={!canSubmit}
        className="w-full py-3 px-4 bg-primary text-white font-semibold rounded-lg hover:bg-primary/90 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
      >
        {isPending ? t("calendar.vacations.formSaving") : t("calendar.vacations.formSave")}
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
