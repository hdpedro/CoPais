"use client";

import Link from "next/link";
import type { ParentColorMap } from "@/lib/calendar-utils";

/* ─── Types ─── */
interface WeekDay { dateKey: string; dayNum: number; label: string; isToday: boolean; isPast: boolean }
interface PendingAction { type: string; label: string; href: string; icon: string; urgency: "high" | "medium" | "low" }
interface ChildSummary { id: string; name: string; healthStatus: string; appointmentsCount: number; activitiesCount: number; checkinsCount: number; medsCount: number; nextActivity: string | null; illnessName: string | null; hasActivity: boolean }
interface SwapInfo { id: string; date: string; type: string; isIncoming: boolean }
interface KPIs { totalEvents: number; totalCheckins: number; medsCount: number; pendingCount: number; messagesCount: number; appointmentsCount: number; activeDays: number }

interface Props {
  weekMood: "calm" | "busy" | "alert";
  headerText: string;
  weekDays: WeekDay[];
  custodyByDay: Record<string, { responsibleId: string; color: string }>;
  eventsByDay: Record<string, number>;
  checkinsByDay: Record<string, boolean>;
  healthAlertDays: string[];
  kpis: KPIs;
  pendingActions: PendingAction[];
  childSummaries: ChildSummary[];
  nextSwaps: SwapInfo[];
  custodyEnabled: boolean;
  insight: string;
  parentColors: ParentColorMap;
}

const moodConfig = {
  calm:  { emoji: "🟢", bg: "bg-gradient-to-br from-[#2E7268]/8 to-[#2E7268]/3", border: "border-[#2E7268]/12", text: "text-[#2E7268]", glow: "shadow-[#2E7268]/5" },
  busy:  { emoji: "🟡", bg: "bg-gradient-to-br from-amber-50 to-amber-50/30", border: "border-amber-200/40", text: "text-amber-700", glow: "shadow-amber-100/50" },
  alert: { emoji: "🔴", bg: "bg-gradient-to-br from-red-50 to-red-50/30", border: "border-red-200/40", text: "text-red-600", glow: "shadow-red-100/50" },
};

const healthConfig: Record<string, { dot: string; bg: string; label: string }> = {
  healthy:   { dot: "bg-[#2E7268]", bg: "bg-[#2E7268]/8", label: "Saudável" },
  treatment: { dot: "bg-blue-500", bg: "bg-blue-50", label: "Em tratamento" },
  sick:      { dot: "bg-red-500", bg: "bg-red-50", label: "Doente" },
};

