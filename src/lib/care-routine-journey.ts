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
  /** Nome do responsável pela atividade (child_activities.responsible_id). */
  responsible?: string | null;
  /** Id da child_activity (null pra events — eles não têm detalhe próprio). */
  activityId?: string | null;
  /** Id da row de events (deep-link `/calendario?day=…&eventId=…`). */
  eventId?: string | null;
  /** Local da atividade/evento (subtítulo do "Próximo momento" no herói). */
  location?: string | null;
  /** Criança dona do item (null = família toda). Irmãos com atividade
   *  homônima no mesmo horário NÃO são a mesma coisa (auditoria #14). */
  childId?: string | null;
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
  /** Responsável (só em atividades; âncoras/pernas já são pessoas no text). */
  responsible?: string | null;
  /** Id da child_activity (deep link pro detalhe; null em events/âncoras). */
  activityId?: string | null;
  /** Id da row de events (deep-link pro evento específico no calendário). */
  eventId?: string | null;
  /** Local (só em atividades/eventos; null nas âncoras). */
  location?: string | null;
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

const NAME_STOPWORDS = new Set([
  "de", "da", "do", "das", "dos", "com", "para", "pra", "e", "o", "a", "os", "as", "em", "no", "na", "nos", "nas",
]);

/** Tokens significativos do nome (sem acento/caixa/números puros/stopwords). */
function nameTokens(name: string): Set<string> {
  return new Set(
    name
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .split(/[^a-z0-9]+/)
      .filter((t) => t.length >= 3 && !NAME_STOPWORDS.has(t) && !/^\d+$/.test(t)),
  );
}

/**
 * Dedup de atividades lançadas 2× por caminhos diferentes (ex.: calendário E
 * registro escolar — "Reunião escolar: Reunião com pais" + "Reunião pais 303"
 * às 16:30): MESMO horário + ao menos um token de nome em comum ⇒ mesmo
 * evento, mantém só o de título mais curto (mais limpo). "Teatro" × "Futsal"
 * às 18:00 NÃO dedupa (nenhum token em comum). Sem horário não dedupa.
 * Feedback do dono 10/jun: dois caminhos, mesmo destino — não confundir.
 */
export function dedupeJourneyActivities(activities: readonly JourneyActivity[]): JourneyActivity[] {
  const kept: { a: JourneyActivity; tokens: Set<string>; min: number | null; inheritedResp?: string | null; inheritedId?: string | null; inheritedEventId?: string | null; inheritedLocation?: string | null }[] = [];
  const byShortest = [...activities].sort((x, y) => x.name.length - y.name.length);
  for (const a of byShortest) {
    const min = toMin(a.time);
    const tokens = nameTokens(a.name);
    const dup =
      min != null
        ? kept.find(
            (k) =>
              k.min === min &&
              // Irmãos: childIds DIFERENTES e ambos definidos ⇒ itens distintos.
              (k.a.childId == null || a.childId == null || k.a.childId === a.childId) &&
              [...tokens].some((t) => k.tokens.has(t)),
          )
        : undefined;
    if (dup) {
      // O absorvido pode carregar informação que o mantido não tem (ex.:
      // event engole atividade que tinha responsável/detalhe) — herda.
      if (!dup.a.responsible && a.responsible) dup.inheritedResp = a.responsible;
      if (!dup.a.activityId && a.activityId) dup.inheritedId = a.activityId;
      if (!dup.a.eventId && a.eventId) dup.inheritedEventId = a.eventId;
      if (!dup.a.location && a.location) dup.inheritedLocation = a.location;
      continue;
    }
    kept.push({ a, tokens, min });
  }
  // Preserva a ordem original de entrada entre os mantidos.
  return activities.flatMap((a) => {
    const k = kept.find((x) => x.a === a);
    if (!k) return [];
    if (!k.inheritedResp && !k.inheritedId && !k.inheritedEventId && !k.inheritedLocation) return [a];
    return [
      {
        ...a,
        responsible: a.responsible ?? k.inheritedResp ?? null,
        activityId: a.activityId ?? k.inheritedId ?? null,
        eventId: a.eventId ?? k.inheritedEventId ?? null,
        location: a.location ?? k.inheritedLocation ?? null,
      },
    ];
  });
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
  dedupeJourneyActivities(input.activities).forEach((a, i) => {
    const min = toMin(a.time);
    if (min != null) {
      items.push({ key: `act-${i}`, sortMin: min, icon: ACTIVITY_ICON[a.category] ?? "📋", text: a.name, time: a.time!.slice(0, 5), kind: "activity", responsible: a.responsible ?? null, activityId: a.activityId ?? null, eventId: a.eventId ?? null, location: a.location ?? null });
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
