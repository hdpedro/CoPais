"use client";

import { useState, useTransition } from "react";
import { createActivity } from "@/actions/activities";
import { ACTIVITY_CATEGORIES, DAY_NAMES, DEFAULT_CHECKLIST_ITEMS } from "@/lib/constants";
import { RECURRENCE_OPTIONS } from "@/lib/recurrence-utils";
import { getBrazilToday } from "@/lib/calendar-utils";
import Link from "next/link";

interface Props {
  children: { id: string; full_name: string }[];
}

// Lead time options pro lembrete pré-evento.
// Espelha kindar-native/app/atividades/nova.tsx — paridade PWA↔Native.
// Default 60 ("1h antes"). Sentinels: -1=manhã(8h), -2=véspera(20h), 0=sem.
const LEAD_OPTS: { value: number; label: string }[] = [
  { value: 30,  label: "30 min antes" },
  { value: 60,  label: "1h antes" },
  { value: 120, label: "2h antes" },
  { value: -1,  label: "Manhã do dia (8h)" },
  { value: -2,  label: "Véspera (20h)" },
  { value: 0,   label: "Sem lembrete" },
];
const DEFAULT_LEAD = 60;

export default function NewActivityForm({ children }: Props) {
  const [selectedChildren, setSelectedChildren] = useState<string[]>([]);
  const [category, setCategory] = useState("sport");
  const [recurrence, setRecurrence] = useState("weekly");
  const [selectedDays, setSelectedDays] = useState<number[]>([1]);
  const [customInterval, setCustomInterval] = useState(1);
  const [customUnit, setCustomUnit] = useState("week");
  const [checklistItems, setChecklistItems] = useState<string[]>(
    DEFAULT_CHECKLIST_ITEMS["sport"] || []
  );
  const [newItem, setNewItem] = useState("");
  const [leadMinutes, setLeadMinutes] = useState<number>(DEFAULT_LEAD);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const todayStr = getBrazilToday();
  const showDayOfWeek = recurrence === "weekly" || recurrence === "biweekly";
  const showDayOfMonth = recurrence === "monthly";
  const showCustom = recurrence === "custom";

  function toggleDay(dayIndex: number) {
    setSelectedDays((prev) => {
      const next = prev.includes(dayIndex)
        ? prev.filter((d) => d !== dayIndex)
        : [...prev, dayIndex].sort();
      // Ensure at least one day selected
      return next.length === 0 ? prev : next;
    });
  }

  function handleCategoryChange(newCat: string) {
    setCategory(newCat);
    setChecklistItems(DEFAULT_CHECKLIST_ITEMS[newCat] || []);
  }

  function addItem() {
    const trimmed = newItem.trim();
    if (trimmed && !checklistItems.includes(trimmed)) {
      setChecklistItems([...checklistItems, trimmed]);
      setNewItem("");
    }
  }

  function removeItem(index: number) {
    setChecklistItems(checklistItems.filter((_, i) => i !== index));
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") {
      e.preventDefault();
      addItem();
    }
  }

  function toggleChild(childId: string) {
    setSelectedChildren((prev) =>
      prev.includes(childId)
        ? prev.filter((c) => c !== childId)
        : [...prev, childId]
    );
  }

  const allChildrenSelected = selectedChildren.length === 0 || selectedChildren.length === children.length;

  function handleSubmit(formData: FormData) {
    // If all children selected (or none = "Todos"), set childId empty
    if (allChildrenSelected) {
      formData.delete("childId");
    } else {
      formData.set("childId", selectedChildren[0]);
      if (selectedChildren.length > 1) {
        formData.set("childIds", JSON.stringify(selectedChildren));
      }
    }
    formData.set("checklistItems", JSON.stringify(checklistItems));
    formData.set("category", category);
    formData.set("recurrenceType", recurrence);
    formData.set("reminderLeadMinutes", String(leadMinutes));
    if (showDayOfWeek && selectedDays.length > 0) {
      formData.set("daysOfWeek", JSON.stringify(selectedDays));
    }
    if (showCustom) {
      formData.set("customInterval", String(customInterval));
      formData.set("customUnit", customUnit);
    }

    startTransition(async () => {
      const result = await createActivity(formData);
      if (result?.error) {
        setError(result.error);
      }
    });
  }

  // Summary of recurrence for preview
  function getRecurrenceSummary(): string {
    if (recurrence === "never") return "Evento unico";
    if (recurrence === "daily") return "Todos os dias";
    if (recurrence === "weekly" || recurrence === "biweekly") {
      const days = selectedDays.map((d) => DAY_NAMES[d]).join(", ");
      return recurrence === "biweekly" ? `${days} (quinzenal)` : days;
    }
    if (recurrence === "monthly") return "Mensal";
    if (recurrence === "yearly") return "Anual";
    if (recurrence === "custom") {
      const unit = customUnit === "day" ? "dia(s)" : customUnit === "week" ? "semana(s)" : "mes(es)";
      return `A cada ${customInterval} ${unit}`;
    }
    return "";
  }

  return (
    <form action={handleSubmit} className="space-y-4">
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-600">
          {error}
        </div>
      )}

      {/* === SECTION 1: Basic Info === */}
      <div className="bg-white rounded-2xl border border-gray-100 p-4 space-y-4">
        {/* Child selector — toggle buttons */}
        {children.length === 1 ? (
          <input type="hidden" name="childId" value={children[0].id} />
        ) : (
          <div>
            <label className="block text-sm font-medium text-[#2C2C2C] mb-1.5">
              Para quem?
            </label>
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => setSelectedChildren([])}
                className={`px-3 py-2 rounded-xl text-[13px] font-medium transition-all border ${
                  allChildrenSelected
                    ? "bg-primary text-white border-primary shadow-sm"
                    : "bg-white border-gray-200 text-[#7A8C8B] hover:bg-gray-50"
                }`}
              >
                Todos
              </button>
              {children.map((child) => {
                const isSelected = selectedChildren.includes(child.id) && !allChildrenSelected;
                return (
                  <button
                    key={child.id}
                    type="button"
                    onClick={() => toggleChild(child.id)}
                    className={`px-3 py-2 rounded-xl text-[13px] font-medium transition-all border ${
                      isSelected
                        ? "bg-primary text-white border-primary shadow-sm"
                        : "bg-white border-gray-200 text-[#7A8C8B] hover:bg-gray-50"
                    }`}
                  >
                    {child.full_name.split(" ")[0]}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Activity name */}
        <div>
          <label className="block text-sm font-medium text-[#2C2C2C] mb-1.5">
            Nome da atividade <span className="text-[#D4735A]">*</span>
          </label>
          <input
            name="name"
            required
            placeholder="Ex: Futsal, Natacao, Dentista..."
            className="w-full px-3 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm text-[#2C2C2C]"
          />
        </div>

        {/* Category */}
        <div>
          <label className="block text-sm font-medium text-[#2C2C2C] mb-1.5">Categoria</label>
          <div className="flex flex-wrap gap-1.5">
            {ACTIVITY_CATEGORIES.map((cat) => (
              <button
                key={cat.value}
                type="button"
                onClick={() => handleCategoryChange(cat.value)}
                className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[13px] font-medium transition-all border ${
                  category === cat.value
                    ? "bg-primary/10 border-primary/30 text-primary scale-[1.02]"
                    : "bg-white border-gray-200 text-[#7A8C8B] hover:bg-gray-50"
                }`}
              >
                <span className="text-base">{cat.icon}</span>
                {cat.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* === SECTION 2: Recurrence === */}
      <div className="bg-white rounded-2xl border border-gray-100 p-4 space-y-3">
        <label className="block text-sm font-medium text-[#2C2C2C]">
          Repetir
        </label>

        {/* Compact chip/pill selector */}
        <div className="flex flex-wrap gap-1.5">
          {RECURRENCE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setRecurrence(opt.value)}
              className={`px-3 py-2 rounded-xl text-[13px] font-medium transition-all border ${
                recurrence === opt.value
                  ? "bg-primary/10 border-primary/30 text-primary shadow-sm"
                  : "bg-white border-gray-200 text-[#7A8C8B] hover:bg-gray-50"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {/* Days of week — multi-select toggle (inline below recurrence) */}
        {showDayOfWeek && (
          <div className="pt-2">
            <p className="text-[11px] text-[#7A8C8B] mb-2">
              Selecione os dias da semana:
            </p>
            <div className="flex gap-1">
              {DAY_NAMES.map((day, i) => {
                const isSelected = selectedDays.includes(i);
                return (
                  <button
                    key={i}
                    type="button"
                    onClick={() => toggleDay(i)}
                    className={`flex-1 text-center py-2.5 rounded-xl border text-xs font-medium transition-all ${
                      isSelected
                        ? "bg-primary text-white border-primary shadow-sm"
                        : "border-gray-200 text-[#7A8C8B] hover:bg-gray-50"
                    }`}
                  >
                    {day}
                  </button>
                );
              })}
            </div>
            {selectedDays.length > 1 && (
              <p className="text-[11px] text-primary font-medium mt-2">
                {selectedDays.map((d) => DAY_NAMES[d]).join(", ")}
                {recurrence === "biweekly" && " (quinzenal)"}
              </p>
            )}
          </div>
        )}

        {/* Day of month (for monthly) */}
        {showDayOfMonth && (
          <div className="pt-2">
            <p className="text-[11px] text-[#7A8C8B] mb-2">Dia do mes:</p>
            <select
              name="dayOfMonth"
              className="w-full px-3 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm text-[#2C2C2C] bg-white"
            >
              {Array.from({ length: 31 }, (_, i) => (
                <option key={i + 1} value={i + 1}>Dia {i + 1}</option>
              ))}
            </select>
          </div>
        )}

        {/* Custom recurrence */}
        {showCustom && (
          <div className="bg-gray-50 rounded-xl p-3 space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-sm text-[#2C2C2C]">A cada</span>
              <input
                type="number"
                min={1}
                max={99}
                value={customInterval}
                onChange={(e) => setCustomInterval(Math.max(1, parseInt(e.target.value) || 1))}
                className="w-14 px-2 py-2 border border-gray-200 rounded-lg text-center text-sm text-[#2C2C2C]"
              />
              <select
                value={customUnit}
                onChange={(e) => setCustomUnit(e.target.value)}
                className="px-3 py-2 border border-gray-200 rounded-lg text-sm text-[#2C2C2C] bg-white"
              >
                <option value="day">{customInterval === 1 ? "dia" : "dias"}</option>
                <option value="week">{customInterval === 1 ? "semana" : "semanas"}</option>
                <option value="month">{customInterval === 1 ? "mes" : "meses"}</option>
              </select>
            </div>
          </div>
        )}

        {/* Recurrence summary preview */}
        {recurrence !== "never" && (
          <div className="flex items-center gap-2 bg-primary/5 rounded-lg px-3 py-2">
            <svg className="w-4 h-4 text-primary flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            <span className="text-[12px] text-primary font-medium">{getRecurrenceSummary()}</span>
          </div>
        )}
      </div>

      {/* === SECTION 3: Time & Place === */}
      <div className="bg-white rounded-2xl border border-gray-100 p-4 space-y-3">
        <p className="text-sm font-medium text-[#2C2C2C]">Horario e local</p>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-[11px] text-[#7A8C8B] mb-1">Inicio</label>
            <input
              name="timeStart"
              type="time"
              className="w-full px-3 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm text-[#2C2C2C]"
            />
          </div>
          <div>
            <label className="block text-[11px] text-[#7A8C8B] mb-1">Fim</label>
            <input
              name="timeEnd"
              type="time"
              className="w-full px-3 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm text-[#2C2C2C]"
            />
          </div>
        </div>

        <div>
          <label className="block text-[11px] text-[#7A8C8B] mb-1">Local</label>
          <input
            name="location"
            placeholder="Ex: Quadra do clube, Piscina..."
            className="w-full px-3 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm text-[#2C2C2C]"
          />
        </div>
      </div>

      {/* === SECTION 4: Checklist === */}
      <div className="bg-white rounded-2xl border border-gray-100 p-4 space-y-3">
        <div>
          <p className="text-sm font-medium text-[#2C2C2C]">Checklist da mochila</p>
          <p className="text-[11px] text-[#7A8C8B] mt-0.5">
            Itens para preparar antes da atividade
          </p>
        </div>

        {checklistItems.length > 0 && (
          <div className="space-y-1">
            {checklistItems.map((item, i) => (
              <div
                key={i}
                className="flex items-center gap-2.5 bg-gray-50 rounded-lg px-3 py-2"
              >
                <div className="w-[18px] h-[18px] rounded border-2 border-gray-300 flex-shrink-0" />
                <span className="text-[13px] text-[#2C2C2C] flex-1">{item}</span>
                <button
                  type="button"
                  onClick={() => removeItem(i)}
                  className="p-0.5 hover:bg-red-50 rounded text-gray-400 hover:text-red-500 transition-colors"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="flex gap-2">
          <input
            value={newItem}
            onChange={(e) => setNewItem(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Adicionar item..."
            className="flex-1 px-3 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm text-[#2C2C2C]"
          />
          <button
            type="button"
            onClick={addItem}
            disabled={!newItem.trim()}
            className="px-4 py-2.5 bg-primary text-white font-medium rounded-xl disabled:opacity-40 text-sm transition-opacity"
          >
            +
          </button>
        </div>
      </div>

      {/* === SECTION 5: Reminder lead time === */}
      {/* Server cron (/api/cron/activity-due-reminders, a cada 15min) lê esse */}
      {/* campo e dispara push pro responsible_id na janela ±8min. */}
      <div className="bg-white rounded-2xl border border-gray-100 p-4 space-y-3">
        <div>
          <p className="text-sm font-medium text-[#2C2C2C]">Quando me lembrar?</p>
          <p className="text-[11px] text-[#7A8C8B] mt-0.5">
            Notificamos o responsável antes do evento com a lista de materiais.
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {LEAD_OPTS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setLeadMinutes(opt.value)}
              className={`px-3 py-2 rounded-xl text-[13px] font-medium transition-all border ${
                leadMinutes === opt.value
                  ? "bg-primary/10 border-primary/30 text-primary shadow-sm"
                  : "bg-white border-gray-200 text-[#7A8C8B] hover:bg-gray-50"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* === Advanced (dates & notes) === */}
      <button
        type="button"
        onClick={() => setShowAdvanced(!showAdvanced)}
        className="flex items-center gap-2 text-[12px] text-[#7A8C8B] font-medium px-1 hover:text-[#2C2C2C] transition-colors"
      >
        <svg className={`w-3.5 h-3.5 transition-transform ${showAdvanced ? "rotate-90" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
        Mais opcoes (datas, observacoes)
      </button>

      {showAdvanced && (
        <div className="bg-white rounded-2xl border border-gray-100 p-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] text-[#7A8C8B] mb-1">Data inicio</label>
              <input
                name="startDate"
                type="date"
                defaultValue={todayStr}
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm text-[#2C2C2C]"
              />
            </div>
            {recurrence !== "never" && (
              <div>
                <label className="block text-[11px] text-[#7A8C8B] mb-1">Data fim (opcional)</label>
                <input
                  name="endDate"
                  type="date"
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm text-[#2C2C2C]"
                />
              </div>
            )}
          </div>

          <div>
            <label className="block text-[11px] text-[#7A8C8B] mb-1">Observacoes</label>
            <textarea
              name="notes"
              rows={2}
              placeholder="Informacoes adicionais..."
              className="w-full px-3 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none text-sm text-[#2C2C2C]"
            />
          </div>
        </div>
      )}

      {/* === Submit === */}
      <div className="flex gap-3 pt-1 pb-4">
        <Link
          href="/atividades"
          className="flex-1 px-4 py-3.5 border border-gray-200 text-[#2C2C2C] font-medium rounded-xl text-center hover:bg-gray-50 text-sm transition-colors"
        >
          Cancelar
        </Link>
        <button
          type="submit"
          disabled={isPending}
          className="flex-1 px-4 py-3.5 bg-[#D4735A] text-white font-semibold rounded-xl hover:bg-[#D4623E] transition-all disabled:opacity-50 text-sm shadow-sm"
        >
          {isPending ? (
            <span className="flex items-center justify-center gap-2">
              <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Salvando...
            </span>
          ) : (
            "Salvar Atividade"
          )}
        </button>
      </div>
    </form>
  );
}
