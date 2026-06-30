import { describe, it, expect } from "vitest";
import { analyzeImpact, type ExistingOccurrence } from "@/lib/ai/brain/impact";
import type { ActivitySpec, MaterializationPlan } from "@/lib/ai/brain/types";

const CHILD_A = "11111111-1111-1111-1111-111111111111";
const CHILD_B = "22222222-2222-2222-2222-222222222222";

function activity(over: Partial<ActivitySpec> = {}): ActivitySpec {
  return {
    childId: CHILD_A,
    name: "Prova",
    category: "school",
    startDate: "2026-08-12",
    ...over,
  };
}

function plan(activities: ActivitySpec[]): MaterializationPlan {
  return { docType: "school_calendar", confirmation: "single", activities };
}

describe("analyzeImpact — same_day", () => {
  it("duas provas da mesma criança no mesmo dia → 1 finding com count 2", () => {
    const findings = analyzeImpact(
      plan([
        activity({ name: "Prova de Matemática", subject: "Matemática" }),
        activity({ name: "Prova de História", subject: "História" }),
      ]),
      [],
    );
    const sameDay = findings.filter((f) => f.kind === "same_day");
    expect(sameDay).toHaveLength(1);
    expect(sameDay[0].date).toBe("2026-08-12");
    expect(sameDay[0].childId).toBe(CHILD_A);
    expect(sameDay[0].titleVars?.count).toBe(2);
    expect(sameDay[0].titleKey).toBe("brain.impact.sameDay");
  });

  it("uma prova nova num dia em que a criança JÁ tinha algo → same_day", () => {
    const existing: ExistingOccurrence[] = [
      { childId: CHILD_A, date: "2026-08-12", title: "Treino de futebol" },
    ];
    const findings = analyzeImpact(plan([activity()]), existing);
    expect(findings.some((f) => f.kind === "same_day" && f.date === "2026-08-12")).toBe(true);
  });

  it("não relata conflito pré-existente que o plano NÃO tocou", () => {
    // duas coisas já existentes no mesmo dia, mas o plano cria noutro dia.
    const existing: ExistingOccurrence[] = [
      { childId: CHILD_A, date: "2026-08-20", title: "Aula extra" },
      { childId: CHILD_A, date: "2026-08-20", title: "Dentista" },
    ];
    const findings = analyzeImpact(plan([activity({ startDate: "2026-09-01" })]), existing);
    expect(findings.some((f) => f.date === "2026-08-20")).toBe(false);
  });

  it("escopo por criança: dias iguais de crianças diferentes NÃO colidem", () => {
    const existing: ExistingOccurrence[] = [
      { childId: CHILD_B, date: "2026-08-12", title: "Consulta" },
    ];
    const findings = analyzeImpact(plan([activity({ childId: CHILD_A })]), existing);
    expect(findings.filter((f) => f.kind === "same_day")).toHaveLength(0);
  });

  it("consulta de dezembro NÃO invalida prova de agosto (date-local)", () => {
    const existing: ExistingOccurrence[] = [
      { childId: CHILD_A, date: "2026-12-15", title: "Consulta de rotina" },
    ];
    const findings = analyzeImpact(plan([activity({ startDate: "2026-08-12" })]), existing);
    expect(findings).toHaveLength(0);
  });
});

describe("analyzeImpact — tight_sequence", () => {
  it("provas em dias consecutivos → tight_sequence (severidade calma)", () => {
    const findings = analyzeImpact(
      plan([
        activity({ name: "Prova de Matemática", startDate: "2026-08-12" }),
        activity({ name: "Prova de História", startDate: "2026-08-13" }),
      ]),
      [],
    );
    const seq = findings.filter((f) => f.kind === "tight_sequence");
    expect(seq).toHaveLength(1);
    expect(seq[0].severity).toBe("info");
    expect(seq[0].titleVars).toMatchObject({ date1: "2026-08-12", date2: "2026-08-13" });
  });

  it("dias separados por >1 dia não disparam", () => {
    const findings = analyzeImpact(
      plan([
        activity({ name: "P1", startDate: "2026-08-12" }),
        activity({ name: "P2", startDate: "2026-08-15" }),
      ]),
      [],
    );
    expect(findings.filter((f) => f.kind === "tight_sequence")).toHaveLength(0);
  });

  it("par consecutivo só-existente (plano não tocou nenhuma ponta) → não dispara", () => {
    const existing: ExistingOccurrence[] = [
      { childId: CHILD_A, date: "2026-08-20", title: "X" },
      { childId: CHILD_A, date: "2026-08-21", title: "Y" },
    ];
    const findings = analyzeImpact(plan([activity({ startDate: "2026-09-01" })]), existing);
    expect(findings.filter((f) => f.kind === "tight_sequence")).toHaveLength(0);
  });
});

describe("analyzeImpact — robustez / falha", () => {
  it("plano vazio → sem findings", () => {
    expect(analyzeImpact(plan([]), [])).toEqual([]);
  });

  it("plano sem array de atividades → sem findings", () => {
    expect(analyzeImpact({ docType: "school_calendar", confirmation: "single" }, [])).toEqual([]);
  });

  it("datas inválidas no plano são ignoradas (não quebra)", () => {
    const findings = analyzeImpact(
      plan([activity({ startDate: "amanhã" }), activity({ startDate: "2026-02-31" })]),
      [],
    );
    expect(findings).toEqual([]);
  });

  it("ocorrência existente com data inválida é ignorada", () => {
    const existing: ExistingOccurrence[] = [{ childId: CHILD_A, date: "31/02", title: "ruim" }];
    const findings = analyzeImpact(plan([activity()]), existing);
    expect(findings).toEqual([]);
  });

  it("nenhum finding tem severidade 'urgent' (Regra 6)", () => {
    const findings = analyzeImpact(
      plan([
        activity({ name: "A", startDate: "2026-08-12" }),
        activity({ name: "B", startDate: "2026-08-12" }),
        activity({ name: "C", startDate: "2026-08-13" }),
      ]),
      [],
    );
    expect(findings.length).toBeGreaterThan(0);
    for (const f of findings) expect(["info", "attention"]).toContain(f.severity);
  });

  it("ordenação determinística por data e tipo", () => {
    const findings = analyzeImpact(
      plan([
        activity({ name: "A", startDate: "2026-08-13" }),
        activity({ name: "B", startDate: "2026-08-13" }),
        activity({ name: "C", startDate: "2026-08-12" }),
        activity({ name: "D", startDate: "2026-08-12" }),
      ]),
      [],
    );
    const dates = findings.map((f) => f.date);
    const sorted = [...dates].sort();
    expect(dates).toEqual(sorted);
  });
});
