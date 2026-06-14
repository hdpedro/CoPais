/**
 * CÓPIA NATIVE de `src/lib/briefing.ts` do PWA — motor PURO (sem I/O) do
 * dashboard: `selectHeroKind` (qual herói lidera) + `composeAttention` (a régua
 * UNIFICADA "Sua Atenção"). Mantenha em sincronia com o PWA.
 *
 * Paridade PWA↔Native (Regra crítica do projeto): a lógica é a MESMA nas duas
 * plataformas; só a apresentação (DOM vs RN) diverge. O componente
 * `BriefingAttention.tsx` é "burro": só renderiza os itens que recebe; o motor
 * decide o quê e em que ordem; a UI compõe a copy via `t()`.
 *
 * Marca: NUNCA alarme. O tom mais forte é "attention" (âmbar), jamais vermelho.
 */

export type BriefingHeroKind = "custody" | "routine" | "setup";

export interface SelectHeroKindInput {
  arrangement: "rotating" | "together" | "single" | "custom";
  hasCustody: boolean;
  hasRoutineSlots: boolean;
}

/**
 * Seleciona qual herói lidera por forma de família — espelha o PWA:
 *   - rotating/custom: guarda quando há guarda hoje; senão rotina (se houver
 *     slots) ou setup.
 *   - together/single: a rotina de leva/busca é o herói (guarda perde sentido);
 *     cai pra guarda só se existir; senão setup.
 *
 * O "Dia em Família" (together/single sem rotina, com evento hoje) NÃO muda o
 * heroKind — no PWA ele renderiza pela seção careRoutine via `familyDayContext`,
 * não pela seleção de herói. O native replica o mesmo: heroKind decide o card,
 * o familyDayContext decide a voz/arco dentro dele.
 */
export function selectHeroKind(input: SelectHeroKindInput): BriefingHeroKind {
  const { arrangement, hasCustody, hasRoutineSlots } = input;
  if (arrangement === "rotating" || arrangement === "custom") {
    if (hasCustody) return "custody";
    return hasRoutineSlots ? "routine" : "setup";
  }
  // together / single — a rotina de leva/busca é o herói (guarda perde sentido)
  if (hasRoutineSlots) return "routine";
  if (hasCustody) return "custody";
  return "setup";
}

/* ------------------------------------------------------------------ */
/* "Sua Atenção" — régua UNIFICADA (espelho de composeAttention do PWA) */
/* ------------------------------------------------------------------ */

export type BriefingTone = "attention" | "calm";

export type AttentionKind =
  | "swap"
  | "routine_ack"
  | "pending_report"
  | "pending_expense"
  | "pending_decision"
  | "saude_unread"
  | "school_unread"
  | "expenses_unread"
  | "vaccine";

export type AttentionItem = {
  /** Estável por kind (agregamos por tipo) — bom pra key de render. */
  id: string;
  kind: AttentionKind;
  /** Menor = mais alto na régua. */
  priority: number;
  tone: BriefingTone;
  /** Quantos (1 pra itens únicos; N pra agregados). */
  count: number;
  /** Rota nativa pra onde o toque leva. */
  link: string;
  /** Params pra copy via `t()`. Sempre serializável (string|number). */
  data: Record<string, string | number>;
};

export type BriefingInput = {
  pendingSwaps: { id: string; requesterName: string }[];
  routineAwaitingTheirAck: boolean;
  routinePendingAck: { fromName: string; overrideIds: string[] } | null;
  pendingReports: { activityName: string; childName: string; daysAgo: number }[];
  pendingExpenses: { id: string; description: string }[];
  pendingDecisions: { id: string; title: string }[];
  schoolUnreadCount: number;
  expensesUnreadCount: number;
  saudeUnreadCount: number;
  vaccinePendingCount: number;
  vaccineNextDue: { dueDate: string; vaccineName: string } | null;
};

