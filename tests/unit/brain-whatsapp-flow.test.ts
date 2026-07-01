import { describe, it, expect } from "vitest";
import {
  isCalendarIntent,
  parseKeepIndices,
  classifyBrainReply,
  isUndoReply,
  isDeclineUndoReply,
  isCalendarYes,
  matchChildName,
  clampNote,
  renderPreview,
  renderExecuted,
  renderUndone,
  isConsultIntent,
  renderHealthPreview,
  renderHealthExecuted,
  renderHealthUndone,
} from "@/lib/whatsapp/brain-flow";
import type { ActivitySpec, HealthVisitPlan, IntakePreview } from "@/lib/ai/brain/types";

describe("isCalendarIntent", () => {
  it("reconhece slash/keyword de calendário", () => {
    expect(isCalendarIntent("/calendario")).toBe(true);
    expect(isCalendarIntent("/escola")).toBe(true);
    expect(isCalendarIntent("provas")).toBe(true);
    expect(isCalendarIntent("AV2")).toBe(true);
  });
  it("reconhece linguagem natural", () => {
    expect(isCalendarIntent("calendário de provas")).toBe(true);
    expect(isCalendarIntent("calendário de AV2 da Eduarda")).toBe(true);
    expect(isCalendarIntent("cronograma de provas do 3º ano")).toBe(true);
  });
  it("NÃO sequestra recibo/receita/vazio (conservador)", () => {
    expect(isCalendarIntent("")).toBe(false);
    expect(isCalendarIntent(undefined)).toBe(false);
    expect(isCalendarIntent("receita")).toBe(false);
    expect(isCalendarIntent("recibo da farmácia")).toBe(false);
    expect(isCalendarIntent("foto do boleto")).toBe(false);
  });
  it("'escola' NUA (sem barra) NÃO dispara — recibo de mensalidade escolar", () => {
    // Regressão: legenda comum de boleto/recibo escolar não pode ir pro Brain.
    expect(isCalendarIntent("escola do João R$ 850")).toBe(false);
    expect(isCalendarIntent("escola")).toBe(false);
    expect(isCalendarIntent("mensalidade escola")).toBe(false);
    // Mas o slash-command explícito continua valendo.
    expect(isCalendarIntent("/escola")).toBe(true);
  });
});

describe("classifyBrainReply — segurança (nunca confirma por engano)", () => {
  it("confirmação SÓ quando a mensagem é de confirmação", () => {
    expect(classifyBrainReply("confirmar", 7, false)).toEqual({ action: "confirm" });
    expect(classifyBrainReply("sim", 7, false)).toEqual({ action: "confirm" });
    expect(classifyBrainReply("pode", 7, false)).toEqual({ action: "confirm" });
    expect(classifyBrainReply("todas", 7, false)).toEqual({ action: "confirm" });
  });
  it("MENSAGEM QUALQUER com 'pode/sim' NÃO confirma (bug crítico da revisão)", () => {
    // "pode ser dia 20?" tem 'pode' e um número fora do range — jamais confirmar.
    expect(classifyBrainReply("pode ser dia 20?", 7, false)).toEqual({ action: "unknown" });
    expect(classifyBrainReply("qual o saldo?", 7, false)).toEqual({ action: "unknown" });
    expect(classifyBrainReply("agendar pediatra dia 20", 7, false)).toEqual({ action: "unknown" });
  });
  it("cancelamento", () => {
    expect(classifyBrainReply("cancelar", 7, false)).toEqual({ action: "cancel" });
    expect(classifyBrainReply("não", 7, false)).toEqual({ action: "cancel" });
  });
  it("deseleção por número", () => {
    expect(classifyBrainReply("tirar 2 e 4", 5, false)).toEqual({ action: "deselect", keepIndices: [0, 2, 4] });
    expect(classifyBrainReply("manter 1 e 3", 5, false)).toEqual({ action: "deselect", keepIndices: [0, 2] });
  });
  it("manter todas via número → confirm; tirar todas → empty_selection", () => {
    expect(classifyBrainReply("manter 1 2 3 4 5", 5, false)).toEqual({ action: "confirm" });
    expect(classifyBrainReply("tirar 1 2 3 4 5", 5, false)).toEqual({ action: "empty_selection" });
  });
  it("números inválidos: só vira bad_numbers quando há intenção de escolher", () => {
    expect(classifyBrainReply("tirar 10", 5, false)).toEqual({ action: "bad_numbers" }); // verbo + nº fora
    expect(classifyBrainReply("5 e 7", 3, true)).toEqual({ action: "bad_numbers" }); // pediu seleção
    // sem pedir seleção e sem verbo, número solto fora do range → cai no assistente
    expect(classifyBrainReply("5 e 7", 3, false)).toEqual({ action: "unknown" });
  });
});

