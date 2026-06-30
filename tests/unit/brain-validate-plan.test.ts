import { describe, it, expect } from "vitest";
import {
  validatePlanForExecution,
  MAX_ACTIVITIES_PER_INTAKE,
} from "@/lib/ai/brain/validate-plan";
import type { ActivitySpec, MaterializationPlan } from "@/lib/ai/brain/types";

const TODAY = "2026-06-30";
const CHILD = "11111111-1111-1111-1111-111111111111";

function spec(over: Partial<ActivitySpec> = {}): ActivitySpec {
  return { childId: CHILD, name: "Prova", category: "school", startDate: "2026-08-12", ...over };
}
function plan(activities: ActivitySpec[]): MaterializationPlan {
  return { docType: "school_calendar", confirmation: "single", activities };
}

describe("validatePlanForExecution — limites e revalidação antes do commit", () => {
  it("plano válido passa", () => {
    const r = validatePlanForExecution(plan([spec(), spec({ name: "Trabalho", startDate: "2026-08-13" })]), TODAY);
    expect(r.ok).toBe(true);
    expect(r.errors).toEqual([]);
  });

  it("plano vazio falha", () => {
    const r = validatePlanForExecution(plan([]), TODAY);
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.field === "activities" && e.reason === "empty")).toBe(true);
  });

  it("acima de 20 atividades falha (limite do plano)", () => {
    const many = Array.from({ length: MAX_ACTIVITIES_PER_INTAKE + 1 }, (_, i) =>
      spec({ name: `P${i}`, startDate: "2026-08-12" }),
    );
    const r = validatePlanForExecution(plan(many), TODAY);
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.reason.startsWith("exceeds_max"))).toBe(true);
  });

  it("exatamente 20 passa (fronteira)", () => {
    const twenty = Array.from({ length: MAX_ACTIVITIES_PER_INTAKE }, (_, i) =>
      spec({ name: `P${i}`, startDate: "2026-08-12" }),
    );
    expect(validatePlanForExecution(plan(twenty), TODAY).ok).toBe(true);
  });

  it("nome ausente/vazio falha", () => {
    expect(validatePlanForExecution(plan([spec({ name: "" })]), TODAY).errors.some((e) => e.field === "name")).toBe(true);
    expect(validatePlanForExecution(plan([spec({ name: "   " })]), TODAY).errors.some((e) => e.field === "name")).toBe(true);
  });

  it("data inválida falha (cast ::date não chega à RPC)", () => {
    const r = validatePlanForExecution(plan([spec({ startDate: "2026-13-45" })]), TODAY);
    expect(r.errors.some((e) => e.field === "startDate" && e.reason === "invalid_date")).toBe(true);
  });

  it("data fora do horizonte [hoje-7d, hoje+548d] falha", () => {
    expect(
      validatePlanForExecution(plan([spec({ startDate: "2020-01-01" })]), TODAY).errors.some(
        (e) => e.reason === "out_of_horizon",
      ),
    ).toBe(true);
    expect(
      validatePlanForExecution(plan([spec({ startDate: "2030-01-01" })]), TODAY).errors.some(
        (e) => e.reason === "out_of_horizon",
      ),
    ).toBe(true);
  });

  it("childId não-UUID falha (evita cast ::uuid lançar na RPC)", () => {
    const r = validatePlanForExecution(plan([spec({ childId: "not-a-uuid" })]), TODAY);
    expect(r.errors.some((e) => e.field === "childId" && e.reason === "invalid_uuid")).toBe(true);
  });

  it("childId null é aceito (criança não resolvida)", () => {
    expect(validatePlanForExecution(plan([spec({ childId: null as unknown as string })]), TODAY).ok).toBe(true);
  });

  it("timeStart malformado falha; HH:MM válido passa", () => {
    expect(validatePlanForExecution(plan([spec({ timeStart: "25:99" })]), TODAY).errors.some((e) => e.field === "timeStart")).toBe(true);
    expect(validatePlanForExecution(plan([spec({ timeStart: "08:00" })]), TODAY).ok).toBe(true);
  });

  it("reporta o índice da atividade problemática", () => {
    const r = validatePlanForExecution(plan([spec(), spec({ startDate: "lixo" })]), TODAY);
    expect(r.errors.some((e) => e.index === 1 && e.field === "startDate")).toBe(true);
  });
});