/**
 * A régua de prioridade. "O que precisa de uma decisão/ação minha, com impacto
 * mais próximo, primeiro" → desce até a awareness calma.
 *   1-3  o plano de hoje (troca de guarda, mudança na rotina, aconteceu?)
 *   4-5  ações pendentes (aprovar despesa, votar decisão)
 *   6-8  novidades pra ver (saúde, escola, despesa)
 *   9    saúde preventiva (calmo, nunca alarme)
 */
const PRIORITY: Record<AttentionKind, number> = {
  swap: 1,
  routine_ack: 2,
  pending_report: 3,
  pending_expense: 4,
  pending_decision: 5,
  saude_unread: 6,
  school_unread: 7,
  expenses_unread: 8,
  vaccine: 9,
};

const TONE: Record<AttentionKind, BriefingTone> = {
  swap: "attention",
  routine_ack: "attention",
  pending_report: "attention",
  pending_expense: "attention",
  pending_decision: "attention",
  saude_unread: "calm",
  school_unread: "calm",
  expenses_unread: "calm",
  vaccine: "calm",
};

function makeItem(
  kind: AttentionKind,
  count: number,
  link: string,
  data: Record<string, string | number> = {},
): AttentionItem {
  return { id: kind, kind, priority: PRIORITY[kind], tone: TONE[kind], count, link, data };
}

/**
 * Unifica o que vivia em ~6 seções soltas numa só régua priorizada. Agrega por
 * tipo (1 item por kind, com `count`). Vazio ⇒ dia tranquilo. Espelho fiel do
 * PWA: rotas adaptadas pro expo-router (mesmos destinos).
 */
export function composeAttention(input: BriefingInput): AttentionItem[] {
  const items: AttentionItem[] = [];

  if (input.pendingSwaps.length > 0) {
    items.push(
      makeItem("swap", input.pendingSwaps.length, "/calendario", {
        firstName: input.pendingSwaps[0].requesterName,
        count: input.pendingSwaps.length,
      }),
    );
  }

  if (input.routinePendingAck || input.routineAwaitingTheirAck) {
    items.push(
      makeItem("routine_ack", 1, "/", {
        fromName: input.routinePendingAck?.fromName ?? "",
        awaiting: input.routineAwaitingTheirAck ? 1 : 0,
      }),
    );
  }

  if (input.pendingReports.length > 0) {
    const first = input.pendingReports[0];
    items.push(
      makeItem("pending_report", input.pendingReports.length, "/atividades/pendentes", {
        activity: first.activityName,
        child: first.childName,
        count: input.pendingReports.length,
      }),
    );
  }

  if (input.pendingExpenses.length > 0) {
    items.push(
      makeItem("pending_expense", input.pendingExpenses.length, "/despesas", {
        count: input.pendingExpenses.length,
      }),
    );
  }

  if (input.pendingDecisions.length > 0) {
    items.push(
      makeItem("pending_decision", input.pendingDecisions.length, "/decisoes", {
        count: input.pendingDecisions.length,
        title: input.pendingDecisions[0].title,
      }),
    );
  }

  if (input.saudeUnreadCount > 0) {
    items.push(makeItem("saude_unread", input.saudeUnreadCount, "/saude", { count: input.saudeUnreadCount }));
  }
  if (input.schoolUnreadCount > 0) {
    items.push(makeItem("school_unread", input.schoolUnreadCount, "/escola", { count: input.schoolUnreadCount }));
  }
  if (input.expensesUnreadCount > 0) {
    items.push(
      makeItem("expenses_unread", input.expensesUnreadCount, "/despesas", { count: input.expensesUnreadCount }),
    );
  }

  if (input.vaccinePendingCount > 0) {
    items.push(
      makeItem("vaccine", input.vaccinePendingCount, "/saude/vacinas", {
        count: input.vaccinePendingCount,
        vaccineName: input.vaccineNextDue?.vaccineName ?? "",
        dueDate: input.vaccineNextDue?.dueDate ?? "",
      }),
    );
  }

  return items.sort((a, b) => a.priority - b.priority);
}
