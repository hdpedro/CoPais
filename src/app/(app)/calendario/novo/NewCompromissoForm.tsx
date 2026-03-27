"use client";

import { useState, useTransition } from "react";
import { createActivity } from "@/actions/activities";
import { createEvent } from "@/actions/events";
import { createCustodyEvent } from "@/actions/calendar";
import { DEFAULT_CHECKLIST_ITEMS } from "@/lib/constants";
import { getBrazilToday } from "@/lib/calendar-utils";
import { getDisplayName } from "@/lib/constants";
import { useI18n } from "@/i18n/provider";
import Link from "next/link";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface Props {
  children: { id: string; full_name: string }[];
  members: { user_id: string; full_name: string }[];
  groupId: string;
}

type CategoryValue =
  | "sport"
  | "health"
  | "school"
  | "art"
  | "music"
  | "therapy"
  | "course"
  | "other"
  | "evento"
  | "viagem"
  | "guarda";

interface CategoryDef {
  value: CategoryValue;
  label: string;
  icon: string;
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const DAY_NAMES = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sab"] as const;

const CUSTODY_TYPES = [
  { value: "regular", label: "Regular" },
  { value: "holiday", label: "Feriado" },
  { value: "swap", label: "Troca" },
  { value: "vacation", label: "Ferias" },
  { value: "special", label: "Especial" },
] as const;

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function formTypeFor(cat: CategoryValue): "activity" | "event" | "custody" {
  if (cat === "evento" || cat === "viagem" || cat === "other") return "event";
  if (cat === "guarda") return "custody";
  return "activity";
}

const ACTIVITY_CATEGORY_VALUES = new Set<string>([
  "sport", "health", "school", "art", "music", "therapy", "course", "other",
]);

const STRUCTURED_ACTIVITIES = new Set([
  "sport", "school", "course", "therapy", "art", "music",
]);

/* ------------------------------------------------------------------ */
/*  Collapsible Section                                                */
/* ------------------------------------------------------------------ */

function CollapsibleSection({
  icon,
  title,
  defaultOpen = false,
  children: content,
}: {
  icon: string;
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50/50 transition-colors"
      >
        <span className="flex items-center gap-2">
          <span className="text-base">{icon}</span>
          <span className="text-xs font-bold text-[#7A8C8B] uppercase tracking-wider">{title}</span>
        </span>
        <svg
          className={`w-4 h-4 text-[#7A8C8B] transition-transform duration-200 ${open ? "rotate-180" : ""}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && <div className="px-4 pb-4 space-y-3">{content}</div>}
    </div>
  );
}

/* ================================================================== */
/*  Main Component                                                     */
/* ================================================================== */

export default function NewCompromissoForm({ children, members, groupId }: Props) {
  const { t } = useI18n();

  /* --- shared state ------------------------------------------------ */
  const [selectedCategory, setSelectedCategory] = useState<CategoryValue | null>(null);
  const [isPending, startTransition] = useTransition();
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const todayStr = getBrazilToday();

  /* --- activity state ---------------------------------------------- */
  const [selectedChildren, setSelectedChildren] = useState<string[]>([]);
  const [responsibleId, setResponsibleId] = useState<string>(members[0]?.user_id || "");
  const [showOtherResponsible, setShowOtherResponsible] = useState(false);
  const [recurrence, setRecurrence] = useState("weekly");
  const [showCustomRecurrence, setShowCustomRecurrence] = useState(false);
  const [selectedDays, setSelectedDays] = useState<number[]>([1]);
  const [customInterval, setCustomInterval] = useState(1);
  const [customUnit, setCustomUnit] = useState("week");
  const [checklistItems, setChecklistItems] = useState<string[]>([]);
  const [newItem, setNewItem] = useState("");

  /* --- event state ------------------------------------------------- */
  const [allDay, setAllDay] = useState(false);
  const [multiDay, setMultiDay] = useState(false);
  const [eventResponsibleId, setEventResponsibleId] = useState<string>(members[0]?.user_id || "");
  const [showEventOtherResponsible, setShowEventOtherResponsible] = useState(false);

  /* --- custody state ----------------------------------------------- */
  const [hasTime, setHasTime] = useState(false);
  const [isRecurring, setIsRecurring] = useState(false);
  const [custodyChildId, setCustodyChildId] = useState("");
  const [custodyResponsibleId, setCustodyResponsibleId] = useState("");

  /* derived */
  const formType = selectedCategory ? formTypeFor(selectedCategory) : null;
  const showDayOfWeek = recurrence === "weekly" || recurrence === "biweekly";
  const showDayOfMonth = recurrence === "monthly";
  const showCustom = recurrence === "custom";
  const allChildrenSelected =
    selectedChildren.length === 0 || selectedChildren.length === children.length;

  /* categories with i18n labels */
  const ALL_CATEGORIES: CategoryDef[] = [
    { value: "sport", label: t("newForm.catSport"), icon: "\u26BD" },
    { value: "health", label: t("newForm.catHealth"), icon: "\uD83C\uDFE5" },
    { value: "school", label: t("newForm.catSchool"), icon: "\uD83C\uDF92" },
    { value: "art", label: t("newForm.catArt"), icon: "\uD83C\uDFA8" },
    { value: "music", label: t("newForm.catMusic"), icon: "\uD83C\uDFB5" },
    { value: "therapy", label: t("newForm.catTherapy"), icon: "\uD83E\uDDE0" },
    { value: "course", label: t("newForm.catCourse"), icon: "\uD83D\uDCDA" },
    { value: "evento", label: t("newForm.catEvent"), icon: "\uD83C\uDF89" },
    { value: "viagem", label: t("newForm.catTravel"), icon: "\u2708\uFE0F" },
    { value: "guarda", label: t("newForm.catCustody"), icon: "\uD83D\uDD04" },
    { value: "other", label: t("newForm.catOther"), icon: "\uD83D\uDCCB" },
  ];

  /* ---------------------------------------------------------------- */
  /*  Handlers                                                         */
  /* ---------------------------------------------------------------- */

  function handleCategorySelect(cat: CategoryValue) {
    setSelectedCategory(cat);
    setError(null);
    if (ACTIVITY_CATEGORY_VALUES.has(cat)) {
      setChecklistItems(DEFAULT_CHECKLIST_ITEMS[cat] || []);
    }
    if (cat === "viagem") {
      setAllDay(true);
      setMultiDay(true);
    } else {
      setMultiDay(false);
    }
  }

  function toggleDay(dayIndex: number) {
    setSelectedDays((prev) => {
      const next = prev.includes(dayIndex)
        ? prev.filter((d) => d !== dayIndex)
        : [...prev, dayIndex].sort();
      return next.length === 0 ? prev : next;
    });
  }

  function toggleChild(childId: string) {
    setSelectedChildren((prev) =>
      prev.includes(childId) ? prev.filter((c) => c !== childId) : [...prev, childId]
    );
  }

  function addChecklistItem() {
    const trimmed = newItem.trim();
    if (trimmed && !checklistItems.includes(trimmed)) {
      setChecklistItems([...checklistItems, trimmed]);
      setNewItem("");
    }
  }

  function removeChecklistItem(index: number) {
    setChecklistItems(checklistItems.filter((_, i) => i !== index));
  }

  function handleChecklistKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") {
      e.preventDefault();
      addChecklistItem();
    }
  }

  function getRecurrenceSummary(): string {
    if (recurrence === "never") return t("newForm.recOnce");
    if (recurrence === "daily") return t("newForm.recDaily");
    if (recurrence === "weekly" || recurrence === "biweekly") {
      const days = selectedDays.map((d) => DAY_NAMES[d]).join(", ");
      return recurrence === "biweekly" ? `${days} (${t("newForm.recBiweeklyShort")})` : days;
    }
    if (recurrence === "monthly") return t("newForm.recMonthly");
    if (recurrence === "yearly") return t("newForm.recYearly");
    if (recurrence === "custom") {
      const unit =
        customUnit === "day" ? t("newForm.unitDays") :
        customUnit === "week" ? t("newForm.unitWeeks") : t("newForm.unitMonths");
      return `${t("newForm.every")} ${customInterval} ${unit}`;
    }
    return "";
  }

  /* ---------------------------------------------------------------- */
  /*  Submit                                                           */
  /* ---------------------------------------------------------------- */

  const isDisabled = isPending || submitted;

  function handleSubmit(formData: FormData) {
    if (!selectedCategory || isDisabled) return;

    const startDateVal = formData.get("eventDate") as string | null;
    const endDateVal = formData.get("endDate") as string | null;
    if (startDateVal && endDateVal && startDateVal > endDateVal) {
      setError(t("newForm.dateError"));
      return;
    }

    setSubmitted(true);
    startTransition(async () => {
      try {
        if (formType === "activity") {
          if (allChildrenSelected) {
            formData.delete("childId");
          } else {
            formData.set("childId", selectedChildren[0]);
            if (selectedChildren.length > 1) {
              formData.set("childIds", JSON.stringify(selectedChildren));
            }
          }
          formData.set("checklistItems", JSON.stringify(checklistItems));
          formData.set("category", selectedCategory);
          formData.set("recurrenceType", recurrence);
          if (showDayOfWeek && selectedDays.length > 0) {
            formData.set("daysOfWeek", JSON.stringify(selectedDays));
          }
          if (showCustom) {
            formData.set("customInterval", String(customInterval));
            formData.set("customUnit", customUnit);
          }
          // Set responsible
          if (!showOtherResponsible) {
            formData.set("responsibleId", responsibleId);
          }
          const result = await createActivity(formData);
          if (result?.error) {
            setError(result.error);
            setSubmitted(false);
          }
        } else if (formType === "event") {
          formData.set("groupId", groupId);
          // Set responsible
          if (!showEventOtherResponsible) {
            formData.set("assignedTo", eventResponsibleId);
          }
          await createEvent(formData);
        } else if (formType === "custody") {
          formData.set("groupId", groupId);
          formData.set("isRecurring", String(isRecurring));
          formData.set("childId", custodyChildId);
          formData.set("responsibleUserId", custodyResponsibleId);
          await createCustodyEvent(formData);
        }
      } catch {
        setSubmitted(false);
      }
    });
  }

  /* ---------------------------------------------------------------- */
  /*  Style constants                                                  */
  /* ---------------------------------------------------------------- */

  const inputClass =
    "w-full px-3.5 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#D4735A]/30 focus:border-[#D4735A]/50 text-sm text-[#2C2C2C] bg-white transition-all";

  const sectionCard = "bg-white rounded-2xl border border-gray-100 p-4 space-y-3 shadow-sm";

  const sectionLabel = "text-xs font-bold text-[#7A8C8B] uppercase tracking-wider flex items-center gap-2";

  /* ---------------------------------------------------------------- */
  /*  Shared sub-components                                            */
  /* ---------------------------------------------------------------- */

  function ResponsibleSelector({
    selectedId,
    onSelect,
    showOther,
    onToggleOther,
    nameFieldName = "activityAssignedName",
  }: {
    selectedId: string;
    onSelect: (id: string) => void;
    showOther: boolean;
    onToggleOther: (v: boolean) => void;
    nameFieldName?: string;
  }) {
    return (
      <div className="space-y-2">
        <div className="flex flex-wrap gap-2">
          {members.map((m) => {
            const isSelected = selectedId === m.user_id && !showOther;
            const displayName = getDisplayName(m.full_name, true);
            const initial = displayName.charAt(0).toUpperCase();
            return (
              <button
                key={m.user_id}
                type="button"
                onClick={() => { onSelect(m.user_id); onToggleOther(false); }}
                className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border-2 transition-all min-h-[44px] ${
                  isSelected
                    ? "border-[#D4735A] bg-[#D4735A]/5 shadow-sm"
                    : "border-gray-100 bg-white hover:border-gray-200"
                }`}
              >
                <span className="w-7 h-7 rounded-full bg-[#D4735A]/15 text-[#D4735A] flex items-center justify-center text-xs font-bold flex-shrink-0">
                  {initial}
                </span>
                <span className={`text-sm font-medium ${isSelected ? "text-[#D4735A]" : "text-[#2C2C2C]"}`}>
                  {displayName}
                </span>
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => onToggleOther(!showOther)}
            className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border-2 transition-all min-h-[44px] ${
              showOther
                ? "border-[#D4735A] bg-[#D4735A]/5 shadow-sm"
                : "border-gray-100 bg-white hover:border-gray-200"
            }`}
          >
            <span className="w-7 h-7 rounded-full bg-gray-100 text-[#7A8C8B] flex items-center justify-center text-xs flex-shrink-0">+</span>
            <span className={`text-sm font-medium ${showOther ? "text-[#D4735A]" : "text-[#7A8C8B]"}`}>
              {t("newForm.otherPerson")}
            </span>
          </button>
        </div>
        {showOther && (
          <input
            name={nameFieldName}
            placeholder={t("newForm.otherPersonPlaceholder")}
            className={inputClass}
            autoFocus
          />
        )}
        <p className="text-[10px] text-[#7A8C8B]">{t("newForm.responsibleHint")}</p>
      </div>
    );
  }

  function ChildSelector({ mode = "toggle" }: { mode?: "toggle" | "dropdown-required" | "dropdown-optional" }) {
    if (children.length === 1 && mode === "toggle") {
      return <input type="hidden" name="childId" value={children[0].id} />;
    }

    if (mode === "dropdown-required" || mode === "dropdown-optional") {
      return (
        <select
          name={mode === "dropdown-required" ? undefined : "childId"}
          value={mode === "dropdown-required" ? custodyChildId : undefined}
          onChange={mode === "dropdown-required" ? (e) => setCustodyChildId(e.target.value) : undefined}
          required={mode === "dropdown-required"}
          className={`${inputClass} bg-white`}
        >
          <option value="">{mode === "dropdown-required" ? t("newForm.selectChild") : t("newForm.allOrNone")}</option>
          {children.map((child) => (
            <option key={child.id} value={child.id}>{child.full_name}</option>
          ))}
        </select>
      );
    }

    return (
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setSelectedChildren([])}
          className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border-2 transition-all min-h-[44px] ${
            allChildrenSelected
              ? "border-[#D4735A] bg-[#D4735A]/5 shadow-sm"
              : "border-gray-100 bg-white hover:border-gray-200"
          }`}
        >
          <span className="w-6 h-6 rounded-full bg-gray-200 flex items-center justify-center text-[10px]">
            {"\uD83D\uDC68\u200D\uD83D\uDC69\u200D\uD83D\uDC67\u200D\uD83D\uDC66"}
          </span>
          <span className={`text-sm font-medium ${allChildrenSelected ? "text-[#D4735A]" : "text-[#2C2C2C]"}`}>
            {t("common.all")}
          </span>
        </button>
        {children.map((child) => {
          const isSelected = selectedChildren.includes(child.id) && !allChildrenSelected;
          const initial = child.full_name.charAt(0).toUpperCase();
          return (
            <button
              key={child.id}
              type="button"
              onClick={() => toggleChild(child.id)}
              className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border-2 transition-all min-h-[44px] ${
                isSelected
                  ? "border-[#5B9E85] bg-[#5B9E85]/5 shadow-sm"
                  : "border-gray-100 bg-white hover:border-gray-200"
              }`}
            >
              <span className="w-6 h-6 rounded-full bg-[#5B9E85]/15 text-[#5B9E85] flex items-center justify-center text-[10px] font-bold">
                {initial}
              </span>
              <span className={`text-sm font-medium ${isSelected ? "text-[#5B9E85]" : "text-[#2C2C2C]"}`}>
                {child.full_name.split(" ")[0]}
              </span>
            </button>
          );
        })}
      </div>
    );
  }

  /* ---------------------------------------------------------------- */
  /*  Recurrence section (simplified)                                  */
  /* ---------------------------------------------------------------- */

  function RecurrenceSection() {
    const simpleOptions = [
      { value: "never", label: t("newForm.recOnce") },
      { value: "weekly", label: t("newForm.recWeekly") },
    ];

    return (
      <div className="space-y-3">
        {/* Simple options */}
        <div className="flex flex-wrap gap-2">
          {simpleOptions.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => { setRecurrence(opt.value); setShowCustomRecurrence(false); }}
              className={`px-4 py-2.5 rounded-xl text-sm font-medium transition-all border-2 min-h-[44px] ${
                recurrence === opt.value && !showCustomRecurrence
                  ? "border-[#D4735A] bg-[#D4735A]/5 text-[#D4735A] shadow-sm"
                  : "border-gray-100 bg-white text-[#7A8C8B] hover:border-gray-200"
              }`}
            >
              {opt.label}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setShowCustomRecurrence(!showCustomRecurrence)}
            className={`px-4 py-2.5 rounded-xl text-sm font-medium transition-all border-2 min-h-[44px] ${
              showCustomRecurrence || !["never", "weekly"].includes(recurrence)
                ? "border-[#D4735A] bg-[#D4735A]/5 text-[#D4735A] shadow-sm"
                : "border-gray-100 bg-white text-[#7A8C8B] hover:border-gray-200"
            }`}
          >
            {t("newForm.recCustomize")}
          </button>
        </div>

        {/* Expanded custom options */}
        {showCustomRecurrence && (
          <div className="bg-gray-50/80 rounded-xl p-3 space-y-3">
            <div className="flex flex-wrap gap-1.5">
              {[
                { value: "daily", label: t("newForm.recDaily") },
                { value: "weekly", label: t("newForm.recWeekly") },
                { value: "biweekly", label: t("newForm.recBiweekly") },
                { value: "monthly", label: t("newForm.recMonthly") },
                { value: "yearly", label: t("newForm.recYearly") },
                { value: "custom", label: t("newForm.recCustom") },
              ].map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setRecurrence(opt.value)}
                  className={`px-3 py-2 rounded-lg text-xs font-medium transition-all border ${
                    recurrence === opt.value
                      ? "bg-[#D4735A]/10 border-[#D4735A]/30 text-[#D4735A]"
                      : "bg-white border-gray-200 text-[#7A8C8B] hover:bg-gray-50"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            {showCustom && (
              <div className="flex items-center gap-2">
                <span className="text-sm text-[#2C2C2C]">{t("newForm.every")}</span>
                <input
                  type="number" min={1} max={99}
                  value={customInterval}
                  onChange={(e) => setCustomInterval(Math.max(1, parseInt(e.target.value) || 1))}
                  className="w-14 px-2 py-2 border border-gray-200 rounded-lg text-center text-sm text-[#2C2C2C]"
                />
                <select
                  value={customUnit}
                  onChange={(e) => setCustomUnit(e.target.value)}
                  className="px-3 py-2 border border-gray-200 rounded-lg text-sm text-[#2C2C2C] bg-white"
                >
                  <option value="day">{customInterval === 1 ? t("newForm.unitDay") : t("newForm.unitDays")}</option>
                  <option value="week">{customInterval === 1 ? t("newForm.unitWeek") : t("newForm.unitWeeks")}</option>
                  <option value="month">{customInterval === 1 ? t("newForm.unitMonth") : t("newForm.unitMonths")}</option>
                </select>
              </div>
            )}
          </div>
        )}

        {/* Day of week selector */}
        {showDayOfWeek && (
          <div>
            <p className="text-[11px] text-[#7A8C8B] mb-2">{t("newForm.selectDays")}</p>
            <div className="flex gap-1.5">
              {DAY_NAMES.map((day, i) => {
                const isSelected = selectedDays.includes(i);
                return (
                  <button
                    key={i} type="button" onClick={() => toggleDay(i)}
                    className={`flex-1 text-center py-3 rounded-xl border-2 text-xs font-bold transition-all min-h-[44px] ${
                      isSelected
                        ? "bg-[#D4735A] text-white border-[#D4735A] shadow-sm"
                        : "border-gray-100 text-[#7A8C8B] bg-white hover:border-gray-200"
                    }`}
                  >
                    {day}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Day of month */}
        {showDayOfMonth && (
          <div>
            <p className="text-[11px] text-[#7A8C8B] mb-2">{t("newForm.dayOfMonth")}</p>
            <select name="dayOfMonth" className={`${inputClass} bg-white`}>
              {Array.from({ length: 31 }, (_, i) => (
                <option key={i + 1} value={i + 1}>{t("newForm.dayNum", { num: i + 1 })}</option>
              ))}
            </select>
          </div>
        )}

        {/* Recurrence summary badge */}
        {recurrence !== "never" && (
          <div className="flex items-center gap-2 bg-[#D4735A]/5 rounded-xl px-3 py-2.5">
            <svg className="w-4 h-4 text-[#D4735A] flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            <span className="text-[12px] text-[#D4735A] font-medium">{getRecurrenceSummary()}</span>
          </div>
        )}
      </div>
    );
  }

  /* ================================================================ */
  /*  RENDER                                                           */
  /* ================================================================ */

  return (
    <form action={handleSubmit} className="space-y-4 pb-24">
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-600 flex items-center gap-2">
          <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
          </svg>
          {error}
        </div>
      )}

      {/* ========== STEP 1: Category Selector ========== */}
      <div className={sectionCard}>
        <p className={sectionLabel}>
          <span>{"\uD83C\uDFAF"}</span> {t("newForm.categoryTitle")}
        </p>
        <div className="grid grid-cols-4 gap-2.5">
          {ALL_CATEGORIES.map((cat) => {
            const isSelected = selectedCategory === cat.value;
            return (
              <button
                key={cat.value}
                type="button"
                onClick={() => handleCategorySelect(cat.value)}
                className={`flex flex-col items-center gap-1.5 p-3 rounded-2xl border-2 transition-all min-h-[72px] ${
                  isSelected
                    ? "border-[#D4735A] bg-[#D4735A]/5 shadow-sm scale-[1.02]"
                    : "border-gray-100 bg-white hover:border-gray-200 hover:bg-gray-50/50"
                }`}
              >
                <span className="text-2xl leading-none">{cat.icon}</span>
                <span className={`text-[10px] font-semibold leading-tight ${isSelected ? "text-[#D4735A]" : "text-[#7A8C8B]"}`}>
                  {cat.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ========== ACTIVITY FORM ========== */}
      {formType === "activity" && selectedCategory && (
        <div className="space-y-3 animate-[fadeIn_200ms_ease-out]">

          {/* --- Date: immediately after category --- */}
          <div className={sectionCard}>
            <p className={sectionLabel}>
              <span>{"\uD83D\uDCC5"}</span> {t("newForm.whenStart")}
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] text-[#7A8C8B] mb-1">
                  {recurrence === "never" ? t("newForm.date") : t("newForm.startDate")} <span className="text-[#D4735A]">*</span>
                </label>
                <input name="startDate" type="date" required className={inputClass} />
              </div>
              {recurrence !== "never" && (
                <div>
                  <label className="block text-[11px] text-[#7A8C8B] mb-1">{t("newForm.endDateOpt")}</label>
                  <input name="endDate" type="date" className={inputClass} />
                </div>
              )}
            </div>
          </div>

          {/* --- Child selector --- */}
          {children.length > 1 && (
            <div className={sectionCard}>
              <p className={sectionLabel}>
                <span>{"\uD83D\uDC67"}</span> {t("newForm.forWhom")}
              </p>
              <ChildSelector mode="toggle" />
            </div>
          )}
          {children.length === 1 && <input type="hidden" name="childId" value={children[0].id} />}

          {/* --- Activity name --- */}
          <div className={sectionCard}>
            <p className={sectionLabel}>
              <span>{"\u270F\uFE0F"}</span> {t("newForm.activityName")}
            </p>
            <input
              name="name" required
              placeholder={t("newForm.activityNamePlaceholder")}
              className={inputClass}
            />
          </div>

          {/* --- Responsible --- */}
          <div className={sectionCard}>
            <p className={sectionLabel}>
              <span>{"\uD83D\uDE97"}</span> {t("newForm.whoTakes")}
            </p>
            <ResponsibleSelector
              selectedId={responsibleId}
              onSelect={setResponsibleId}
              showOther={showOtherResponsible}
              onToggleOther={setShowOtherResponsible}
              nameFieldName="activityAssignedName"
            />
          </div>

          {/* --- Recurrence --- */}
          <div className={sectionCard}>
            <p className={sectionLabel}>
              <span>{"\uD83D\uDD01"}</span> {t("newForm.repeat")}
            </p>
            <RecurrenceSection />
          </div>

          {/* --- Time & Location --- */}
          <div className={sectionCard}>
            <p className={sectionLabel}>
              <span>{"\u23F0"}</span> {t("newForm.timeAndPlace")}
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] text-[#7A8C8B] mb-1">{t("newForm.timeStart")}</label>
                <input name="timeStart" type="time" className={inputClass} />
              </div>
              <div>
                <label className="block text-[11px] text-[#7A8C8B] mb-1">{t("newForm.timeEnd")}</label>
                <input name="timeEnd" type="time" className={inputClass} />
              </div>
            </div>
            <div>
              <label className="block text-[11px] text-[#7A8C8B] mb-1">{t("newForm.location")}</label>
              <input name="location" placeholder={t("newForm.locationPlaceholder")} className={inputClass} />
            </div>
          </div>

          {/* --- Extra Details (collapsible) --- */}
          {STRUCTURED_ACTIVITIES.has(selectedCategory) && (
            <CollapsibleSection icon={"\uD83D\uDCCB"} title={t("newForm.additionalDetails")}>
              <div>
                <label className="block text-[11px] text-[#7A8C8B] mb-1">{t("newForm.teacher")}</label>
                <input name="teacherName" placeholder={t("newForm.teacherPlaceholder")} className={inputClass} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] text-[#7A8C8B] mb-1">{t("newForm.classGroup")}</label>
                  <input name="className" placeholder={t("newForm.classPlaceholder")} className={inputClass} />
                </div>
                <div>
                  <label className="block text-[11px] text-[#7A8C8B] mb-1">{t("newForm.room")}</label>
                  <input name="room" placeholder={t("newForm.roomPlaceholder")} className={inputClass} />
                </div>
              </div>
            </CollapsibleSection>
          )}

          {/* --- Checklist (collapsible) --- */}
          <CollapsibleSection icon={"\u2705"} title={t("newForm.checklistTitle")} defaultOpen={checklistItems.length > 0}>
            {checklistItems.length > 0 && (
              <div className="space-y-1.5">
                {checklistItems.map((item, i) => (
                  <div key={i} className="flex items-center gap-2.5 bg-gray-50 rounded-lg px-3 py-2">
                    <div className="w-[18px] h-[18px] rounded border-2 border-gray-300 flex-shrink-0" />
                    <span className="text-[13px] text-[#2C2C2C] flex-1">{item}</span>
                    <button
                      type="button" onClick={() => removeChecklistItem(i)}
                      className="p-1 hover:bg-red-50 rounded text-gray-400 hover:text-red-500 transition-colors min-w-[28px] min-h-[28px] flex items-center justify-center"
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
                onKeyDown={handleChecklistKeyDown}
                placeholder={t("newForm.addItem")}
                className="flex-1 px-3 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#D4735A]/30 text-sm text-[#2C2C2C]"
              />
              <button
                type="button" onClick={addChecklistItem} disabled={!newItem.trim()}
                className="px-4 py-2.5 bg-[#D4735A] text-white font-medium rounded-xl disabled:opacity-40 text-sm transition-opacity min-h-[44px]"
              >
                +
              </button>
            </div>
          </CollapsibleSection>

          {/* --- Notes (collapsible) --- */}
          <CollapsibleSection icon={"\uD83D\uDCDD"} title={t("newForm.notes")}>
            <textarea
              name="notes" rows={2}
              placeholder={t("newForm.notesPlaceholder")}
              className={`${inputClass} resize-none`}
            />
          </CollapsibleSection>
        </div>
      )}

      {/* ========== EVENT FORM ========== */}
      {formType === "event" && (
        <div className="space-y-3 animate-[fadeIn_200ms_ease-out]">

          {/* --- Title --- */}
          <div className={sectionCard}>
            <p className={sectionLabel}>
              <span>{"\u270F\uFE0F"}</span> {t("newForm.eventTitle")}
            </p>
            <input
              name="title" required
              placeholder={t("newForm.eventTitlePlaceholder")}
              className={inputClass}
            />
          </div>

          {/* --- Date --- */}
          <div className={sectionCard}>
            <p className={sectionLabel}>
              <span>{"\uD83D\uDCC5"}</span> {t("newForm.when")}
            </p>

            {/* Toggles */}
            <div className="flex gap-3">
              <label className="flex items-center gap-2.5 cursor-pointer min-h-[44px]">
                <input
                  type="checkbox" checked={allDay}
                  onChange={(e) => setAllDay(e.target.checked)}
                  className="w-5 h-5 rounded border-gray-300 text-[#D4735A] focus:ring-[#D4735A]"
                />
                <span className="text-sm text-[#2C2C2C]">{t("calendar.allDay")}</span>
              </label>
              <label className="flex items-center gap-2.5 cursor-pointer min-h-[44px]">
                <input
                  type="checkbox" checked={multiDay}
                  onChange={(e) => { setMultiDay(e.target.checked); if (e.target.checked) setAllDay(true); }}
                  className="w-5 h-5 rounded border-gray-300 text-[#D4735A] focus:ring-[#D4735A]"
                />
                <span className="text-sm text-[#2C2C2C]">{t("calendar.multiDay")}</span>
              </label>
            </div>
            <input type="hidden" name="allDay" value={allDay ? "true" : "false"} />

            <div className={`grid ${multiDay ? "grid-cols-2" : allDay ? "grid-cols-1" : "grid-cols-2"} gap-3`}>
              <div>
                <label className="block text-[11px] text-[#7A8C8B] mb-1">
                  {multiDay ? t("newForm.startDate") : t("newForm.date")} <span className="text-[#D4735A]">*</span>
                </label>
                <input name="eventDate" type="date" required className={inputClass} />
              </div>
              {multiDay && (
                <div>
                  <label className="block text-[11px] text-[#7A8C8B] mb-1">
                    {t("newForm.endDate")} <span className="text-[#D4735A]">*</span>
                  </label>
                  <input name="endDate" type="date" required className={inputClass} />
                </div>
              )}
              {!allDay && (
                <div>
                  <label className="block text-[11px] text-[#7A8C8B] mb-1">{t("newForm.time")}</label>
                  <input name="eventTime" type="time" className={inputClass} />
                </div>
              )}
            </div>
          </div>

          {/* --- Child selector --- */}
          <div className={sectionCard}>
            <p className={sectionLabel}>
              <span>{"\uD83D\uDC67"}</span> {t("newForm.child")}
            </p>
            <ChildSelector mode="dropdown-optional" />
          </div>

          {/* --- Responsible --- */}
          <div className={sectionCard}>
            <p className={sectionLabel}>
              <span>{"\uD83D\uDE97"}</span> {t("newForm.responsibleForTaking")}
            </p>
            <ResponsibleSelector
              selectedId={eventResponsibleId}
              onSelect={setEventResponsibleId}
              showOther={showEventOtherResponsible}
              onToggleOther={setShowEventOtherResponsible}
              nameFieldName="assignedToName"
            />
          </div>

          {/* --- Location --- */}
          <div className={sectionCard}>
            <p className={sectionLabel}>
              <span>{"\uD83D\uDCCD"}</span> {t("newForm.location")}
            </p>
            <input
              name="location"
              placeholder={t("newForm.eventLocationPlaceholder")}
              className={inputClass}
            />
          </div>

          {/* --- Description --- */}
          <CollapsibleSection icon={"\uD83D\uDCDD"} title={t("newForm.description")}>
            <textarea
              name="description" rows={3}
              placeholder={t("newForm.descriptionPlaceholder")}
              className={`${inputClass} resize-none`}
            />
          </CollapsibleSection>

          {/* --- Image upload --- */}
          <CollapsibleSection icon={"\uD83D\uDCF7"} title={t("newForm.image")}>
            <input
              name="image" type="file" accept="image/*"
              className="w-full text-sm text-[#7A8C8B] file:mr-3 file:py-2.5 file:px-4 file:rounded-xl file:border-0 file:text-sm file:font-medium file:bg-[#D4735A]/10 file:text-[#D4735A] hover:file:bg-[#D4735A]/20 transition-all"
            />
            <p className="text-[10px] text-[#7A8C8B]">{t("newForm.imageHint")}</p>
          </CollapsibleSection>
        </div>
      )}

      {/* ========== CUSTODY FORM ========== */}
      {formType === "custody" && (
        <div className="space-y-3 animate-[fadeIn_200ms_ease-out]">

          {/* --- Child (required) --- */}
          <div className={sectionCard}>
            <p className={sectionLabel}>
              <span>{"\uD83D\uDC67"}</span> {t("newForm.child")} <span className="text-[#D4735A]">*</span>
            </p>
            <div className="flex flex-wrap gap-2">
              {children.map((child) => {
                const isSelected = custodyChildId === child.id;
                const initial = child.full_name.charAt(0).toUpperCase();
                return (
                  <button
                    key={child.id} type="button"
                    onClick={() => setCustodyChildId(child.id)}
                    className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border-2 transition-all min-h-[44px] ${
                      isSelected
                        ? "border-[#5B9E85] bg-[#5B9E85]/5 shadow-sm"
                        : "border-gray-100 bg-white hover:border-gray-200"
                    }`}
                  >
                    <span className="w-7 h-7 rounded-full bg-[#5B9E85]/15 text-[#5B9E85] flex items-center justify-center text-xs font-bold flex-shrink-0">
                      {initial}
                    </span>
                    <span className={`text-sm font-medium ${isSelected ? "text-[#5B9E85]" : "text-[#2C2C2C]"}`}>
                      {child.full_name.split(" ")[0]}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* --- Responsible (required) --- */}
          <div className={sectionCard}>
            <p className={sectionLabel}>
              <span>{"\uD83D\uDC64"}</span> {t("newForm.custodyWith")} <span className="text-[#D4735A]">*</span>
            </p>
            <div className="flex flex-wrap gap-2">
              {members.map((m) => {
                const isSelected = custodyResponsibleId === m.user_id;
                const displayName = getDisplayName(m.full_name, true);
                const initial = displayName.charAt(0).toUpperCase();
                return (
                  <button
                    key={m.user_id} type="button"
                    onClick={() => setCustodyResponsibleId(m.user_id)}
                    className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border-2 transition-all min-h-[44px] ${
                      isSelected
                        ? "border-[#D4735A] bg-[#D4735A]/5 shadow-sm"
                        : "border-gray-100 bg-white hover:border-gray-200"
                    }`}
                  >
                    <span className="w-7 h-7 rounded-full bg-[#D4735A]/15 text-[#D4735A] flex items-center justify-center text-xs font-bold flex-shrink-0">
                      {initial}
                    </span>
                    <span className={`text-sm font-medium ${isSelected ? "text-[#D4735A]" : "text-[#2C2C2C]"}`}>
                      {displayName}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* --- Dates (prominent) --- */}
          <div className={sectionCard}>
            <p className={sectionLabel}>
              <span>{"\uD83D\uDCC5"}</span> {t("newForm.period")}
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] text-[#7A8C8B] mb-1">
                  {t("newForm.startDate")} <span className="text-[#D4735A]">*</span>
                </label>
                <input
                  name="startDate" type="date" required
                  defaultValue={todayStr} min={todayStr}
                  className={inputClass}
                />
              </div>
              <div>
                <label className="block text-[11px] text-[#7A8C8B] mb-1">
                  {t("newForm.endDate")} <span className="text-[#D4735A]">*</span>
                </label>
                <input
                  name="endDate" type="date" required
                  defaultValue={todayStr} min={todayStr}
                  className={inputClass}
                />
              </div>
            </div>
          </div>

          {/* --- Custody Type --- */}
          <div className={sectionCard}>
            <p className={sectionLabel}>
              <span>{"\uD83C\uDFF7\uFE0F"}</span> {t("newForm.custodyType")}
            </p>
            <div className="flex flex-wrap gap-2">
              {CUSTODY_TYPES.map((ct) => (
                <label key={ct.value} className="cursor-pointer">
                  <input
                    type="radio" name="custodyType" value={ct.value}
                    defaultChecked={ct.value === "regular"} className="sr-only peer"
                  />
                  <span className="inline-flex items-center px-4 py-2.5 rounded-xl text-sm font-medium transition-all border-2 min-h-[44px] peer-checked:border-[#D4735A] peer-checked:bg-[#D4735A]/5 peer-checked:text-[#D4735A] border-gray-100 bg-white text-[#7A8C8B] hover:border-gray-200">
                    {ct.label}
                  </span>
                </label>
              ))}
            </div>
          </div>

          {/* --- Time toggle --- */}
          <div className={sectionCard}>
            <label className="flex items-center gap-2.5 cursor-pointer min-h-[44px]">
              <input
                type="checkbox" checked={hasTime}
                onChange={(e) => setHasTime(e.target.checked)}
                className="w-5 h-5 text-[#D4735A] rounded border-gray-300 focus:ring-[#D4735A]"
              />
              <span className="text-sm font-medium text-[#2C2C2C]">{t("newForm.setTime")}</span>
            </label>

            {hasTime && (
              <div className="grid grid-cols-2 gap-3 pt-1">
                <div>
                  <label className="block text-[11px] text-[#7A8C8B] mb-1">{t("newForm.timeStart")}</label>
                  <input name="startTime" type="time" className={inputClass} />
                </div>
                <div>
                  <label className="block text-[11px] text-[#7A8C8B] mb-1">{t("newForm.timeEnd")}</label>
                  <input name="endTime" type="time" className={inputClass} />
                </div>
              </div>
            )}
          </div>

          {/* --- Recurring toggle --- */}
          <div className={sectionCard}>
            <label className="flex items-center gap-2.5 cursor-pointer min-h-[44px]">
              <input
                type="checkbox" checked={isRecurring}
                onChange={(e) => setIsRecurring(e.target.checked)}
                className="w-5 h-5 text-[#D4735A] rounded border-gray-300 focus:ring-[#D4735A]"
              />
              <span className="text-sm font-medium text-[#2C2C2C]">{t("newForm.recurringEvent")}</span>
            </label>

            {isRecurring && (
              <div className="bg-gray-50/80 rounded-xl p-3.5 space-y-3 mt-1">
                <div>
                  <label className="block text-[11px] text-[#7A8C8B] mb-1">{t("newForm.frequency")}</label>
                  <select name="recurrenceRule" required className={`${inputClass} bg-white`}>
                    <option value="weekly">{t("newForm.freqWeekly")}</option>
                    <option value="biweekly">{t("newForm.freqBiweekly")}</option>
                    <option value="daily">{t("newForm.freqDaily")}</option>
                    <option value="monthly">{t("newForm.freqMonthly")}</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] text-[#7A8C8B] mb-1">{t("newForm.repeatUntil")}</label>
                  <input name="recurrenceUntil" type="date" required className={inputClass} />
                </div>
                <p className="text-[11px] text-[#7A8C8B]">{t("newForm.repeatHint")}</p>
              </div>
            )}
          </div>

          {/* --- Notes (collapsible) --- */}
          <CollapsibleSection icon={"\uD83D\uDCDD"} title={t("newForm.notes")}>
            <textarea
              name="notes" rows={2}
              placeholder={t("newForm.custodyNotesPlaceholder")}
              className={`${inputClass} resize-none`}
            />
          </CollapsibleSection>
        </div>
      )}

      {/* ========== STICKY SUBMIT ========== */}
      {selectedCategory && (
        <div className="fixed bottom-0 left-0 right-0 bg-gradient-to-t from-[#EEECEA] via-[#EEECEA] to-transparent pt-4 pb-6 px-5 z-50">
          <div className="max-w-lg mx-auto flex gap-3">
            <Link
              href="/calendario"
              className="px-5 py-3.5 border-2 border-gray-200 text-[#2C2C2C] font-medium rounded-2xl text-center hover:bg-white text-sm transition-colors min-h-[48px] flex items-center justify-center"
            >
              {t("common.cancel")}
            </Link>
            <button
              type="submit"
              disabled={isDisabled}
              className="flex-1 py-3.5 bg-[#D4735A] text-white font-bold rounded-2xl hover:bg-[#C4624A] transition-all disabled:opacity-50 disabled:cursor-not-allowed text-sm shadow-lg min-h-[48px]"
            >
              {isDisabled ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  {t("newForm.saving")}
                </span>
              ) : formType === "activity" ? (
                t("newForm.saveActivity")
              ) : formType === "event" ? (
                t("newForm.saveEvent")
              ) : (
                t("newForm.saveCustody")
              )}
            </button>
          </div>
        </div>
      )}

      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </form>
  );
}