describe("isUndoReply — ancorado (não desfaz por engano)", () => {
  it("reconhece pedidos de desfazer", () => {
    for (const s of ["desfazer", "reverter", "cancela", "desfazer tudo", "cancela isso", "apaga tudo"]) {
      expect(isUndoReply(s)).toBe(true);
    }
  });
  it("NÃO desfaz mensagem qualquer que apenas menciona um verbo", () => {
    for (const s of ["vou apagar a foto depois", "qual o saldo?", "", "reverter o pagamento da escola amanhã"]) {
      expect(isUndoReply(s)).toBe(false);
    }
  });
});

describe("isDeclineUndoReply — recusa do desfazer (não cai na saudação)", () => {
  it("reconhece o 'não' e fechamentos calorosos", () => {
    for (const s of ["Nao", "não", "nao", "tá bom", "tudo certo", "pode deixar", "não precisa", "obrigado", "valeu", "perfeito", "beleza", "blz", "ok", "isso mesmo", "perfeito 🙂", "não!"]) {
      expect(isDeclineUndoReply(s)).toBe(true);
    }
  });
  it("NÃO captura pergunta/asserção qualquer (cai no assistente)", () => {
    for (const s of ["não sei o saldo", "qual o saldo?", "não, agenda o pediatra dia 20", "", "quanto gastei?"]) {
      expect(isDeclineUndoReply(s)).toBe(false);
    }
  });
  it("REGRESSÃO (feedback do dono): 'não + qualificador' NUNCA é recusa de undo", () => {
    // "não" só é recusa quando é a mensagem INTEIRA; com qualquer complemento é
    // outra intenção e deve cair no assistente. (Além disso só roda na fase
    // executed — nunca global.)
    for (const s of [
      "Não é o Martim, é o Otto",
      "não quero criar essa prova",
      "não é essa data",
      "não quero enviar para o outro responsável",
    ]) {
      expect(isDeclineUndoReply(s)).toBe(false);
    }
  });
  it("undo e recusa são coisas distintas (undo é checado primeiro no handler)", () => {
    // "não quero desfazer" é RECUSA, não undo (isUndoReply não reconhece 'não').
    expect(isUndoReply("não quero desfazer")).toBe(false);
    expect(isDeclineUndoReply("não quero desfazer")).toBe(true);
    // "desfazer" puro é undo, não recusa.
    expect(isDeclineUndoReply("desfazer")).toBe(false);
  });
});

describe("matchChildName — resolve a criança pela resposta", () => {
  const opts = [
    { id: "o1", name: "Otto" },
    { id: "m1", name: "Martim Silva" },
  ];
  it("nome exato / frase com o nome / sem acento", () => {
    expect(matchChildName("Otto", opts)).toBe("o1");
    expect(matchChildName("martim", opts)).toBe("m1");
    expect(matchChildName("é o Martim", opts)).toBe("m1");
    expect(matchChildName("MÁRTIM", [{ id: "m1", name: "Mártim" }])).toBe("m1");
  });
  it("não casa nome de fora / vazio / letra solta", () => {
    expect(matchChildName("Bernardo", opts)).toBeNull();
    expect(matchChildName("", opts)).toBeNull();
    expect(matchChildName("m", opts)).toBeNull();
  });
});

