"use client";

import Link from "next/link";
import type { ParentColorMap } from "@/lib/calendar-utils";

interface WeekDay {
  dateKey: string;
  dayNum: number;
  label: string;
  isToday: boolean;
  isPast: boolean;
}

interface PendingAction {
  type: string;
  label: string;
  href: string;
  icon: string;
}

interface ChildSummary {
  id: string;
  name: string;
  healthStatus: string;
  appointmentsCount: number;
  activitiesCount: number;
  checkinsCount: number;
  medsCount: number;
}

interface SwapInfo {
  id: string;
  date: string;
  type: string;
  isIncoming: boolean;
}

interface Props {
  weekMood: "calm" | "busy" | "alert";
  weekDays: WeekDay[];
  custodyByDay: Record<string, { responsibleId: string; color: string }>;
  eventsByDay: Record<string, number>;
  checkinsByDay: Record<string, boolean>;
  healthAlertDays: string[];
  kpis: { totalEvents: number; medsCount: number; pendingCount: number; messagesCount: number };
  pendingActions: PendingAction[];
  childSummaries: ChildSummary[];
  nextSwaps: SwapInfo[];
  custodyEnabled: boolean;
  insight: string;
  parentColors: ParentColorMap;
}

const moodConfig = {
  calm: { label: "Semana tranquila", emoji: "🟢", bg: "bg-[#2E7268]/5", border: "border-[#2E7268]/15", text: "text-[#2E7268]" },
  busy: { label: "Semana intensa", emoji: "🟡", bg: "bg-amber-50", border: "border-amber-200/50", text: "text-amber-700" },
  alert: { label: "Atencao necessaria", emoji: "🔴", bg: "bg-red-50", border: "border-red-200/50", text: "text-red-600" },
};

const healthIcons: Record<string, { icon: string; color: string; label: string }> = {
  healthy: { icon: "🟢", color: "text-[#2E7268]", label: "Saudavel" },
  treatment: { icon: "🔵", color: "text-blue-600", label: "Em tratamento" },
  sick: { icon: "🔴", color: "text-red-500", label: "Doente" },
};

