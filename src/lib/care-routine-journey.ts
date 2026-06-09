/**
 * "Jornada da Criança" (Fase 2) — composição PURA, read-only, do dia de uma
 * criança: casa (guarda) + leva/busca (rotina) + atividades (calendar_occurrences)
 * numa timeline cronológica. SEM storage novo — só mescla + ordena por horário.
 *
 * Ex.: 🏠 Casa Fernanda → 🚗 Fernanda leva 8h → 🥋 Jiu-Jitsu 18h → 🏠 Henrique
 * busca 19h → 🏠 Casa Henrique.
 */

export interface JourneyActivity {
  name: string;
  time: string | null; // "HH:MM[:SS]"
  category: string;
}

export type JourneyKind = "home" | "dropoff" | "activity" | "pickup";

export interface JourneyItem {
  key: string;
  /** minuto do dia pra ordenação (âncoras de casa: -1 manhã / 1441 noite). */
  sortMin: number;
  icon: string;
  /** Texto principal (nome do responsável / nome da atividade). */
  text: string;
  /** "HH:MM" pra exibição (null nas âncoras de casa). */
  time: string | null;
  kind: JourneyKind;
}

const ACTIVITY_ICON: Record<string, string> = {
  sport: "⚽",
  health: "🏥",
  school: "🎒",
  art: "🎨",
  music: "🎵",
  therapy: "🧠",
  course: "📚",
  evento: "🎉",
  guarda: "🔄",
  other: "📋",
};

function toMin(t: string | null): number | null {
  if (!t) return null;
  const [h, m] = t.split(":").map(Number);
  if (Number.isNaN(h)) return null;
  return h * 60 + (m || 0);
}

export interface BuildJourneyInput {
  dropoff: { name: string; time: string | null } | null;
  pickup: { name: string; time: string | null } | null;
  activities: readonly JourneyActivity[];
  /** Responsável da guarda no início do dia (manhã). null p/ família intacta. */
  homeMorning?: string | null;
  /** Responsável ao fim do dia (quem buscou / guarda da noite). */
  homeEvening?: string | null;
}

/**
 * Monta a timeline ordenada do dia. Itens sem horário (atividades sem hora)
 * são omitidos da linha cronológica (não dá pra posicionar). Âncoras de casa
 * abrem/fecham o dia.
 */
export function buildChildJourney(input: BuildJourneyInput): JourneyItem[] {
  const items: JourneyItem[] = [];

  if (input.homeMorning) {
    items.push({ key: "home-am", sortMin: -1, icon: "🏠", text: input.homeMorning, time: null, kind: "home" });
  }
  if (input.dropoff) {
    const min = toMin(input.dropoff.time);
    if (min != null) {
      items.push({ key: "dropoff", sortMin: min, icon: "🚗", text: input.dropoff.name, time: input.dropoff.time!.slice(0, 5), kind: "dropoff" });
    }
  }
  input.activities.forEach((a, i) => {
    const min = toMin(a.time);
    if (min != null) {
      items.push({ key: `act-${i}`, sortMin: min, icon: ACTIVITY_ICON[a.category] ?? "📋", text: a.name, time: a.time!.slice(0, 5), kind: "activity" });
    }
  });
  if (input.pickup) {
    const min = toMin(input.pickup.time);
    if (min != null) {
      items.push({ key: "pickup", sortMin: min, icon: "🏠", text: input.pickup.name, time: input.pickup.time!.slice(0, 5), kind: "pickup" });
    }
  }
  if (input.homeEvening) {
    items.push({ key: "home-pm", sortMin: 24 * 60 + 1, icon: "🏠", text: input.homeEvening, time: null, kind: "home" });
  }

  // Ordenação estável por minuto; empates mantêm a ordem de inserção
  // (dropoff antes de atividade no mesmo minuto, etc.).
  return items
    .map((it, idx) => ({ it, idx }))
    .sort((a, b) => a.it.sortMin - b.it.sortMin || a.idx - b.idx)
    .map(({ it }) => it);
}