describe("isCalendarYes — fallback recibo→calendário", () => {
  it("reconhece 'é calendário'", () => {
    for (const s of ["calendário", "provas", "sim", "é", "isso", "sim é calendário"]) {
      expect(isCalendarYes(s)).toBe(true);
    }
  });
  it("NÃO captura mensagem qualquer / negativa / token solto ambíguo", () => {
    for (const s of ["não", "é um recibo", "gastei 50 no mercado", "", "qual o saldo?", "escola", "pode"]) {
      expect(isCalendarYes(s)).toBe(false);
    }
  });
});

describe("parseKeepIndices (total=5)", () => {
  it("'confirmar'/'todas'/'sim' → mantém todas", () => {
    expect(parseKeepIndices("confirmar", 5)).toEqual([0, 1, 2, 3, 4]);
    expect(parseKeepIndices("todas", 5)).toEqual([0, 1, 2, 3, 4]);
    expect(parseKeepIndices("sim, pode criar", 5)).toEqual([0, 1, 2, 3, 4]);
  });
  it("'tirar/remover/sem N' → remove esses, mantém o resto", () => {
    expect(parseKeepIndices("tirar 2 e 4", 5)).toEqual([0, 2, 4]);
    expect(parseKeepIndices("remover 2,4", 5)).toEqual([0, 2, 4]);
    expect(parseKeepIndices("sem o 3", 5)).toEqual([0, 1, 3, 4]);
  });
  it("'manter/só N' ou só números → mantém exatamente esses", () => {
    expect(parseKeepIndices("manter 1 e 3", 5)).toEqual([0, 2]);
    expect(parseKeepIndices("só 1 e 3", 5)).toEqual([0, 2]);
    expect(parseKeepIndices("1 3", 5)).toEqual([0, 2]);
  });
  it("números fora do intervalo são ignorados; sem entender → null", () => {
    expect(parseKeepIndices("tirar 10", 5)).toBeNull(); // 10 fora → sem números válidos
    expect(parseKeepIndices("blá blá", 5)).toBeNull();
    expect(parseKeepIndices("", 5)).toBeNull();
    expect(parseKeepIndices("manter 7", 3)).toBeNull();
  });
  it("total inválido → null", () => {
    expect(parseKeepIndices("confirmar", 0)).toBeNull();
  });
});

function act(over: Partial<ActivitySpec> = {}): ActivitySpec {
  return { childId: "c1", name: "Prova", category: "school", startDate: "2026-08-12", ...over };
}

const PREVIEW: IntakePreview = {
  intakeId: "i1",
  docType: "school_calendar",
  confirmation: "single",
  planHash: "h",
  confirmationToken: "tok",
  priority: { level: "important", delivery: "digest" },
  impacts: [
    {
      kind: "tight_sequence",
      severity: "info",
      date: "2026-08-12",
      childId: "c1",
      titleKey: "brain.impact.tightSequenceRun",
      titleVars: { childId: "c1", date1: "2026-08-12", date2: "2026-08-14", count: 3 },
    },
  ],
  plan: {
    docType: "school_calendar",
    confirmation: "single",
    activities: [
      act({ name: "Prova de Matemática", startDate: "2026-08-12", timeStart: "08:00", notes: "Cap. 7" }),
      act({ name: "Prova de História", startDate: "2026-08-13" }),
    ],
  },
};

