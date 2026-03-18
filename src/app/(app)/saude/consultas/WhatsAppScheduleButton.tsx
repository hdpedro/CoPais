"use client";

import { useState } from "react";

interface Professional {
  id: string;
  name: string;
  whatsapp: string | null;
  specialty: string | null;
}

interface Child {
  id: string;
  full_name: string;
}

export default function WhatsAppScheduleButton({
  professionals,
  children,
}: {
  professionals: Professional[];
  children: Child[];
}) {
  const [selectedProfessionalId, setSelectedProfessionalId] = useState("");
  const [selectedChildId, setSelectedChildId] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [reason, setReason] = useState("");

  const selectedProfessional = professionals.find(
    (p) => p.id === selectedProfessionalId
  );

  const selectedChild = children.find((c) => c.id === selectedChildId);

  const canSend =
    selectedProfessional?.whatsapp &&
    selectedChild &&
    date &&
    time &&
    reason;

  function handleWhatsApp() {
    if (!selectedProfessional?.whatsapp || !selectedChild) return;

    const phone = selectedProfessional.whatsapp.replace(/\D/g, "");
    const fullPhone = phone.length <= 11 ? "55" + phone : phone;

    const formattedDate = new Date(date + "T12:00:00").toLocaleDateString(
      "pt-BR"
    );

    const text = `Ola ${selectedProfessional.name}! \u{1F44B}\n\nGostaria de agendar uma consulta para meu/minha filho(a) *${selectedChild.full_name}*.\n\n\u{1F4C5} Data: ${formattedDate}\n\u{23F0} Horario: ${time}\n\u{1F4CB} Motivo: ${reason}\n\nAguardo confirmacao. Obrigado(a)!`;

    window.open(
      `https://wa.me/${fullPhone}?text=${encodeURIComponent(text)}`,
      "_blank"
    );
  }

  return (
    <div className="bg-white rounded-xl p-6 shadow-sm space-y-4">
      <h3 className="font-semibold text-dark flex items-center gap-2">
        <svg
          className="w-5 h-5 text-[#25D366]"
          viewBox="0 0 24 24"
          fill="currentColor"
        >
          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z" />
          <path d="M12 0C5.373 0 0 5.373 0 12c0 2.625.846 5.059 2.284 7.034L.789 23.492a.5.5 0 00.611.611l4.458-1.495A11.952 11.952 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22c-2.37 0-4.567-.7-6.412-1.9l-.447-.29-2.642.886.886-2.642-.29-.447A9.953 9.953 0 012 12C2 6.486 6.486 2 12 2s10 4.486 10 10-4.486 10-10 10z" />
        </svg>
        Agendar via WhatsApp
      </h3>

      <p className="text-sm text-muted">
        Preencha os campos abaixo para enviar uma mensagem de agendamento
        diretamente pelo WhatsApp.
      </p>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-muted mb-1">
            Profissional
          </label>
          <select
            value={selectedProfessionalId}
            onChange={(e) => setSelectedProfessionalId(e.target.value)}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#25D366]/50"
          >
            <option value="">Selecione...</option>
            {professionals
              .filter((p) => p.whatsapp)
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-muted mb-1">
            Crianca
          </label>
          <select
            value={selectedChildId}
            onChange={(e) => setSelectedChildId(e.target.value)}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#25D366]/50"
          >
            <option value="">Selecione...</option>
            {children.map((c) => (
              <option key={c.id} value={c.id}>
                {c.full_name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-muted mb-1">
            Data
          </label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#25D366]/50"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-muted mb-1">
            Horario
          </label>
          <input
            type="time"
            value={time}
            onChange={(e) => setTime(e.target.value)}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#25D366]/50"
          />
        </div>
      </div>

      <div>
        <label className="block text-xs font-medium text-muted mb-1">
          Motivo
        </label>
        <input
          type="text"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Ex: Consulta de rotina, Retorno"
          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#25D366]/50"
        />
      </div>

      <button
        type="button"
        onClick={handleWhatsApp}
        disabled={!canSend}
        className="w-full py-3 bg-[#25D366] text-white font-semibold rounded-xl hover:bg-[#20bd5a] transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
      >
        <span>📱</span>
        Agendar via WhatsApp
        {selectedProfessional?.name && (
          <span className="font-normal">
            - {selectedProfessional.name}
          </span>
        )}
      </button>

      {selectedProfessionalId && !selectedProfessional?.whatsapp && (
        <p className="text-xs text-center text-muted">
          Este profissional nao possui WhatsApp cadastrado.
        </p>
      )}
    </div>
  );
}
