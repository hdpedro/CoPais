/**
 * Briefing Familiar — motor de composição do dashboard (PURO, sem I/O).
 *
 * Recebe os dados JÁ carregados do dashboard e produz a estrutura priorizada
 * do briefing:
 *   - qual herói lidera (guarda vs rotina vs setup), por forma de família;
 *   - a lista UNIFICADA de "Sua Atenção" — o que hoje está espalhado em ~6
 *     seções (relatos pendentes, trocas, aprovações, votos, novidades de
 *     escola/despesa/saúde, reforços de vacina) vira UMA régua de prioridade;
 *   - o flag de "dia tranquilo" (nada exige você → a paz é uma feature).
 *
 * NÃO produz copy final: cada item carrega `kind` + `data` (params); a UI
 * renderiza via `t()`. Mantém i18n limpa (Regras Canônicas) e paridade
 * PWA↔Native — este módulo é espelhado em `kindar-native/app/_src/lib/`.
 *
 * Marca: NUNCA alarme. O tom mais forte é "attention" (âmbar), jamais vermelho.
 * Decisão do dono: reforços de vacina entram CALMOS ("alguns reforços pra ver");
 * o número detalhado vive em /saude, não na home. Ações rápidas: intocadas.
 */

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
  /** Pra onde o toque leva. */
  link: string;
  /**
   * Params pra copy via `t()` — a UI compõe o texto, o motor só decide o quê
   * e em que ordem. Sempre serializável (string|number).
   */
  data: Record<string, string | number>;
};

export type BriefingHeroKind = "custody" | "routine" | "setup";

export type Briefing = {
  heroKind: BriefingHeroKind;
  /** "Sua Atenção" já priorizada (régua única). Sem cap — a UI decide quanto mostrar. */
  attention: AttentionItem[];
  attentionCount: number;
  /** true quando nada exige você → a UI mostra "Dia tranquilo". */
  calm: boolean;
};

export type BriefingInput = {
  arrangement: "rotating" | "together" | "single" | "custom";
  hasCustody: boolean;
  hasRoutineSlots: boolean;
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
 * A régua de prioridade. Ordena por "o que precisa de uma decisão/ação minha,
 * com impacto mais próximo, primeiro" → desce até a awareness calma.
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

/**
 * Seleciona qual herói lidera por forma de família — paridade com a lógica de
 * seleção em `dashboard/page.tsx` (rotating/custom → guarda; together/single →
 * a rotina vira o herói). Degrada pra "setup" quando não há nem guarda nem rotina.
 */
export function selectHeroKind(
  input: Pick<BriefingInput, "arrangement" | "hasCustody" | "hasRoutineSlots">,
): BriefingHeroKind {
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

function makeItem(
  kind: AttentionKind,
  count: number,
  link: string,
  data: Record<string, string | number> = {},
): AttentionItem {
  return { id: kind, kind, priority: PRIORITY[kind], tone: TONE[kind], count, link, data };
}

/**
 * Unifica o que hoje vive em ~6 seções soltas numa só régua priorizada.
 * Agrega por tipo (1 item por kind, com `count`) — a UI mostra o topo em
 * destaque e o resto em lista. Vazio ⇒ dia tranquilo.
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

  // Mudança na rotina de hoje que precisa de ciência (eu mudei e aguardo o
  // outro ver, OU o outro mudou e eu preciso ver).
  if (input.routinePendingAck || input.routineAwaitingTheirAck) {
    items.push(
      makeItem("routine_ack", 1, "/dashboard", {
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

  // Reforços de vacina — CALMO. Passamos o count pro motor, mas a UI usa copy
  // sem número alarmante ("alguns reforços pra ver"); o detalhe vive em /saude.
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

/** Compõe o briefing completo: herói + régua de atenção + flag de calma. */
export function composeBriefing(input: BriefingInput): Briefing {
  const attention = composeAttention(input);
  return {
    heroKind: selectHeroKind(input),
    attention,
    attentionCount: attention.length,
    calm: attention.length === 0,
  };
}