describe("clampNote — resumo de 1 linha do conteúdo (sem 'Onde e…' quebrado)", () => {
  it("nota curta é mantida inteira", () => {
    expect(clampNote("Cap. 7")).toBe("Cap. 7");
    expect(clampNote("Capítulo 5: O espaço rural.")).toBe("Capítulo 5: O espaço rural.");
  });
  it("vazio/undefined → ''", () => {
    expect(clampNote("")).toBe("");
    expect(clampNote(undefined)).toBe("");
    expect(clampNote(null)).toBe("");
  });
  it("descarta o bloco 'Onde estudar' (secundário; vive no app), sem quebra de linha", () => {
    const r = clampNote("Capítulo 5: O espaço rural.\n\nOnde estudar: Livro 2 SAS e pasta.");
    expect(r).toBe("Capítulo 5: O espaço rural.");
    expect(r).not.toContain("Onde");
    expect(r).not.toContain("\n");
  });
  it("REGRESSÃO (achado da revisão): nota que COMEÇA com 'Onde estudar' (prova sem conteúdo) → ''", () => {
    // O playbook monta a nota so com a fonte quando nao ha conteudo. Sem paragrafo
    // anterior, o split nao separa — precisa do filtro de prefixo.
    expect(clampNote("Onde estudar: Apostila SAS (capítulo 7) e NPL.")).toBe("");
    expect(clampNote("onde estudar: livro 2")).toBe("");
  });
  it("REGRESSÃO: a nota real do dono NÃO produz 'Onde e…' nem quebra de linha", () => {
    const real =
      "Interpretação de texto: Carta pessoal. Produção textual: Carta pessoal.\n\nOnde estudar: Apostila SAS (capítulo 7) e NPL.";
    const r = clampNote(real);
    expect(r).not.toContain("Onde");
    expect(r).not.toContain("\n");
    expect(r).not.toMatch(/\s…$/); // nunca "espaço + reticências"
  });
  it("bloco longo trunca na FRONTEIRA DE PALAVRA (nunca no meio) + termina em …", () => {
    const long = "Capítulo 6: O que é um animal? Capítulo 7: Como vivem os animais. Capítulo 8: O ciclo de vida dos animais.";
    const r = clampNote(long);
    expect(r.endsWith("…")).toBe(true);
    expect(r.length).toBeLessThanOrEqual(71); // 70 + o caractere '…'
    expect(r).not.toContain("  "); // sem espaço duplo
    expect(r).not.toMatch(/[\s,.;:·—-]…$/); // sem pontuação/sep pendurado antes de …
    // o corte não parte uma palavra: o trecho antes de … bate com o início do texto
    expect(long.startsWith(r.slice(0, -1))).toBe(true);
  });
  it("colapsa espaços e quebras internas do bloco primário", () => {
    expect(clampNote("A  B\nC")).toBe("A B C");
  });
});

describe("renderPreview", () => {
  const t = (k: string, v?: Record<string, unknown>) => `${k}|${v?.child}|${v?.count}|${v?.date1}-${v?.date2}`;

  it("numera as provas com data/hora/conteúdo + impacto resolvido + CTA", () => {
    const msg = renderPreview(PREVIEW, "Eduarda", t);
    expect(msg).toContain("Encontrei 2 provas para Eduarda:");
    expect(msg).toContain("1. *Prova de Matemática* — 12/08 08:00 · Cap. 7");
    expect(msg).toContain("2. *Prova de História* — 13/08");
    // impacto via t, com nome resolvido e datas em DD/MM
    expect(msg).toContain("brain.impact.tightSequenceRun|Eduarda|3|12/08-14/08");
    expect(msg).toContain("*Confirmar*");
    expect(msg).toContain("*Escolher*");
    expect(msg).toContain("*Cancelar*");
  });

  it("singular quando há 1 prova", () => {
    const single: IntakePreview = {
      ...PREVIEW,
      impacts: [],
      plan: { ...PREVIEW.plan, activities: [act({ name: "Prova de Ciências", startDate: "2026-09-01" })] },
    };
    const msg = renderPreview(single, "Joao", t);
    expect(msg).toContain("Encontrei 1 prova para Joao:");
    expect(msg).toContain("1. *Prova de Ciências* — 01/09");
  });

  it("withCta:false OMITE o CTA de texto (WhatsApp usa botões)", () => {
    const msg = renderPreview(PREVIEW, "Eduarda", t, { withCta: false });
    expect(msg).toContain("Encontrei 2 provas para Eduarda:");
    expect(msg).not.toContain("*Confirmar*");
    expect(msg).not.toContain("Responda");
  });
});