export default function WeeklySummaryClient({
  weekMood, headerText, weekDays, custodyByDay, eventsByDay, checkinsByDay,
  healthAlertDays, kpis, pendingActions, childSummaries, nextSwaps,
  custodyEnabled, insight,
}: Props) {
  const mood = moodConfig[weekMood];
  const healthSet = new Set(healthAlertDays);

  return (
    <div className="space-y-3 pb-20">

      {/* ═══ HEADER ═══ */}
      <div className={`${mood.bg} border ${mood.border} rounded-2xl p-5 shadow-sm ${mood.glow}`}>
        <div className="flex items-start gap-3 mb-4">
          <span className="text-xl mt-0.5">{mood.emoji}</span>
          <div className="flex-1 min-w-0">
            <p className={`text-[15px] font-bold ${mood.text} leading-snug`}>{headerText}</p>
            <p className="text-[11px] text-[#9A8878] mt-0.5">Sua semana em um olhar</p>
          </div>
        </div>

        {/* KPI Chips */}
        <div className="flex gap-1.5 overflow-x-auto pb-0.5 -mx-1 px-1 scrollbar-hide">
          <Chip icon="📅" value={kpis.totalEvents} label="eventos" empty={kpis.totalEvents === 0} />
          <Chip icon="✅" value={kpis.totalCheckins} label="check-ins" empty={kpis.totalCheckins === 0} />
          {kpis.medsCount > 0 && <Chip icon="💊" value={kpis.medsCount} label="med." accent />}
          {kpis.appointmentsCount > 0 && <Chip icon="🩺" value={kpis.appointmentsCount} label="consultas" />}
          {kpis.pendingCount > 0 && <Chip icon="⚠️" value={kpis.pendingCount} label="pendências" accent />}
          <Chip icon="💬" value={kpis.messagesCount} label="msgs" empty={kpis.messagesCount === 0} />
        </div>
      </div>

      {/* ═══ WEEK STRIP ═══ */}
      <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100/80">
        <div className="flex justify-between gap-0.5">
          {weekDays.map((day) => {
            const custody = custodyByDay[day.dateKey];
            const events = eventsByDay[day.dateKey] || 0;
            const hasCheckin = checkinsByDay[day.dateKey];
            const hasHealth = healthSet.has(day.dateKey);
            const isEmpty = events === 0 && !hasCheckin && !custody;

            return (
              <Link
                key={day.dateKey}
                href="/calendario"
                prefetch={false}
                className={`flex flex-col items-center gap-1 py-2.5 px-1 rounded-xl transition-all min-w-[40px] flex-1 active:scale-95 ${
                  day.isToday
                    ? "bg-[#C07055] text-white shadow-md shadow-[#C07055]/25 scale-[1.05]"
                    : day.isPast
                      ? "opacity-35 hover:opacity-60"
                      : isEmpty
                        ? "hover:bg-gray-50"
                        : "bg-gray-50/50 hover:bg-gray-100/60"
                }`}
              >
                <span className={`text-[9px] font-bold uppercase ${day.isToday ? "text-white/70" : "text-[#9A8878]"}`}>
                  {day.label}
                </span>
                <span className={`text-[15px] font-bold leading-none ${day.isToday ? "text-white" : "text-[#2C2C2C]"}`}>
                  {day.dayNum}
                </span>

                {/* Indicators */}
                <div className="flex flex-col items-center gap-0.5 min-h-[14px]">
                  {/* Custody bar */}
                  {custody && (
                    <span className="w-4 h-1 rounded-full" style={{ backgroundColor: custody.color }} />
                  )}
                  {/* Activity dots */}
                  <div className="flex items-center gap-[2px]">
                    {events > 0 && <span className={`w-[5px] h-[5px] rounded-full ${day.isToday ? "bg-white/70" : "bg-[#C07055]"}`} />}
                    {events > 1 && <span className={`w-[5px] h-[5px] rounded-full ${day.isToday ? "bg-white/50" : "bg-[#C07055]/60"}`} />}
                    {events > 3 && <span className={`w-[5px] h-[5px] rounded-full ${day.isToday ? "bg-white/30" : "bg-[#C07055]/35"}`} />}
                    {hasHealth && <span className={`w-[5px] h-[5px] rounded-full ${day.isToday ? "bg-yellow-200" : "bg-red-400"}`} />}
                    {hasCheckin && !day.isToday && <span className="w-[5px] h-[5px] rounded-full bg-[#2E7268]" />}
                  </div>
                </div>
              </Link>
            );
          })}
        </div>

        {/* Active days indicator */}
        <div className="flex items-center justify-center gap-2 mt-3 pt-2.5 border-t border-gray-100">
          <div className="flex gap-[3px]">
            {weekDays.map(d => {
              const has = (eventsByDay[d.dateKey] || 0) > 0 || checkinsByDay[d.dateKey];
              return <span key={d.dateKey} className={`w-[6px] h-[6px] rounded-full ${has ? "bg-[#2E7268]" : "bg-gray-200"}`} />;
            })}
          </div>
          <span className="text-[10px] text-[#9A8878] font-medium">{kpis.activeDays}/7 dias ativos</span>
        </div>
      </div>

      {/* ═══ PENDING ACTIONS ═══ */}
      {pendingActions.length > 0 && (
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100/80">
          <p className="text-[10px] font-bold text-[#D4735A] uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-[#D4735A] animate-pulse" />
            Acao necessaria
          </p>
          <div className="space-y-1.5">
            {pendingActions.map((action, i) => (
              <Link
                key={i}
                href={action.href}
                className={`flex items-center gap-3 p-3 rounded-xl transition-all active:scale-[0.98] ${
                  i === 0 && action.urgency === "high"
                    ? "bg-[#D4735A]/[0.07] border border-[#D4735A]/15 hover:bg-[#D4735A]/[0.12] shadow-sm"
                    : "bg-gray-50/60 border border-gray-100/60 hover:bg-gray-100/60"
                }`}
              >
                <span className="text-lg">{action.icon}</span>
                <span className="flex-1 text-[13px] font-medium text-[#2C2C2C]">{action.label}</span>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  {i === 0 && action.urgency === "high" && (
                    <span className="text-[8px] font-bold px-1.5 py-0.5 rounded-full bg-[#D4735A] text-white uppercase">Hoje</span>
                  )}
                  <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full uppercase ${
                    action.type === "health" ? "bg-red-50 text-red-500" : action.type === "custody" ? "bg-amber-50 text-amber-600" : "bg-gray-100 text-gray-500"
                  }`}>
                    {action.type === "health" ? "saúde" : action.type === "custody" ? "guarda" : "rotina"}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* ═══ CHILD SUMMARIES ═══ */}
      {childSummaries.length > 0 && (
        <div className="space-y-2">
          {childSummaries.map((child) => {
            const health = healthConfig[child.healthStatus] || healthConfig.healthy;
            return (
              <div key={child.id} className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100/80 hover:shadow-md transition-shadow">
                <div className="flex items-center gap-3 mb-3">
                  <div className="relative">
                    <div className="w-10 h-10 rounded-full bg-[#C07055]/10 flex items-center justify-center text-[15px] font-bold text-[#C07055]">
                      {child.name[0]}
                    </div>
                    <span className={`absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 border-white ${health.dot}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[14px] font-semibold text-[#2C2C2C]">{child.name}</p>
                    <div className="flex items-center gap-1.5">
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${health.bg} ${
                        child.healthStatus === "sick" ? "text-red-600" : child.healthStatus === "treatment" ? "text-blue-600" : "text-[#2E7268]"
                      }`}>
                        {child.illnessName ? child.illnessName : health.label}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Stats row */}
                <div className="flex gap-1.5">
                  <MiniStat icon="📅" value={child.activitiesCount} label="atividades" empty={child.activitiesCount === 0} />
                  <MiniStat icon="🩺" value={child.appointmentsCount} label="consultas" empty={child.appointmentsCount === 0} />
                  <MiniStat icon="✅" value={child.checkinsCount} label="check-ins" empty={child.checkinsCount === 0} />
                  {child.medsCount > 0 && <MiniStat icon="💊" value={child.medsCount} label="med." accent />}
                </div>

                {/* Context line */}
                <div className="mt-2.5 pt-2 border-t border-gray-50">
                  <p className="text-[11px] text-[#9A8878]">
                    {child.healthStatus === "sick"
                      ? `Em acompanhamento — ${child.illnessName || "atenção à saúde"}`
                      : child.nextActivity
                        ? `Próxima atividade: ${child.nextActivity}`
                        : child.hasActivity
                          ? "Rotina registrada esta semana"
                          : "Semana tranquila — sem registros ainda"
                    }
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ═══ CUSTODY SWAPS ═══ */}
      {custodyEnabled && nextSwaps.length > 0 && (
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100/80">
          <p className="text-[10px] font-bold text-[#9A8878] uppercase tracking-wider mb-2.5">Trocas de guarda</p>
          <div className="space-y-1.5">
            {nextSwaps.map((swap) => (
              <Link key={swap.id} href="/calendario" className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-gray-50 transition-colors active:scale-[0.98]">
                <div className="w-8 h-8 bg-amber-100/60 rounded-lg flex items-center justify-center">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#D97706" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="17 1 21 5 17 9" /><path d="M3 11V9a4 4 0 014-4h14" /><polyline points="7 23 3 19 7 15" /><path d="M21 13v2a4 4 0 01-4 4H3" />
                  </svg>
                </div>
                <div className="flex-1">
                  <p className="text-[13px] font-medium text-[#2C2C2C]">
                    {swap.isIncoming ? "Solicitação recebida" : "Solicitação enviada"}
                  </p>
                  <p className="text-[10px] text-[#9A8878]">
                    {new Date(swap.date + "T12:00:00").toLocaleDateString("pt-BR", { day: "numeric", month: "short" })}
                  </p>
                </div>
                <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">pendente</span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* ═══ COMMUNICATION ═══ */}
      <Link href="/chat" className="block">
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100/80 flex items-center gap-3 hover:shadow-md transition-all active:scale-[0.99]">
          <div className="w-10 h-10 bg-purple-50 rounded-xl flex items-center justify-center">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#8B5CF6" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
            </svg>
          </div>
          <div className="flex-1">
            <p className="text-[13px] font-semibold text-[#2C2C2C]">
              {kpis.messagesCount > 0 ? `${kpis.messagesCount} mensagens esta semana` : "Nenhuma mensagem esta semana"}
            </p>
            <p className="text-[10px] text-[#9A8878]">
              {kpis.messagesCount > 0 ? "Comunicação ativa" : "Comece uma conversa"}
            </p>
          </div>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#D1D5DB" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </div>
      </Link>

      {/* ═══ INSIGHT ═══ */}
      <div className="bg-gradient-to-br from-[#1a1a1a] to-[#2C2C2C] rounded-2xl p-5 shadow-lg">
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center flex-shrink-0">
            <span className="text-base">🧠</span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[9px] font-bold uppercase tracking-[0.15em] text-white/30 mb-1.5">Insight da semana</p>
            <p className="text-[14px] font-medium leading-relaxed text-white/90">{insight}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Sub-components ─── */

function Chip({ icon, value, label, accent, empty }: { icon: string; value: number; label: string; accent?: boolean; empty?: boolean }) {
  return (
    <div className={`flex items-center gap-1 px-2.5 py-1.5 rounded-full whitespace-nowrap text-[11px] font-medium transition-colors ${
      accent
        ? "bg-[#D4735A]/10 text-[#D4735A]"
        : empty
          ? "bg-gray-100/60 text-[#9A8878]"
          : "bg-white/80 text-[#2C2C2C] shadow-sm shadow-black/[0.03]"
    }`}>
      <span className="text-xs">{icon}</span>
      <span className="font-bold">{empty ? "—" : value}</span>
      <span className={empty ? "text-[#B8B0A8]" : "text-[#9A8878]"}>{label}</span>
    </div>
  );
}

function MiniStat({ icon, value, label, empty, accent }: { icon: string; value: number; label: string; empty?: boolean; accent?: boolean }) {
  return (
    <div className={`flex-1 rounded-xl py-2 px-2 text-center transition-colors ${
      accent ? "bg-[#D4735A]/[0.06]" : empty ? "bg-gray-50/50" : "bg-gray-50/80"
    }`}>
      <span className="text-xs">{icon}</span>
      <p className={`text-[14px] font-bold ${empty ? "text-[#C4BEB6]" : accent ? "text-[#D4735A]" : "text-[#2C2C2C]"}`}>
        {empty ? "—" : value}
      </p>
      <p className="text-[9px] text-[#9A8878] font-medium">{label}</p>
    </div>
  );
}
