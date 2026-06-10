"use client";

/**
 * Playground do HERÓI (validação criteriosa, dono 10/jun): renderiza o
 * RoutineTodayCard REAL (mesmo componente do painel) numa matriz de cenários
 * sintéticos — dia rico, cluster, split, nomes longos, horários extremos,
 * madrugada/noite, troca pendente, dia calmo, empty state — cada um com o
 * relógio CONGELADO (simulateNowMin) pra avaliar os estados temporais.
 * Rota /prototipo: sem auth/Supabase (middleware pula), só dados fictícios.
 */

import { I18nProvider } from "@/i18n/provider";
import RoutineTodayCard from "@/app/(app)/dashboard/RoutineTodayCard";
import { buildChildJourney, type JourneyItem } from "@/lib/care-routine-journey";
import type { RoutineToday, RoutineHeroEntry, RoutineHeroLeg } from "@/lib/care-routine-resolve";

const mkLeg = (name: string, time: string | null): RoutineHeroLeg => ({
  responsibleId: name.toLowerCase(),
  responsibleName: name,
  isMe: name === "Henrique",
  time,
  label: null,
});

const mkEntry = (kids: string[], dropoff: RoutineHeroLeg | null, pickup: RoutineHeroLeg | null): RoutineHeroEntry => ({
  childIds: kids.map((k) => k.toLowerCase()),
  childNames: kids,
  dropoff,
  pickup,
  sameAllDay: !!(dropoff && pickup && dropoff.responsibleId === pickup.responsibleId),
});

interface ProtoActivity {
  name: string;
  time: string;
  category: string;
  responsible?: string | null;
  location?: string | null;
}

/** Replica a composição do page.tsx: buildChildJourney + pernas das demais entries. */
function composeTimeline(routine: RoutineToday, activities: ProtoActivity[], homeName: string | null): JourneyItem[] {
  const e0: RoutineHeroEntry | null = routine.entries[0] ?? null;
  // Espelha o page.tsx: split (2+ entries) → casas sem nome (ambíguas).
  const home = routine.entries.length > 1 ? null : e0?.sameAllDay && e0.dropoff ? e0.dropoff.responsibleName : homeName;
  const items: JourneyItem[] = e0
    ? buildChildJourney({
        dropoff: e0.dropoff ? { name: e0.dropoff.responsibleName, time: e0.dropoff.time } : null,
        pickup: e0.pickup ? { name: e0.pickup.responsibleName, time: e0.pickup.time } : null,
        activities: activities.map((a) => ({
          name: a.name,
          time: a.time,
          category: a.category,
          responsible: a.responsible ?? null,
          activityId: null,
          eventId: null,
          location: a.location ?? null,
        })),
        homeMorning: home,
        homeEvening: home,
      })
    : [];
  for (let i = 1; i < routine.entries.length; i++) {
    const e = routine.entries[i];
    ([["dropoff", e.dropoff], ["pickup", e.pickup]] as const).forEach(([legKind, leg]) => {
      if (!leg?.time) return;
      const [h, m] = leg.time.split(":").map(Number);
      if (Number.isNaN(h)) return;
      items.push({
        key: `leg${i}-${legKind}`,
        sortMin: h * 60 + (m || 0),
        icon: legKind === "dropoff" ? "🚗" : "🏠",
        text: leg.responsibleName,
        time: leg.time.slice(0, 5),
        kind: legKind,
        responsible: null,
        activityId: null,
        eventId: null,
        location: null,
      });
    });
  }
  items.sort((a, b) => a.sortMin - b.sortMin);
  return items;
}

const RICH_ROUTINE: RoutineToday = {
  mode: "together",
  entries: [mkEntry(["Otto", "Martim"], mkLeg("Fernanda", "07:30:00"), mkLeg("Henrique", "17:30:00"))],
};
const RICH_ACTS: ProtoActivity[] = [
  { name: "Escola", time: "08:00:00", category: "school", location: "Colégio CVS" },
  { name: "Reunião de pais", time: "16:30:00", category: "evento", responsible: "Henrique", location: "Sala 303" },
  { name: "Teatro", time: "18:00:00", category: "art", responsible: "Fernanda", location: "Colégio CVS" },
  { name: "Futsal", time: "18:00:00", category: "sport" },
];

