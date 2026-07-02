/* ------------------------------------------------------------------ */
/* Fatia E1 (Fase 2): playbook de DESPESAS puro — parse valida sem      */
/* inventar (valor ausente = item cai), datas relativas clampam, gate   */
/* conservador de texto e flag fail-closed. Tudo DORMENTE (fora de      */
/* ENABLED_DOC_TYPES; FEATURE_BRAIN_EXPENSE OFF).                       */
/* ------------------------------------------------------------------ */

import { describe, it, expect } from "vitest";
import { expensePlaybook } from "@/lib/ai/brain/understanding/playbooks/expense";
import { getPlaybook, ENABLED_DOC_TYPES } from "@/lib/ai/brain/understanding/registry";
import { looksLikeExpenseText } from "@/lib/ai/brain/exam-text-gate";
import { isExpenseEnabled } from "@/lib/services/brain-flag";
import type { PlaybookContext } from "@/lib/ai/brain/types";

const CTX: PlaybookContext = {
  groupId: "g1",
  userId: "u1",
  channel: "pwa",
  today: "2026-07-02",
  timezone: "America/Sao_Paulo",
  children: [
    { id: "c-otto", name: "Otto de Pedro" },
    { id: "c-martim", name: "Martim de Pedro" },
  ] as PlaybookContext["children"],
  resolvedChildId: null,
  schoolYearAnchor: 2026,
};

function raw(items: unknown[]): unknown {
  return { recognized_as: "expense", items };
}

describe("expensePlaybook.parse — transportador, não inventor", () => {
  it("item completo: valor, categoria, criança resolvida, data relativa ok", () => {
    const plan = expensePlaybook.parse(
      raw([{ description: "Consulta pediatra", amount: 250, category: "health", childName: "Otto", expenseDate: "2026-07-01", splitHint: "default" }]),
      CTX,
    );
    expect(plan?.items).toEqual([
      { description: "Consulta pediatra", amount: 250, category: "health", childId: "c-otto", expenseDate: "2026-07-01", splitHint: "default" },
    ]);
  });

  it("SEM valor claro o item CAI (nunca inventa); zero/negativo/absurdo caem", () => {
    const plan = expensePlaybook.parse(
      raw([
        { description: "Remédio", amount: null, category: "health", childName: null, expenseDate: "2026-07-02", splitHint: null },
        { description: "Zero", amount: 0, category: "other" },
        { description: "Negativo", amount: -10, category: "other" },
        { description: "Absurdo", amount: 999999, category: "other" },
      ]),
      CTX,
    );
    expect(plan).toBeNull();
  });

  it("vírgula decimal em string vira número; categoria fora do enum → other", () => {
    const plan = expensePlaybook.parse(
      raw([{ description: "Tênis", amount: "89,90", category: "sapatos", childName: "Martim", expenseDate: "2026-06-30", splitHint: "payer_only" }]),
      CTX,
    );
    expect(plan?.items[0]).toMatchObject({ amount: 89.9, category: "other", childId: "c-martim", splitHint: "payer_only" });
  });

  it("data fora do horizonte (passado >370d / futuro >30d) clampa pra hoje; ausente = hoje", () => {
    const plan = expensePlaybook.parse(
      raw([
        { description: "Antiga", amount: 10, category: "other", expenseDate: "2020-01-01" },
        { description: "Futura demais", amount: 10, category: "other", expenseDate: "2026-12-25" },
        { description: "Sem data", amount: 10, category: "other" },
      ]),
      CTX,
    );
    expect(plan?.items.map((i) => i.expenseDate)).toEqual(["2026-07-02", "2026-07-02", "2026-07-02"]);
  });

  it("criança desconhecida/ambígua → null (não chuta); MAX 5 itens; recognized_as errado → null", () => {
    const many = Array.from({ length: 8 }, (_, i) => ({ description: `D${i}`, amount: i + 1, category: "other" }));
    expect(expensePlaybook.parse(raw(many), CTX)?.items).toHaveLength(5);
    expect(
      expensePlaybook.parse(raw([{ description: "X", amount: 5, category: "other", childName: "Pedro" }]), CTX)?.items[0].childId,
    ).toBeNull();
    expect(expensePlaybook.parse({ recognized_as: "unknown", items: [] }, CTX)).toBeNull();
  });

  it("plan(): docType expense + plano embutido + collabRecordType", () => {
    const plan = expensePlaybook.plan({ items: [{ description: "X", amount: 5, category: "other", childId: null, expenseDate: "2026-07-02", splitHint: null }] });
    expect(plan).toMatchObject({ docType: "expense", confirmation: "single", collabRecordType: "expense" });
    expect(plan.expense?.items).toHaveLength(1);
  });
});

describe("registro DORMENTE + gate + flag", () => {
  it("registrado (só texto) mas FORA de ENABLED_DOC_TYPES", () => {
    const pb = getPlaybook("expense");
    expect(pb?.textExtractionPrompt?.system).toContain("DESPESAS");
    expect(pb?.extractionPrompt).toBeUndefined();
    expect(ENABLED_DOC_TYPES).not.toContain("expense");
  });

  it.each([
    "paguei 250 na consulta do Otto",
    "gastei 89,90 no tênis do Martim ontem",
    "R$ 45 de uber pra escola",
    "a mensalidade custou 1200",
  ])("gate captura: %s", (s) => {
    expect(looksLikeExpenseText(s)).toBe(true);
  });

  it.each([
    ["pergunta de saldo", "quanto gastei esse mês?"],
    ["sem valor", "paguei a consulta do Otto"],
    ["sem âncora de pagamento", "a consulta foi dia 20"],
    ["curto demais", "R$ 5"],
  ])("gate NÃO captura (%s): %s", (_n, s) => {
    expect(looksLikeExpenseText(s)).toBe(false);
  });

  it("flag fail-closed por padrão", () => {
    delete process.env.FEATURE_BRAIN_EXPENSE;
    expect(isExpenseEnabled()).toBe(false);
    process.env.FEATURE_BRAIN_EXPENSE = "true";
    expect(isExpenseEnabled()).toBe(true);
    delete process.env.FEATURE_BRAIN_EXPENSE;
  });
});