describe("renderExecuted / renderUndone", () => {
  it("plural/singular corretos", () => {
    expect(renderExecuted(2)).toContain("2 provas");
    expect(renderExecuted(1)).toContain("1 prova");
    expect(renderExecuted(2)).toContain("Desfazer");
    expect(renderUndone(3)).toContain("3 provas");
    expect(renderUndone(1)).toContain("1 prova");
  });
  it("menciona itens 'detached' (alterados depois e mantidos)", () => {
    const msg = renderUndone(2, 1);
    expect(msg).toContain("removi 2 provas");
    expect(msg).toContain("1 prova foi alterada");
    expect(msg).toContain("continua no calendário");
  });
  it("removed=0 → 'nada a remover' (evita 'removi 0 provas')", () => {
    const msg = renderUndone(0, 0);
    expect(msg).not.toContain("removi 0");
    expect(msg).toContain("nada a remover");
  });
});

/* ---- SAÚDE (health_visit) no WhatsApp ---- */

const CHILD = "11111111-1111-1111-1111-111111111111";
function healthPreview(over: Partial<HealthVisitPlan> = {}): IntakePreview {
  const health: HealthVisitPlan = {
    appointment: { childId: CHILD, title: "Consulta — Pediatria", appointmentType: "rotina", date: "2026-07-01", summary: "Alergia leve" },
    episode: { childId: CHILD, title: "Alergia leve", diagnosis: "Alergia leve", startDate: "2026-07-01", severity: "leve" },
    medications: [{ childId: CHILD, name: "Amoxicilina", dosage: "500 mg", frequency: "a cada 8h", frequencyHours: 8, careType: "medication", startDate: "2026-07-01" }],
    followUp: { date: "2026-08-05", notes: "retorno em 1 mês" },
    examRequests: [],
    ...over,
  };
  return { intakeId: "i1", docType: "health_visit", confirmation: "single", plan: { docType: "health_visit", confirmation: "single", health }, impacts: [], priority: { level: "important", delivery: "digest" }, planHash: "h", confirmationToken: "t" };
}

describe("isConsultIntent", () => {
  it("reconhece slash/keyword de consulta; NÃO pega escola/recibo", () => {
    for (const c of ["/consulta", "consulta médica do Otto", "receita médica", "resumo da consulta", "/saude", "pedido de exame"]) {
      expect(isConsultIntent(c)).toBe(true);
    }
    for (const c of ["/escola", "calendário de provas", "escola do João R$ 850", "receita de bolo", "", "oi"]) {
      expect(isConsultIntent(c)).toBe(false);
    }
  });
});

describe("renderHealthPreview / executed / undone", () => {
  it("preview mostra consulta + avaliação + medicação(dose) + retorno + CTA", () => {
    const msg = renderHealthPreview(healthPreview(), "Otto");
    expect(msg).toContain("Otto");
    expect(msg).toContain("Consulta — Pediatria");
    expect(msg).toContain("Alergia leve");
    expect(msg).toContain("Amoxicilina — 500 mg · a cada 8h");
    expect(msg).toContain("05/08"); // retorno DD/MM
    expect(msg).toContain("Confirmar");
  });
  it("dose nula → 'conforme prescrição' (nunca inventa)", () => {
    const msg = renderHealthPreview(
      healthPreview({ medications: [{ childId: CHILD, name: "Xarope", dosage: null, frequency: null, frequencyHours: null, careType: "medication", startDate: "2026-07-01" }] }),
      "Lia",
    );
    expect(msg).toContain("Xarope — conforme prescrição");
  });
  it("withCta:false omite a chamada à ação (pra mensagem de botões)", () => {
    expect(renderHealthPreview(healthPreview(), "Otto", { withCta: false })).not.toContain("Confirmar");
  });
  it("executed e undone têm copy de saúde", () => {
    expect(renderHealthExecuted()).toContain("histórico de Saúde");
    expect(renderHealthUndone(1)).toContain("removi o registro da consulta");
    expect(renderHealthUndone(0)).toContain("nada a remover");
  });
});