const CG_FH = [
  { id: "fernanda", name: "Fernanda" },
  { id: "henrique", name: "Henrique" },
];
const CG_AH = [
  { id: "angelino", name: "Angelino" },
  { id: "henrique", name: "Henrique" },
];

interface Scenario {
  id: string;
  title: string;
  desc: string;
  nowMin: number;
  routine: RoutineToday;
  acts: ProtoActivity[];
  homeName?: string | null;
  caregivers?: { id: string; name: string }[];
  dayCalm?: boolean;
  pendingAck?: { fromName: string; overrideIds: string[] } | null;
  awaitingTheirAck?: boolean;
  logsToday?: Record<string, "done" | "missed">;
  tomorrowSummary?: string | null;
  hasRoutineSlots?: boolean;
}

const SCENARIOS: Scenario[] = [
  { id: "s1", title: "S1 · Dia rico — manhã (09:00)", desc: "Leva/busca com hora + 4 atividades (cluster ② às 18h). Sol no início, tudo à frente.", nowMin: 9 * 60, routine: RICH_ROUTINE, acts: RICH_ACTS, tomorrowSummary: "Fernanda leva · Henrique busca" },
  { id: "s2", title: "S2 · Dia rico — tarde (16:45)", desc: "Reunião acabou de passar (apagada); Próximo momento = Teatro 18h.", nowMin: 16 * 60 + 45, routine: RICH_ROUTINE, acts: RICH_ACTS, tomorrowSummary: "Fernanda leva · Henrique busca" },
  { id: "s3", title: "S3 · Dia rico — noite (21:30)", desc: "Tudo percorrido/apagado; sol clampado no fim; sem Próximo momento.", nowMin: 21 * 60 + 30, routine: RICH_ROUTINE, acts: RICH_ACTS },
  { id: "s4", title: "S4 · Madrugada (05:00)", desc: "Antes da janela 06h: sol clampado no início, nada percorrido.", nowMin: 5 * 60, routine: RICH_ROUTINE, acts: RICH_ACTS },
  { id: "s5", title: "S5 · Dia todo, sem horários + calmo (14:00)", desc: "sameAllDay sem horas e sem atividades: arco só com casas + sol; voz Dia tranquilo.", nowMin: 14 * 60, routine: { mode: "together", entries: [mkEntry(["Otto", "Martim"], mkLeg("Fernanda", null), mkLeg("Fernanda", null))] }, acts: [], dayCalm: true },
  { id: "s6", title: "S6 · Split 2 filhos com pernas (10:00)", desc: "Eduarda dia todo com Angelino; Joao leva 07:00/busca 18:30 → pernas do 2º filho viram estações.", nowMin: 10 * 60, routine: { mode: "split", entries: [mkEntry(["Eduarda"], mkLeg("Angelino", null), mkLeg("Angelino", null)), mkEntry(["Joao"], mkLeg("Angelino", "07:00:00"), mkLeg("Henrique", "18:30:00"))] }, acts: [{ name: "Natação", time: "16:00:00", category: "sport", location: "Academia Aquafit" }], caregivers: CG_AH },
  { id: "s7", title: "S7 · Nomes longos (13:00)", desc: "Truncamento dos dizeres + zigzag com estações próximas (10:00 / 10:45 / 11:15).", nowMin: 13 * 60, routine: RICH_ROUTINE, acts: [
    { name: "Reunião de pais e mestres do terceiro bimestre", time: "10:00:00", category: "evento", responsible: "Maria Auxiliadora", location: "Auditório principal do bloco B" },
    { name: "Apresentação de balé — encerramento", time: "10:45:00", category: "art" },
    { name: "Consulta com a fonoaudióloga", time: "11:15:00", category: "health", responsible: "Henrique" },
  ] },
  { id: "s8", title: "S8 · Dia lotado — 8 horários (12:30)", desc: "Estresse de colisão/zigzag com estações espalhadas o dia inteiro.", nowMin: 12 * 60 + 30, routine: RICH_ROUTINE, acts: [
    { name: "Café", time: "07:00:00", category: "other" },
    { name: "Escola", time: "08:30:00", category: "school" },
    { name: "Inglês", time: "09:15:00", category: "course" },
    { name: "Dentista", time: "10:00:00", category: "health", responsible: "Fernanda" },
    { name: "Almoço", time: "12:00:00", category: "other" },
    { name: "Música", time: "14:30:00", category: "music" },
    { name: "Terapia", time: "16:30:00", category: "therapy" },
    { name: "Festa", time: "19:30:00", category: "evento" },
  ] },
  { id: "s9", title: "S9 · Horários extremos (12:00)", desc: "05:30 e 21:45 (fora da janela 06–21) clampam nas pontas — avaliar sobreposição com as casas.", nowMin: 12 * 60, routine: RICH_ROUTINE, acts: [
    { name: "Madrugador", time: "05:30:00", category: "other" },
    { name: "Café", time: "06:00:00", category: "other" },
    { name: "Cinema", time: "21:00:00", category: "evento" },
    { name: "Festa tarde", time: "21:45:00", category: "evento" },
  ] },
  { id: "s10", title: "S10 · Troca recebida (15:00)", desc: "Banner âmbar: Fernanda trocou hoje e aguarda sua ciência (botão Confirmar).", nowMin: 15 * 60, routine: RICH_ROUTINE, acts: RICH_ACTS, pendingAck: { fromName: "Fernanda", overrideIds: [] } },
  { id: "s11", title: "S11 · Troca enviada (15:00)", desc: "Rodapé: ⚠ esperando o outro responsável ver.", nowMin: 15 * 60, routine: RICH_ROUTINE, acts: RICH_ACTS, awaitingTheirAck: true },
  { id: "s12", title: "S12 · Buscou? pendente (18:30)", desc: "Busca 17:30 já passou sem registro → Sim/Não visíveis.", nowMin: 18 * 60 + 30, routine: RICH_ROUTINE, acts: RICH_ACTS },
  { id: "s13", title: "S13 · Buscou? registrado (18:30)", desc: "Logs done pros dois filhos → ✓ feito.", nowMin: 18 * 60 + 30, routine: RICH_ROUTINE, acts: RICH_ACTS, logsToday: { "otto:pickup": "done", "martim:pickup": "done" } },
  { id: "s14", title: "S14 · Sem rotina (empty state)", desc: "Sem slots: card de ativação com CTA pro editor.", nowMin: 12 * 60, routine: { mode: "none", entries: [] }, acts: [], hasRoutineSlots: false },
];

