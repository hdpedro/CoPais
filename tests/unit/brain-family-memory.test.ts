/* ------------------------------------------------------------------ */
/* Memória da Família (Fase 3, M1) — detector retrospectivo PURO.       */
/* Fatos → findings 'info' factuais; nada de alarme, nada de invenção.  */
/* ------------------------------------------------------------------ */

import { describe, it, expect } from "vitest";
import { analyzeRetroImpact, renderMemoryLines, type FamilyMemorySnapshot, EMPTY_MEMORY } from "@/lib/ai/brain/family-memory";
import type { ImpactFinding, MaterializationPlan } from "@/lib/ai/brain/types";

const OTTO = "11111111-1111-4111-8111-111111111111";

function healthPlan(date: string, childId: string | null = OTTO): MaterializationPlan {
  return {
    docType: "health_visit",
    health: { appointment: { childId, title: "Consulta — Pediatria", appointmentType: "rotina", date } },
  } as unknown as MaterializationPlan;
}

function expensePlan(category: string, expenseDate: string): MaterializationPlan {
  return {
    docType: "expense",
    expense: { items: [{ description: "Tênis", amount: 120, category, childId: OTTO, expenseDate, splitHint: null }] },
  } as unknown as MaterializationPlan;
}

function invitePlan(eventDate: string, childId: string | null = OTTO): MaterializationPlan {
  return {
    docType: "event_invite",
    invite: { title: "Festa", description: null, eventDate, endDate: null, timeStart: null, timeEnd: null, location: null, childId, allDay: true },
  } as unknown as MaterializationPlan;
}

describe("analyzeRetroImpact — saúde", () => {
  it("última consulta ANTERIOR vira contexto (com fonte)", () => {
    const memory: FamilyMemorySnapshot = {
      lastVisit: { childId: OTTO, date: "2026-04-10", title: "Consulta", professional: "Dra. Ana", recordId: "rec-1" },
    };
    const out = analyzeRetroImpact(healthPlan("2026-07-02"), memory);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      kind: "last_visit_context",
      severity: "info",
      relatedRecordId: "rec-1",
      titleVars: { lastDate: "2026-04-10", provider: " (Dra. Ana)" },
    });
  });
  it("consulta 'última' NO MESMO DIA ou depois → nada (guard)", () => {
    const memory: FamilyMemorySnapshot = {
      lastVisit: { childId: OTTO, date: "2026-07-02", title: "x", professional: null, recordId: "r" },
    };
    expect(analyzeRetroImpact(healthPlan("2026-07-02"), memory)).toHaveLength(0);
  });
  it("criança diferente → nada", () => {
    const memory: FamilyMemorySnapshot = {
      lastVisit: { childId: "outra", date: "2026-04-10", title: "x", professional: null, recordId: "r" },
    };
    expect(analyzeRetroImpact(healthPlan("2026-07-02"), memory)).toHaveLength(0);
  });
  it("retorno marcado perto da consulta → followup_candidate", () => {
    const memory: FamilyMemorySnapshot = {
      pendingReturn: { childId: OTTO, returnDate: "2026-07-05", recordId: "rec-2" },
    };
    const out = analyzeRetroImpact(healthPlan("2026-07-02"), memory);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ kind: "followup_candidate", severity: "info", titleVars: { date: "2026-07-05" } });
  });
});

describe("analyzeRetroImpact — despesas e convite", () => {
  it("categoria repetida no mês → é a Nª (N = existentes + a nova)", () => {
    const memory: FamilyMemorySnapshot = {
      expenseMonth: [{ category: "sport", count: 3, totalFormatted: "480,00" }],
    };
    const out = analyzeRetroImpact(expensePlan("sport", "2026-07-02"), memory);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ kind: "expense_month_context", titleVars: { n: 4, total: "480,00" } });
  });
  it("categoria sem histórico no mês → nada", () => {
    expect(analyzeRetroImpact(expensePlan("health", "2026-07-02"), EMPTY_MEMORY)).toHaveLength(0);
  });
  it("semana cheia (≥2) da MESMA criança → busy_week_context", () => {
    const memory: FamilyMemorySnapshot = { busyWeek: { childId: OTTO, count: 3 } };
    const out = analyzeRetroImpact(invitePlan("2026-07-11"), memory);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ kind: "busy_week_context", titleVars: { count: 3 } });
  });
  it("semana com 1 só → silêncio (memória não vira ruído)", () => {
    const memory: FamilyMemorySnapshot = { busyWeek: { childId: OTTO, count: 1 } };
    expect(analyzeRetroImpact(invitePlan("2026-07-11"), memory)).toHaveLength(0);
  });
});

describe("renderMemoryLines", () => {
  const t = (key: string, vars?: Record<string, string | number>) => `${key}|${JSON.stringify(vars)}`;
  it("filtra só kinds de memória e formata datas em DD/MM", () => {
    const impacts: ImpactFinding[] = [
      { kind: "same_day", severity: "attention", date: "2026-07-02", childId: OTTO, titleKey: "brain.impact.sameDay" },
      {
        kind: "last_visit_context",
        severity: "info",
        date: "2026-07-02",
        childId: OTTO,
        titleKey: "brain.impact.lastVisitContext",
        titleVars: { lastDate: "2026-04-10", provider: "" },
      },
    ];
    const lines = renderMemoryLines(impacts, "Otto", t);
    expect(lines).toHaveLength(1);
    expect(lines[0].startsWith("💭 ")).toBe(true);
    expect(lines[0]).toContain('"lastDate":"10/04"');
    expect(lines[0]).toContain('"child":"Otto"');
  });
  it("sem findings de memória → vazio (canais não mudam nada)", () => {
    expect(renderMemoryLines([], "Otto", t)).toHaveLength(0);
  });
});