export default function WeeklySummaryClient({
  weekMood,
  weekDays,
  custodyByDay,
  eventsByDay,
  checkinsByDay,
  healthAlertDays,
  kpis,
  pendingActions,
  childSummaries,
  nextSwaps,
  custodyEnabled,
  insight,
}: Props) {
  const mood = moodConfig[weekMood];
  const healthSet = new Set(healthAlertDays);

  return (
    <div className="space-y-4 pb-20">
      {/* === HEADER === */}
      <div className={`${mood.bg} border ${mood.border} rounded-2xl p-5`}>
        <div className="flex items-center gap-3 mb-4">
          <span className="text-2xl">{mood.emoji}</span>
          <div>
            <h1 className={`text-lg font-bold ${mood.text}`}>{mood.label}</h1>
            <p className="text-xs text-[#9A8878]">Sua semana em um olhar</p>
          </div>
        </div>

        {/* KPI Chips */}
        <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-hide">
          <Chip icon="📅" value={kpis.totalEvents} label="eventos" />
          {kpis.medsCount > 0 && <Chip icon="💊" value={kpis.medsCount} label="medicamentos" />}
          {kpis.pendingCount > 0 && <Chip icon="⚠️" value={kpis.pendingCount} label="pendencias" accent />}
          <Chip icon="💬" value={kpis.messagesCount} label="mensagens" />
        </div>
      </div>

      {/* === WEEK STRIP === */}
      <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100/80">
        <div className="flex justify-between">
          {weekDays.map((day) => {
            const custody = custodyByDay[day.dateKey];
            const events = eventsByDay[day.dateKey] || 0;
            const hasCheckin = checkinsByDay[day.dateKey];
            const hasHealth = healthSet.has(day.dateKey);

            return (
              <div
                key={day.dateKey}
                className={`flex flex-col items-center gap-1 py-2 px-1.5 rounded-xl transition-all min-w-[38px] ${
                  day.isToday
                    ? "bg-[#C07055] text-white shadow-sm shadow-[#C07055]/20"
                    : day.isPast
                      ? "opacity-40"
                      : ""
                }`}
              >
                <span className={`text-[9px] font-semibold uppercase ${day.isToday ? "text-white/70" : "text-[#9A8878]"}`}>
                  {day.label}
                </span>
                <span className={`text-sm font-bold ${day.isToday ? "text-white" : "text-[#2C2C2C]"}`}>
                  {day.dayNum}
                </span>

                {/* Indicators row */}
                <div className="flex items-center gap-0.5 h-3">
                  {/* Custody dot */}
                  {custody && (
                    <span
                      className="w-2 h-2 rounded-full"
                      style={{ backgroundColor: custody.color }}
                    />
                  )}
                  {/* Events dots */}
                  {events > 0 && (
                    <span className={`w-1.5 h-1.5 rounded-full ${day.isToday ? "bg-white/60" : "bg-[#C07055]/40"}`} />
                  )}
                  {events > 2 && (
                    <span className={`w-1.5 h-1.5 rounded-full ${day.isToday ? "bg-white/40" : "bg-[#C07055]/25"}`} />
                  )}
                  {/* Health alert */}
                  {hasHealth && !day.isToday && (
                    <span className="text-[8px]">⚠️</span>
                  )}
                  {/* Check-in */}
                  {hasCheckin && !day.isToday && (
                    <span className="text-[8px]">✅</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* === PENDING ACTIONS === */}
      {pendingActions.length > 0 && (
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100/80">
          <p className="text-[10px] font-bold text-[#D4735A] uppercase tracking-wider mb-3">
            Acao necessaria
          </p>
          <div className="space-y-2">
            {pendingActions.map((action, i) => (
              <Link
                key={i}
                href={action.href}
                className="flex items-center gap-3 p-3 rounded-xl bg-[#D4735A]/[0.04] border border-[#D4735A]/10 hover:bg-[#D4735A]/[0.08] transition-colors active:scale-[0.98]"
              >
                <span className="text-lg">{action.icon}</span>
                <span className="flex-1 text-[13px] font-medium text-[#2C2C2C]">{action.label}</span>
                <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-[#D4735A]/10 text-[#D4735A] uppercase">
                  {action.type === "health" ? "saude" : "rotina"}
                </span>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* === CHILD SUMMARIES === */}
      {childSummaries.length > 0 && (
        <div className="space-y-2">
          {childSummaries.map((child) => {
            const health = healthIcons[child.healthStatus] || healthIcons.healthy;
            return (
              <div key={child.id} className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100/80">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-full bg-[#C07055]/10 flex items-center justify-center text-sm font-bold text-[#C07055]">
                      {child.name[0]}
                    </div>
                    <div>
                      <p className="text-[14px] font-semibold text-[#2C2C2C]">{child.name}</p>
                      <div className="flex items-center gap-1">
                        <span className="text-xs">{health.icon}</span>
                        <span className={`text-[10px] font-medium ${health.color}`}>{health.label}</span>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="flex gap-2">
                  <MiniStat icon="📅" value={child.activitiesCount} label="atividades" />
                  <MiniStat icon="🩺" value={child.appointmentsCount} label="consultas" />
                  <MiniStat icon="✅" value={child.checkinsCount} label="check-ins" />
                  {child.medsCount > 0 && <MiniStat icon="💊" value={child.medsCount} label="med." />}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* === CUSTODY / SWAPS === */}
      {custodyEnabled && nextSwaps.length > 0 && (
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100/80">
          <p className="text-[10px] font-bold text-[#9A8878] uppercase tracking-wider mb-3">
            Trocas de guarda
          </p>
          <div className="space-y-2">
            {nextSwaps.map((swap) => (
              <Link
                key={swap.id}
                href="/calendario"
                className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-gray-50 transition-colors"
              >
                <div className="w-8 h-8 bg-amber-100/60 rounded-lg flex items-center justify-center">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#D97706" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="17 1 21 5 17 9" /><path d="M3 11V9a4 4 0 014-4h14" /><polyline points="7 23 3 19 7 15" /><path d="M21 13v2a4 4 0 01-4 4H3" />
                  </svg>
                </div>
                <div className="flex-1">
                  <p className="text-[13px] font-medium text-[#2C2C2C]">
                    {swap.isIncoming ? "Solicitacao recebida" : "Solicitacao enviada"}
                  </p>
                  <p className="text-[10px] text-[#9A8878]">
                    {new Date(swap.date + "T12:00:00").toLocaleDateString("pt-BR", { day: "numeric", month: "short" })}
                  </p>
                </div>
                <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">
                  pendente
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* === COMMUNICATION === */}
      {kpis.messagesCount > 0 && (
        <Link href="/chat" className="block">
          <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100/80 flex items-center gap-3 hover:bg-gray-50/50 transition-colors active:scale-[0.99]">
            <div className="w-10 h-10 bg-purple-100/60 rounded-xl flex items-center justify-center">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#8B5CF6" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
              </svg>
            </div>
            <div className="flex-1">
              <p className="text-[13px] font-semibold text-[#2C2C2C]">{kpis.messagesCount} mensagens esta semana</p>
            </div>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </div>
        </Link>
      )}

      {/* === INSIGHT === */}
      <div className="bg-gradient-to-br from-[#2C2C2C] to-[#1a1a1a] rounded-2xl p-5 text-white">
        <div className="flex items-start gap-3">
          <span className="text-xl mt-0.5">🧠</span>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-white/40 mb-1">Insight da semana</p>
            <p className="text-[14px] font-medium leading-relaxed text-white/90">{insight}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---- Sub-components ---- */

function Chip({ icon, value, label, accent }: { icon: string; value: number; label: string; accent?: boolean }) {
  return (
    <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full whitespace-nowrap text-[12px] font-medium ${
      accent ? "bg-[#D4735A]/10 text-[#D4735A]" : "bg-white/80 text-[#2C2C2C]"
    }`}>
      <span className="text-sm">{icon}</span>
      <span className="font-bold">{value}</span>
      <span className="text-[#9A8878]">{label}</span>
    </div>
  );
}

function MiniStat({ icon, value, label }: { icon: string; value: number; label: string }) {
  return (
    <div className="flex-1 bg-gray-50/80 rounded-xl py-2 px-2.5 text-center">
      <span className="text-sm">{icon}</span>
      <p className="text-[15px] font-bold text-[#2C2C2C]">{value}</p>
      <p className="text-[9px] text-[#9A8878] font-medium">{label}</p>
    </div>
  );
}