export default function HeroiPlaygroundPage() {
  const todayDate = new Date().toISOString().slice(0, 10);
  return (
    <I18nProvider initialLocale="pt">
      <div className="min-h-screen bg-[#F2EDE6] px-6 py-8">
        <header className="max-w-6xl mx-auto mb-6">
          <h1 className="font-display text-[28px] font-semibold text-[#2A2622]">Playground do Herói — matriz de cenários</h1>
          <p className="text-[13px] text-[#9A8878] mt-1">
            Componente REAL do painel com dados fictícios e relógio congelado por cenário. Rota de protótipo (sem dados reais).
          </p>
        </header>
        <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-6">
          {SCENARIOS.map((s) => (
            <section key={s.id}>
              <h2 className="text-[13px] font-semibold text-[#2A2622] mb-0.5">{s.title}</h2>
              <p className="text-[11.5px] text-[#9A8878] mb-2">{s.desc}</p>
              <RoutineTodayCard
                routineToday={s.routine}
                arrangement="together"
                hasRoutineSlots={s.hasRoutineSlots ?? s.routine.mode !== "none"}
                groupId="proto-playground"
                todayDate={todayDate}
                caregivers={s.caregivers ?? CG_FH}
                awaitingTheirAck={s.awaitingTheirAck ?? false}
                pendingAck={s.pendingAck ?? null}
                logsToday={s.logsToday ?? {}}
                tomorrowSummary={s.tomorrowSummary ?? null}
                dayCalm={s.dayCalm ?? false}
                heroTimeline={composeTimeline(s.routine, s.acts, "Fernanda")}
                simulateNowMin={s.nowMin}
              />
            </section>
          ))}
        </div>
      </div>
    </I18nProvider>
  );
}
