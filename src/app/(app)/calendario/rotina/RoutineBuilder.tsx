"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/i18n/provider";
import { DAY_NAMES, getDisplayName } from "@/lib/constants";
import { saveRoutineGrid } from "@/actions/care-routine";
import type { RoutineSlotRow, RoutineCellInput, CareRoutineLeg } from "@/lib/services/care-routine";

interface Member {
  user_id: string;
  full_name: string;
  color: string;
}
interface Child {
  id: string;
  full_name: string;
}
interface RoutineBuilderProps {
  groupId: string;
  childrenList: Child[];
  members: Member[];
  currentUserId: string;
  initialSlots: RoutineSlotRow[];
}

type LegState = string | null; // responsible_id | null
interface ChildGrid {
  // weekday (0-6) → { dropoff, pickup }
  cells: Record<number, { dropoff: LegState; pickup: LegState }>;
  dropoffTime: string;
  pickupTime: string;
  dropoffLabel: string;
  pickupLabel: string;
}

const WEEKDAYS_CORE = [1, 2, 3, 4, 5]; // Seg–Sex
const WEEKEND = [6, 0]; // Sáb, Dom
const LEGS: CareRoutineLeg[] = ["dropoff", "pickup"];

function emptyGrid(): ChildGrid {
  return { cells: {}, dropoffTime: "", pickupTime: "", dropoffLabel: "", pickupLabel: "" };
}

function gridFromSlots(slots: RoutineSlotRow[], childId: string): ChildGrid {
  const g = emptyGrid();
  for (const s of slots) {
    if (s.child_id !== childId) continue;
    const cell = g.cells[s.weekday] || { dropoff: null, pickup: null };
    cell[s.leg] = s.responsible_id;
    g.cells[s.weekday] = cell;
    // Pega o primeiro time/label não-nulo por perna como default do filho.
    if (s.leg === "dropoff") {
      if (s.time_of_day && !g.dropoffTime) g.dropoffTime = s.time_of_day.slice(0, 5);
      if (s.label && !g.dropoffLabel) g.dropoffLabel = s.label;
    } else {
      if (s.time_of_day && !g.pickupTime) g.pickupTime = s.time_of_day.slice(0, 5);
      if (s.label && !g.pickupLabel) g.pickupLabel = s.label;
    }
  }
  return g;
}

