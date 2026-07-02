/* ------------------------------------------------------------------ */
/* Fatia N3a: gate conservador de narrativa de guarda (3º da fila — não */
/* sequestra provas nem consulta) + prévia humana com governança clara. */
/* ------------------------------------------------------------------ */

import { describe, it, expect } from "vitest";
import { looksLikeCustodyText, looksLikeExamText, looksLikeConsultText } from "@/lib/ai/brain/exam-text-gate";
import { buildCustodyPreviewMessage, buildCustodyCoordinationBody } from "@/lib/ai/brain/custody-preview";
import { renderCustodyExecuted, renderCustodyUndone } from "@/lib/whatsapp/brain-flow";
import type { CustodyRoutinePlan } from "@/lib/ai/brain/types";

describe("looksLikeCustodyText — gate conservador", () => {
  it.each([
    "Semana que vem o Otto fica comigo, a Fernanda viaja",
    "Troquei o sábado com a Fernanda, dia 11",
    "Na quinta quem busca é a minha mãe",
    "Férias de julho: os meninos ficam comigo de 15 a 30",
    "A partir de segunda quem leva é o pai",
  ])("captura: %s", (s) => {
    expect(looksLikeCustodyText(s)).toBe(true);
  });

  it.each([
    ["pergunta não captura", "Quem busca o Otto amanhã?"],
    ["conversa genérica sem data", "a guarda tá tranquila ultimamente"],
    ["curto demais", "férias!"],
  ])("%s", (_n, s) => {
    expect(looksLikeCustodyText(s)).toBe(false);
  });

  it("NÃO sequestra provas nem consulta (os outros gates têm precedência e batem primeiro)", () => {
    const prova = "A prova de matemática do Otto é dia 20/08.";
    expect(looksLikeExamText(prova)).toBe(true); // escolar pega antes na fila
    const consulta = "A consulta do Otto foi boa, a pediatra pediu retorno dia 5 de agosto.";
    expect(looksLikeConsultText(consulta)).toBe(true); // saúde pega antes na fila
  });
});

describe("buildCustodyPreviewMessage — uma linha humana por item", () => {
  const OTTO = "child-otto";
  const nameOf = (id: string) => (id === OTTO ? "Otto" : "");

  it("mistura de itens: aplicado, anotado (externo), aguardando aceite e aguardando OK", () => {
    const plan: CustodyRoutinePlan = {
      items: [
        {
          kind: "custody_exception",
          childIds: [OTTO],
          startDate: "2026-07-06",
          endDate: "2026-07-10",
          responsible: { memberId: "u-pai", label: "Henrique" },
          reason: "Fernanda viaja",
        },
        {
          kind: "leg_override",
          childIds: [OTTO],
          date: "2026-07-09",
          leg: "pickup",
          responsible: { memberId: null, label: "a avó" },
          time: "15:00",
          note: null,
        },
        {
          kind: "swap_proposal",
          childIds: [OTTO],
          originalDate: "2026-07-11",
          proposedDate: "2026-07-18",
          counterpart: { memberId: "u-mae", label: "Fernanda" },
          reason: null,
        },
        {
          kind: "slot_change",
          childIds: [OTTO],
          weekday: 1,
          leg: "dropoff",
          responsible: { memberId: "u-mae", label: "Fernanda" },
          time: "07:30",
        },
      ],
    };
    const msg = buildCustodyPreviewMessage(plan, nameOf, 2);
    expect(msg).toContain("Otto fica com Henrique de 06/07 a 10/07 — Fernanda viaja");
    expect(msg).toContain("quinta 09/07: quem busca Otto é a avó às 15:00 — fica anotado; no app o responsável é você");
    expect(msg).toContain("Troca de dia com Fernanda (11/07 ⇄ 18/07) — aguarda o aceite de Fernanda");
    expect(msg).toContain("Mudança fixa: toda segunda quem leva passa a ser Fernanda às 07:30 — aguarda o OK do coparente");
    expect(msg).toContain("Quem precisa aprovar será avisado");
  });

  it("withCta:false omite a pergunta final (WhatsApp anexa os botões)", () => {
    const plan: CustodyRoutinePlan = {
      items: [
        {
          kind: "custody_exception",
          childIds: [OTTO],
          startDate: "2026-07-09",
          endDate: "2026-07-09",
          responsible: { memberId: "u-pai", label: "Henrique" },
          reason: null,
        },
      ],
    };
    const msg = buildCustodyPreviewMessage(plan, nameOf, 2, { withCta: false });
    expect(msg).not.toContain("Posso registrar?");
  });

  it("renders do WhatsApp: executado + desfeito (acordo aceito fica de pé)", () => {
    expect(renderCustodyExecuted()).toContain("quem precisa aprovar já foi avisado");
    expect(renderCustodyUndone(2, 0)).toBe("Desfeito — removi 2 combinações de guarda e rotina.");
    expect(renderCustodyUndone(1, 1)).toContain("1 troca já aceita continua valendo");
    expect(renderCustodyUndone(0, 0)).toContain("Já estava desfeito");
  });

  it("férias família-toda e exceção de 1 dia com dia da semana", () => {
    const plan: CustodyRoutinePlan = {
      items: [
        {
          kind: "vacation",
          childIds: null,
          startDate: "2026-07-15",
          endDate: "2026-07-30",
          responsible: { memberId: "u-mae", label: "Fernanda" },
          notes: null,
        },
        {
          kind: "custody_exception",
          childIds: [OTTO],
          startDate: "2026-07-09",
          endDate: "2026-07-09",
          responsible: { memberId: "u-pai", label: "Henrique" },
          reason: null,
        },
      ],
    };
    const msg = buildCustodyPreviewMessage(plan, nameOf, 2);
    expect(msg).toContain("Férias: a família toda com Fernanda, 15/07 a 30/07");
    expect(msg).toContain("Otto fica com Henrique em 09/07 (quinta)");
  });
});

