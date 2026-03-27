"use client";

import { useState } from "react";
import { generateSchedule } from "@/actions/calendar";
import { DAY_NAMES, getDisplayName } from "@/lib/constants";
import { getBrazilToday } from "@/lib/calendar-utils";

interface Member {
  user_id: string;
  full_name: string;
  color: string;
}

interface ScheduleBuilderProps {
  groupId: string;
  children: { id: string; full_name: string }[];
  members: Member[];
  currentUserId: string;
  hasExistingSchedule?: boolean;
  initialPattern?: (string | null)[] | null;
  initialStartDate?: string | null;
}

export default function ScheduleBuilder({
  groupId,
  children,
  members,
  currentUserId,
  hasExistingSchedule = false,
  initialPattern,
  initialStartDate,
}: ScheduleBuilderProps) {
  // 14-day pattern: null = unassigned, user_id = assigned
  const [pattern, setPattern] = useState<(string | null)[]>(
    initialPattern && initialPattern.length === 14
      ? initialPattern
      : Array(14).fill(null)
  );
  const [childId, setChildId] = useState(children[0]?.id || "");
  const [startDate, setStartDate] = useState(
    initialStartDate || getBrazilToday()
  );
  const [months, setMonths] = useState(6);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [previewCount, setPreviewCount] = useState(0);

  // Toggle a day between members (cycles: null -> member0 -> member1 -> null)
  function toggleDay(dayIndex: number) {
    setPattern((prev) => {
      const next = [...prev];
      const current = next[dayIndex];
      if (current === null) {
        next[dayIndex] = members[0]?.user_id || null;
      } else if (current === members[0]?.user_id && members.length > 1) {
        next[dayIndex] = members[1].user_id;
      } else {
        next[dayIndex] = null;
      }
      return next;
    });
  }

  // Quick fill: assign all days in a week to a parent
  function fillWeek(weekIndex: number, userId: string) {
    setPattern((prev) => {
      const next = [...prev];
      const start = weekIndex * 7;
      for (let i = start; i < start + 7; i++) {
        next[i] = userId;
      }
      return next;
    });
  }

  // Common pattern presets
  function applyPreset(preset: string) {
    const m0 = members[0]?.user_id;
    const m1 = members[1]?.user_id || m0;

    switch (preset) {
      case "alternating-weeks":
        // Week 1: parent A, Week 2: parent B
        setPattern([
          m0, m0, m0, m0, m0, m0, m0,
          m1, m1, m1, m1, m1, m1, m1,
        ]);
        break;
      case "5-2-2-5":
        // Sequential: 5A, 2B, 2A, 5B (14 days total)
        // Week 1: A Mon-Fri (5), B Sat-Sun (2)
        // Week 2: A Mon-Tue (2), B Wed-Sun (5)
        // Index: [Dom, Seg, Ter, Qua, Qui, Sex, Sab]
        setPattern([
          m1, m0, m0, m0, m0, m0, m1,
          m1, m0, m0, m1, m1, m1, m1,
        ]);
        break;
      case "3-4-4-3":
        // Sequential: 3A, 4B, 4A, 3B (14 days total)
        // Week 1: A Mon-Wed (3), B Thu-Sun (4)
        // Week 2: A Mon-Thu (4), B Fri-Sun (3)
        // Index: [Dom, Seg, Ter, Qua, Qui, Sex, Sab]
        setPattern([
          m1, m0, m0, m0, m1, m1, m1,
          m1, m0, m0, m0, m0, m1, m1,
        ]);
        break;
      case "2-3-weekend":
        // Week 1: Parent A Mon-Wed, Parent B Thu-Fri, Parent A weekend
        // Week 2: Parent B Mon-Wed, Parent A Thu-Fri, Parent B weekend
        // Index: [Dom, Seg, Ter, Qua, Qui, Sex, Sab]
        setPattern([
          m0, m0, m0, m0, m1, m1, m0,
          m1, m1, m1, m1, m0, m0, m1,
        ]);
        break;
    }
  }

  function getMemberInfo(userId: string | null) {
    if (!userId) return null;
    return members.find((m) => m.user_id === userId) || null;
  }

  function getFirstName(fullName: string) {
    return getDisplayName(fullName, true);
  }

  // Count events that would be generated
  function countEvents() {
    const assignedDays = pattern.filter((p) => p !== null).length;
    if (assignedDays === 0) return 0;
    const totalWeeks = months * 4.33;
    const cycles = totalWeeks / 2;
    return Math.round(cycles * assignedDays);
  }

  async function handleSubmit() {
    if (!childId) {
      setError("Selecione a crianca.");
      return;
    }
    if (pattern.every((p) => p === null)) {
      setError("Configure pelo menos 1 dia na escala.");
      return;
    }
    // Validate that start date is a Monday
    const startDay = new Date(startDate + "T12:00:00").getDay();
    if (startDay !== 1) {
      setError("A data de inicio deve ser uma segunda-feira para alinhar com a escala quinzenal.");
      return;
    }

    setSubmitting(true);
    setError("");

    const formData = new FormData();
    formData.set("groupId", groupId);
    formData.set("childId", childId);
    formData.set("pattern", JSON.stringify(pattern));
    formData.set("startDate", startDate);
    formData.set("months", String(months));

    const result = await generateSchedule(formData);
    setSubmitting(false);

    if (result?.error) {
      setError(result.error);
    } else {
      // Force full page reload with cache-busting to bypass all caches
      window.location.href = "/calendario?t=" + Date.now();
    }
  }

  const weekLabels = ["Semana 1", "Semana 2"];

  return (
    <div className="space-y-6">
      {/* Child selector */}
      {children.length > 1 && (
        <div className="bg-white rounded-xl p-4 shadow-sm">
          <label className="block text-sm font-medium text-dark mb-1">Crianca</label>
          <select
            value={childId}
            onChange={(e) => setChildId(e.target.value)}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50"
          >
            {children.map((c) => (
              <option key={c.id} value={c.id}>{c.full_name}</option>
            ))}
          </select>
        </div>
      )}

      {/* Presets */}
      <div className="bg-white rounded-xl p-4 shadow-sm">
        <h3 className="text-sm font-semibold text-dark mb-3">Modelos prontos</h3>
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => applyPreset("alternating-weeks")}
            className="text-left px-3 py-2 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
          >
            <p className="text-xs font-medium text-dark">Semanas alternadas</p>
            <p className="text-xs text-muted">1 semana cada</p>
          </button>
          <button
            onClick={() => applyPreset("5-2-2-5")}
            className="text-left px-3 py-2 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
          >
            <p className="text-xs font-medium text-dark">5-2 / 2-5</p>
            <p className="text-xs text-muted">5 dias + 2 dias alternando</p>
          </button>
          <button
            onClick={() => applyPreset("3-4-4-3")}
            className="text-left px-3 py-2 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
          >
            <p className="text-xs font-medium text-dark">3-4 / 4-3</p>
            <p className="text-xs text-muted">3 dias + 4 dias alternando</p>
          </button>
          <button
            onClick={() => applyPreset("2-3-weekend")}
            className="text-left px-3 py-2 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
          >
            <p className="text-xs font-medium text-dark">2-3 + FDS alternado</p>
            <p className="text-xs text-muted">Seg-Qua / Qui-Sex + FDS alterna</p>
          </button>
        </div>
      </div>

      {/* Pattern builder */}
      <div className="bg-white rounded-xl p-4 shadow-sm">
        <h3 className="text-sm font-semibold text-dark mb-1">Escala quinzenal</h3>
        <p className="text-xs text-muted mb-3">
          Toque em cada dia para alternar entre os responsaveis.
        </p>

        {/* Legend - top, clear identification */}
        <div className="flex flex-wrap items-center gap-3 mb-4 p-3 bg-gray-50 rounded-lg">
          {members.map((m) => (
            <div key={m.user_id} className="flex items-center gap-2">
              <div className="w-4 h-4 rounded" style={{ backgroundColor: m.color }} />
              <span className="text-sm font-medium text-dark">
                {getFirstName(m.full_name)}
                {m.user_id === currentUserId ? " (voce)" : ""}
              </span>
            </div>
          ))}
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded border-2 border-dashed border-gray-300" />
            <span className="text-sm text-muted">Livre</span>
          </div>
        </div>

        {[0, 1].map((weekIdx) => (
          <div key={weekIdx} className="mb-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-dark">{weekLabels[weekIdx]}</span>
              <div className="flex gap-1">
                {members.map((m) => (
                  <button
                    key={m.user_id}
                    onClick={() => fillWeek(weekIdx, m.user_id)}
                    className="text-xs px-2 py-0.5 rounded-full border border-gray-200 hover:bg-gray-50"
                    title={`Preencher semana toda com ${getDisplayName(m.full_name)}`}
                  >
                    {getDisplayName(m.full_name, true)}
                  </button>
                ))}
              </div>
            </div>
            {/* Days grid: 5 weekdays + gap + 2 weekend */}
            <div className="flex gap-1">
              {/* Weekdays */}
              <div className="flex-1 grid grid-cols-5 gap-1">
                {[1, 2, 3, 4, 5].map((i) => (
                  <div key={`h-${weekIdx}-${i}`} className="text-center text-xs text-muted">
                    {DAY_NAMES[i]}
                  </div>
                ))}
                {[1, 2, 3, 4, 5].map((dayIdx) => {
                  const idx = weekIdx * 7 + dayIdx;
                  const member = getMemberInfo(pattern[idx]);

                  return (
                    <button
                      key={idx}
                      onClick={() => toggleDay(idx)}
                      className={`
                        py-2 rounded-lg flex items-center justify-center
                        text-[10px] font-semibold transition-all border-2 min-h-[44px]
                        ${member ? "border-transparent text-white shadow-sm" : "border-dashed border-gray-300 text-muted hover:border-gray-400 bg-white"}
                      `}
                      style={member ? { backgroundColor: member.color } : {}}
                      title={member ? member.full_name : "Nao atribuido"}
                    >
                      {member ? getFirstName(member.full_name) : "?"}
                    </button>
                  );
                })}
              </div>

              {/* Separator */}
              <div className="w-px bg-gray-200 mx-1 self-stretch" />

              {/* Weekend */}
              <div className="grid grid-cols-2 gap-1" style={{ width: "28%" }}>
                {[6, 0].map((i) => (
                  <div key={`h-${weekIdx}-${i}`} className="text-center text-xs font-medium text-amber-600">
                    {DAY_NAMES[i]}
                  </div>
                ))}
                {[6, 0].map((dayIdx) => {
                  const idx = weekIdx * 7 + dayIdx;
                  const member = getMemberInfo(pattern[idx]);

                  return (
                    <button
                      key={idx}
                      onClick={() => toggleDay(idx)}
                      className={`
                        py-2 rounded-lg flex items-center justify-center
                        text-[10px] font-semibold transition-all border-2 min-h-[44px]
                        ${member ? "border-transparent text-white shadow-sm" : "border-dashed border-amber-300 text-amber-400 hover:border-amber-400 bg-amber-50"}
                      `}
                      style={member ? { backgroundColor: member.color } : {}}
                      title={member ? member.full_name : "Nao atribuido"}
                    >
                      {member ? getFirstName(member.full_name) : "?"}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        ))}

        {/* Tip */}
        <p className="text-xs text-center text-muted pt-2 border-t border-gray-100">
          O padrao acima se repete automaticamente a cada 2 semanas
        </p>
      </div>

      {/* Configuration */}
      <div className="bg-white rounded-xl p-4 shadow-sm space-y-4">
        <div>
          <label className="block text-sm font-medium text-dark mb-1">
            Inicio da escala
          </label>
          <input
            type="date"
            value={startDate}
            onChange={(e) => {
              setStartDate(e.target.value);
              setError("");
            }}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
          {startDate && new Date(startDate + "T12:00:00").getDay() !== 1 ? (
            <p className="text-xs text-amber-600 font-medium mt-1">
              A data selecionada nao e uma segunda-feira. A escala deve comecar na segunda.
            </p>
          ) : (
            <p className="text-xs text-muted mt-1">
              Escolha uma segunda-feira para alinhar com a semana.
            </p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-dark mb-1">
            Gerar para quantos meses?
          </label>
          <div className="flex gap-2">
            {[3, 6, 12].map((m) => (
              <button
                key={m}
                onClick={() => setMonths(m)}
                className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  months === m
                    ? "bg-primary text-white"
                    : "bg-gray-100 text-dark hover:bg-gray-200"
                }`}
              >
                {m} meses
              </button>
            ))}
          </div>
        </div>

        <div className="bg-gray-50 rounded-lg p-3 text-center">
          <p className="text-sm text-muted">
            Sera(o) gerado(s) aproximadamente <strong className="text-dark">{countEvents()} eventos</strong> nos proximos {months} meses
          </p>
        </div>
      </div>

      {error && (
        <p className="text-sm text-error bg-error/10 px-4 py-3 rounded-xl">{error}</p>
      )}

      <button
        onClick={handleSubmit}
        disabled={submitting || pattern.every((p) => p === null)}
        className="w-full py-4 bg-primary text-white font-semibold rounded-xl hover:bg-primary-dark transition-colors disabled:opacity-50 text-lg"
      >
        {submitting
          ? "Gerando escala..."
          : hasExistingSchedule
            ? "Atualizar Escala de Guarda"
            : "Gerar Escala de Guarda"}
      </button>
    </div>
  );
}