export default function RoutineBuilder({
  groupId,
  childrenList,
  members,
  currentUserId,
  initialSlots,
}: RoutineBuilderProps) {
  const { t } = useI18n();
  const router = useRouter();

  const [childId, setChildId] = useState(childrenList[0]?.id || "");
  const [grids, setGrids] = useState<Record<string, ChildGrid>>(() => {
    const out: Record<string, ChildGrid> = {};
    for (const c of childrenList) out[c.id] = gridFromSlots(initialSlots, c.id);
    return out;
  });
  const [includeWeekend, setIncludeWeekend] = useState(() =>
    initialSlots.some((s) => s.weekday === 0 || s.weekday === 6),
  );
  const [showOptions, setShowOptions] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  const grid = grids[childId] || emptyGrid();
  const days = includeWeekend ? [...WEEKDAYS_CORE, ...WEEKEND] : WEEKDAYS_CORE;

  const me = members.find((m) => m.user_id === currentUserId) || members[0];
  const other = members.find((m) => m.user_id !== currentUserId) || me;

  function nextResp(cur: LegState): LegState {
    if (cur === null) return members[0]?.user_id ?? null;
    if (cur === members[0]?.user_id && members.length > 1) return members[1].user_id;
    return null;
  }

  function patch(updater: (g: ChildGrid) => ChildGrid) {
    setGrids((prev) => ({ ...prev, [childId]: updater(prev[childId] || emptyGrid()) }));
    setSaved(false);
    setError("");
  }

  function cycleCell(weekday: number, leg: CareRoutineLeg) {
    patch((g) => {
      const cell = g.cells[weekday] || { dropoff: null, pickup: null };
      const updated = { ...cell, [leg]: nextResp(cell[leg]) };
      return { ...g, cells: { ...g.cells, [weekday]: updated } };
    });
  }

  function cycleFullDay(weekday: number) {
    patch((g) => {
      const cell = g.cells[weekday] || { dropoff: null, pickup: null };
      const next = nextResp(cell.dropoff);
      return { ...g, cells: { ...g.cells, [weekday]: { dropoff: next, pickup: next } } };
    });
  }

  function applyPreset(preset: "iDropYouPick" | "youDropIPick" | "alternateFullDay") {
    patch((g) => {
      const cells: ChildGrid["cells"] = {};
      WEEKDAYS_CORE.forEach((wd, idx) => {
        if (preset === "iDropYouPick") cells[wd] = { dropoff: me?.user_id ?? null, pickup: other?.user_id ?? null };
        else if (preset === "youDropIPick") cells[wd] = { dropoff: other?.user_id ?? null, pickup: me?.user_id ?? null };
        else {
          const who = idx % 2 === 0 ? me?.user_id ?? null : other?.user_id ?? null;
          cells[wd] = { dropoff: who, pickup: who };
        }
      });
      return { ...g, cells };
    });
  }

  function applyToAllChildren() {
    setGrids((prev) => {
      const out = { ...prev };
      for (const c of childrenList) out[c.id] = JSON.parse(JSON.stringify(grid)) as ChildGrid;
      return out;
    });
    setSaved(false);
  }

  function buildCells(g: ChildGrid): RoutineCellInput[] {
    const out: RoutineCellInput[] = [];
    for (const wd of days) {
      const cell = g.cells[wd];
      if (!cell) continue;
      for (const leg of LEGS) {
        const resp = cell[leg];
        if (!resp) continue;
        out.push({
          weekday: wd,
          leg,
          responsibleId: resp,
          timeOfDay: (leg === "dropoff" ? g.dropoffTime : g.pickupTime) || null,
          label: (leg === "dropoff" ? g.dropoffLabel : g.pickupLabel) || null,
        });
      }
    }
    return out;
  }

  async function handleSave() {
    if (!childId) return;
    setSubmitting(true);
    setError("");
    const fd = new FormData();
    fd.set("groupId", groupId);
    fd.set("childId", childId);
    fd.set("cells", JSON.stringify(buildCells(grid)));
    const res = await saveRoutineGrid(fd);
    setSubmitting(false);
    if (res?.error) {
      setError(typeof res.error === "string" ? res.error : t("error.careRoutine.saveFailed"));
      return;
    }
    setSaved(true);
    router.refresh();
  }

  function colorOf(resp: LegState): Member | null {
    return resp ? members.find((m) => m.user_id === resp) || null : null;
  }

  function CellButton({ weekday, leg }: { weekday: number; leg: CareRoutineLeg }) {
    const resp = grid.cells[weekday]?.[leg] ?? null;
    const m = colorOf(resp);
    const legLabel = leg === "dropoff" ? t("careRoutine.dropoff") : t("careRoutine.pickup");
    const who = m ? getDisplayName(m.full_name, true) : t("careRoutine.free");
    return (
      <button
        type="button"
        onClick={() => cycleCell(weekday, leg)}
        aria-label={t("a11y.careRoutine.cell", { day: DAY_NAMES[weekday], leg: legLabel, who })}
        className={`flex-1 min-h-[44px] rounded-lg flex items-center justify-center text-[11px] font-semibold border-2 transition-all ${
          m ? "border-transparent text-white shadow-sm" : "border-dashed border-gray-300 text-muted bg-white hover:border-gray-400"
        }`}
        style={m ? { backgroundColor: m.color } : {}}
      >
        {m ? getDisplayName(m.full_name, true) : "+"}
      </button>
    );
  }

  return (
    <div className="space-y-5 pt-4">
      <header>
        <h1 className="text-lg font-bold text-dark">{t("careRoutine.title")}</h1>
        <p className="text-xs text-muted mt-0.5">{t("careRoutine.subtitle")}</p>
      </header>

      {/* Child selector */}
      {childrenList.length > 1 && (
        <div className="bg-white rounded-xl p-4 shadow-sm">
          <label className="block text-sm font-medium text-dark mb-1">{t("careRoutine.child")}</label>
          <select
            value={childId}
            onChange={(e) => setChildId(e.target.value)}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50"
          >
            {childrenList.map((c) => (
              <option key={c.id} value={c.id}>
                {getDisplayName(c.full_name, true)}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Presets */}
      <div className="bg-white rounded-xl p-4 shadow-sm">
        <h3 className="text-sm font-semibold text-dark mb-3">{t("careRoutine.presetsTitle")}</h3>
        <div className="grid grid-cols-1 gap-2">
          <button type="button" onClick={() => applyPreset("iDropYouPick")} className="text-left px-3 py-2 bg-gray-50 rounded-lg hover:bg-gray-100 text-xs font-medium text-dark">
            {t("careRoutine.presetIDropYouPick")}
          </button>
          <button type="button" onClick={() => applyPreset("youDropIPick")} className="text-left px-3 py-2 bg-gray-50 rounded-lg hover:bg-gray-100 text-xs font-medium text-dark">
            {t("careRoutine.presetYouDropIPick")}
          </button>
          <button type="button" onClick={() => applyPreset("alternateFullDay")} className="text-left px-3 py-2 bg-gray-50 rounded-lg hover:bg-gray-100 text-xs font-medium text-dark">
            {t("careRoutine.presetAlternateFullDay")}
          </button>
        </div>
      </div>

      {/* Grid */}
      <div className="bg-white rounded-xl p-4 shadow-sm">
        {/* Legend */}
        <div className="flex flex-wrap items-center gap-3 mb-4 p-3 bg-gray-50 rounded-lg">
          {members.map((m) => (
            <div key={m.user_id} className="flex items-center gap-2">
              <div className="w-4 h-4 rounded" style={{ backgroundColor: m.color }} />
              <span className="text-sm font-medium text-dark">
                {getDisplayName(m.full_name, true)}
                {m.user_id === currentUserId ? ` ${t("careRoutine.you")}` : ""}
              </span>
            </div>
          ))}
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded border-2 border-dashed border-gray-300" />
            <span className="text-sm text-muted">{t("careRoutine.free")}</span>
          </div>
        </div>

        {/* Column headers */}
        <div className="flex items-center gap-2 mb-1 px-1">
          <div className="w-10" />
          <div className="flex-1 text-center text-[11px] font-semibold text-muted">🚗 {t("careRoutine.dropoff")}</div>
          <div className="flex-1 text-center text-[11px] font-semibold text-muted">🏠 {t("careRoutine.pickup")}</div>
          <div className="w-12 text-center text-[10px] text-muted">{t("careRoutine.fullDayShort")}</div>
        </div>

        {/* Rows */}
        <div className="space-y-1.5">
          {days.map((wd) => {
            const cell = grid.cells[wd] || { dropoff: null, pickup: null };
            const isFullDay = cell.dropoff != null && cell.dropoff === cell.pickup;
            return (
              <div key={wd} className="flex items-center gap-2">
                <div className={`w-10 text-xs font-medium ${wd === 0 || wd === 6 ? "text-amber-600" : "text-dark"}`}>
                  {DAY_NAMES[wd]}
                </div>
                <CellButton weekday={wd} leg="dropoff" />
                <CellButton weekday={wd} leg="pickup" />
                <button
                  type="button"
                  onClick={() => cycleFullDay(wd)}
                  title={t("careRoutine.fullDay")}
                  aria-label={t("careRoutine.fullDay")}
                  className={`w-12 min-h-[44px] rounded-lg text-[10px] font-semibold border-2 ${
                    isFullDay ? "border-primary bg-primary/10 text-primary" : "border-gray-200 text-muted hover:bg-gray-50"
                  }`}
                >
                  {isFullDay ? "✓" : "↔"}
                </button>
              </div>
            );
          })}
        </div>

        <button
          type="button"
          onClick={() => setIncludeWeekend((v) => !v)}
          className="mt-3 text-xs text-primary font-medium hover:underline"
        >
          {includeWeekend ? t("careRoutine.hideWeekend") : t("careRoutine.showWeekend")}
        </button>

        <p className="text-[11px] text-center text-muted pt-3 mt-2 border-t border-gray-100">
          {t("careRoutine.tapToCycle")}
        </p>
      </div>

      {/* Mais opções: horários + destino */}
      <div className="bg-white rounded-xl p-4 shadow-sm">
        <button type="button" onClick={() => setShowOptions((v) => !v)} className="text-sm font-medium text-dark flex items-center gap-1">
          {showOptions ? "▾" : "▸"} {t("careRoutine.moreOptions")}
        </button>
        {showOptions && (
          <div className="grid grid-cols-2 gap-3 mt-3">
            <label className="text-xs text-muted">
              {t("careRoutine.timeDropoff")}
              <input type="time" value={grid.dropoffTime} onChange={(e) => patch((g) => ({ ...g, dropoffTime: e.target.value }))} className="mt-1 w-full px-2 py-1.5 border border-gray-200 rounded-lg" />
            </label>
            <label className="text-xs text-muted">
              {t("careRoutine.timePickup")}
              <input type="time" value={grid.pickupTime} onChange={(e) => patch((g) => ({ ...g, pickupTime: e.target.value }))} className="mt-1 w-full px-2 py-1.5 border border-gray-200 rounded-lg" />
            </label>
            <label className="text-xs text-muted">
              {t("careRoutine.labelDropoff")}
              <input type="text" value={grid.dropoffLabel} onChange={(e) => patch((g) => ({ ...g, dropoffLabel: e.target.value }))} placeholder={t("careRoutine.labelPlaceholder")} className="mt-1 w-full px-2 py-1.5 border border-gray-200 rounded-lg" />
            </label>
            <label className="text-xs text-muted">
              {t("careRoutine.labelPickup")}
              <input type="text" value={grid.pickupLabel} onChange={(e) => patch((g) => ({ ...g, pickupLabel: e.target.value }))} placeholder={t("careRoutine.labelPlaceholder")} className="mt-1 w-full px-2 py-1.5 border border-gray-200 rounded-lg" />
            </label>
          </div>
        )}
      </div>

      {childrenList.length > 1 && (
        <button type="button" onClick={applyToAllChildren} className="w-full py-2 text-sm font-medium text-primary border border-primary/30 rounded-xl hover:bg-primary/5">
          {t("careRoutine.applyAllChildren")}
        </button>
      )}

      {error && <p className="text-sm text-error bg-error/10 px-4 py-3 rounded-xl">{error}</p>}
      {saved && <p className="text-sm text-primary bg-primary/10 px-4 py-3 rounded-xl">{t("careRoutine.saved")}</p>}

      <button
        type="button"
        onClick={handleSave}
        disabled={submitting}
        className="w-full py-4 bg-primary text-white font-semibold rounded-xl hover:bg-primary-dark transition-colors disabled:opacity-50 text-lg"
      >
        {submitting ? t("careRoutine.saving") : t("careRoutine.save")}
      </button>
    </div>
  );
}