/* ------------------------------------------------------------------ */
/* Fatia R3: coordenação CONTEXTUAL — as mesmas linhas, ditas pro       */
/* destinatário ("fica com você"), sem a cláusula do narrador.          */
/* ------------------------------------------------------------------ */
describe("buildCustodyCoordinationBody — R3 corpo pro destinatário", () => {
  const OTTO = "child-otto";
  const nameOf = (id: string) => (id === OTTO ? "Otto" : "");
  const MAE = "u-mae";

  function exception(over: Partial<Extract<CustodyRoutinePlan["items"][number], { kind: "custody_exception" }>> = {}) {
    return {
      kind: "custody_exception" as const,
      childIds: [OTTO],
      startDate: "2026-07-09",
      endDate: "2026-07-09",
      responsible: { memberId: "u-pai", label: "Henrique" },
      reason: null,
      ...over,
    };
  }

  it("destinatária é a responsável → 'fica com você'; terceiro → nome intacto", () => {
    const plan: CustodyRoutinePlan = {
      items: [exception({ responsible: { memberId: MAE, label: "Fernanda" } })],
    };
    expect(buildCustodyCoordinationBody(plan, nameOf, 2, MAE)).toContain("Otto fica com você em 09/07");
    expect(buildCustodyCoordinationBody(plan, nameOf, 2, "u-pai")).toContain("Otto fica com Fernanda em 09/07");
  });

  it("troca COM a destinatária vira frase dela ('você pode aceitar ou recusar'), nunca 'aceite de você'", () => {
    const plan: CustodyRoutinePlan = {
      items: [
        {
          kind: "swap_proposal",
          childIds: [OTTO],
          originalDate: "2026-07-11",
          proposedDate: "2026-07-18",
          counterpart: { memberId: MAE, label: "Fernanda" },
          reason: null,
        },
      ],
    };
    const paraMae = buildCustodyCoordinationBody(plan, nameOf, 2, MAE);
    expect(paraMae).toContain("Troca de dia com você (11/07 ⇄ 18/07) — você pode aceitar ou recusar no app");
    expect(paraMae).not.toContain("de você");
    const paraTerceiro = buildCustodyCoordinationBody(plan, nameOf, 2, "u-avo");
    expect(paraTerceiro).toContain("aguarda o aceite de Fernanda");
  });

  it("externa em coordenação NÃO leva a cláusula do narrador (o 'você' de lá é outra pessoa)", () => {
    const plan: CustodyRoutinePlan = {
      items: [
        {
          kind: "leg_override",
          childIds: [OTTO],
          date: "2026-07-09",
          leg: "pickup",
          responsible: { memberId: null, label: "a avó Regina" },
          time: "15:00",
          note: null,
        },
      ],
    };
    const body = buildCustodyCoordinationBody(plan, nameOf, 2, MAE);
    expect(body).toContain("quem busca Otto é a avó Regina às 15:00");
    expect(body).not.toContain("no app o responsável é você");
    // regressão: a PRÉVIA (pro narrador) mantém a cláusula
    expect(buildCustodyPreviewMessage(plan, nameOf, 2)).toContain("no app o responsável é você");
  });

  it("cap de linhas com '… e mais N'; plano vazio → '' (worker cai no genérico)", () => {
    const plan: CustodyRoutinePlan = {
      items: [
        exception({ startDate: "2026-07-06", endDate: "2026-07-06" }),
        exception({ startDate: "2026-07-07", endDate: "2026-07-07" }),
        exception({ startDate: "2026-07-08", endDate: "2026-07-08" }),
        exception(),
        exception({ startDate: "2026-07-10", endDate: "2026-07-10" }),
      ],
    };
    const body = buildCustodyCoordinationBody(plan, nameOf, 2, MAE, 3);
    expect(body.split("\n")).toHaveLength(4);
    expect(body).toContain("… e mais 2");
    expect(buildCustodyCoordinationBody({ items: [] }, nameOf, 2, MAE)).toBe("");
  });
});
