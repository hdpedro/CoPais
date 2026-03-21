"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { APPOINTMENT_TYPES } from "@/lib/health-constants";

interface AppointmentFormClientProps {
  groupId: string;
  children: { id: string; full_name: string }[];
  professionals: { id: string; name: string; specialty: string | null; whatsapp: string | null }[];
  today: string;
  createAction: (formData: FormData) => Promise<void>;
}

export default function AppointmentFormClient({
  groupId,
  children,
  professionals,
  today,
  createAction,
}: AppointmentFormClientProps) {
  const [appointmentType, setAppointmentType] = useState("rotina");
  const [showReturn, setShowReturn] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(formData: FormData) {
    formData.set("appointmentType", appointmentType);
    if (!showReturn) {
      formData.delete("returnDate");
      formData.delete("returnNotes");
    }
    startTransition(() => {
      createAction(formData);
    });
  }

  return (
    <form action={handleSubmit} className="space-y-4">
      <input type="hidden" name="groupId" value={groupId} />

      {/* Step 1: Tipo da consulta */}
      <div className="bg-white rounded-xl p-4 shadow-sm">
        <div className="flex items-center gap-2 mb-3">
          <span className="flex items-center justify-center w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-bold">1</span>
          <span className="text-sm font-semibold text-dark">Tipo de consulta</span>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {APPOINTMENT_TYPES.map((type) => (
            <button
              key={type.value}
              type="button"
              onClick={() => setAppointmentType(type.value)}
              className={`flex flex-col items-start p-3 rounded-xl border-2 transition-all text-left ${
                appointmentType === type.value
                  ? type.color + " border-current"
                  : "border-gray-200 bg-white hover:border-gray-300"
              }`}
            >
              <span className="text-lg mb-1">{type.icon}</span>
              <span className="text-sm font-semibold">{type.label}</span>
              <span className="text-[11px] text-muted leading-tight">{type.desc}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Step 2: Crianca + Profissional */}
      <div className="bg-white rounded-xl p-4 shadow-sm space-y-3">
        <div className="flex items-center gap-2 mb-1">
          <span className="flex items-center justify-center w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-bold">2</span>
          <span className="text-sm font-semibold text-dark">Detalhes</span>
        </div>

        <div>
          <label className="block text-xs font-medium text-muted mb-1">Crianca *</label>
          <select
            name="childId"
            required
            className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-dark focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
          >
            {children.length === 1 ? (
              <option value={children[0].id}>{children[0].full_name}</option>
            ) : (
              <>
                <option value="">Selecione...</option>
                {children.map((child) => (
                  <option key={child.id} value={child.id}>{child.full_name}</option>
                ))}
              </>
            )}
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium text-muted mb-1">Profissional</label>
          <select
            name="professionalId"
            className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-dark focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
          >
            <option value="">Selecione (opcional)...</option>
            {professionals.map((prof) => (
              <option key={prof.id} value={prof.id}>
                {prof.name}{prof.specialty ? ` — ${prof.specialty}` : ""}
              </option>
            ))}
          </select>
          <Link href="/saude/profissionais/novo" className="text-[11px] text-primary hover:underline mt-1 inline-block">
            + Cadastrar novo profissional
          </Link>
        </div>

        <div>
          <label className="block text-xs font-medium text-muted mb-1">
            {appointmentType === "emergencia" ? "Motivo da emergencia *" : "Titulo / Motivo *"}
          </label>
          <input
            type="text"
            name="title"
            required
            placeholder={
              appointmentType === "rotina" ? "Ex: Consulta de rotina, Revisao semestral" :
              appointmentType === "emergencia" ? "Ex: Febre alta, Queda, Vomitos" :
              appointmentType === "retorno" ? "Ex: Retorno pediatra, Resultado exames" :
              "Ex: Hemograma, Raio-X, Ultrassom"
            }
            className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-dark placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
          />
        </div>
      </div>

      {/* Step 3: Data e Horario */}
      <div className="bg-white rounded-xl p-4 shadow-sm space-y-3">
        <div className="flex items-center gap-2 mb-1">
          <span className="flex items-center justify-center w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-bold">3</span>
          <span className="text-sm font-semibold text-dark">
            {appointmentType === "emergencia" ? "Quando foi?" : "Data e horario"}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-muted mb-1">Data *</label>
            <input
              type="date"
              name="appointmentDate"
              required
              defaultValue={today}
              className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-dark focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted mb-1">Horario *</label>
            <input
              type="time"
              name="appointmentTime"
              required
              className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-dark focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-muted mb-1">Local</label>
          <input
            type="text"
            name="location"
            placeholder={appointmentType === "emergencia" ? "Ex: Pronto-socorro, Hospital..." : "Clinica, hospital, endereco..."}
            className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-dark placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
          />
        </div>
      </div>

      {/* Step 4: Retorno */}
      <div className="bg-white rounded-xl p-4 shadow-sm">
        <div className="flex items-center gap-2 mb-3">
          <span className="flex items-center justify-center w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-bold">4</span>
          <span className="text-sm font-semibold text-dark">Retorno</span>
          <span className="text-xs text-muted">(opcional)</span>
        </div>

        <button
          type="button"
          onClick={() => setShowReturn(!showReturn)}
          className={`w-full flex items-center gap-3 p-3 rounded-lg border-2 transition-all ${
            showReturn
              ? "border-primary bg-primary/5"
              : "border-gray-200 bg-white hover:border-gray-300"
          }`}
        >
          <span className="text-xl">{showReturn ? "🔄" : "📅"}</span>
          <div className="flex-1 text-left">
            <p className="text-sm font-semibold text-dark">
              {showReturn ? "Retorno previsto" : "Agendar previsao de retorno?"}
            </p>
            <p className="text-xs text-muted">
              {showReturn
                ? "Voce sera lembrado quando a data se aproximar"
                : "Defina quando a crianca deve voltar"}
            </p>
          </div>
          <div className={`w-11 h-6 rounded-full transition-colors relative ${showReturn ? "bg-primary" : "bg-gray-300"}`}>
            <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${showReturn ? "translate-x-5" : "translate-x-0.5"}`} />
          </div>
        </button>

        {showReturn && (
          <div className="mt-3 space-y-3 animate-[fadeIn_200ms_ease-out]">
            <div>
              <label className="block text-xs font-medium text-muted mb-1">Data prevista de retorno</label>
              <input
                type="date"
                name="returnDate"
                className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-dark focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted mb-1">Observacao sobre o retorno</label>
              <input
                type="text"
                name="returnNotes"
                placeholder="Ex: Levar resultado de exames, Reavaliar tratamento"
                className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-dark placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
              />
            </div>
          </div>
        )}
      </div>

      {/* Step 5: Observacoes */}
      <div className="bg-white rounded-xl p-4 shadow-sm">
        <div className="flex items-center gap-2 mb-3">
          <span className="flex items-center justify-center w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-bold">5</span>
          <span className="text-sm font-semibold text-dark">Observacoes</span>
          <span className="text-xs text-muted">(opcional)</span>
        </div>
        <textarea
          name="notes"
          rows={3}
          placeholder="Levar exames, chegar 15min antes, jejum..."
          className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-dark placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary resize-none"
        />
      </div>

      {/* Submit */}
      <button
        type="submit"
        disabled={isPending}
        className={`w-full font-semibold py-3.5 rounded-xl transition-colors shadow-sm disabled:opacity-50 text-base ${
          appointmentType === "emergencia"
            ? "bg-red-600 text-white hover:bg-red-700"
            : "bg-primary text-white hover:bg-primary/90"
        }`}
      >
        {isPending ? "Salvando..." : appointmentType === "emergencia" ? "Registrar Emergencia" : "Agendar Consulta"}
      </button>
    </form>
  );
}
