import { describe, it, expect } from "vitest";
import { canonicalize, computePlanHash } from "@/lib/ai/brain/plan-hash";

describe("brain plan-hash — canônico e versionado", () => {
  it("ordem das chaves não muda o hash (canônico)", () => {
    const a = { plan: { b: 1, a: 2, nested: { y: 1, x: 2 } }, playbookVersion: 1, policyVersion: 1 };
    const b = { plan: { nested: { x: 2, y: 1 }, a: 2, b: 1 }, playbookVersion: 1, policyVersion: 1 };
    expect(computePlanHash(a)).toBe(computePlanHash(b));
  });

  it("ordem de array MUDA o hash (ordem é semântica)", () => {
    const a = { plan: { items: [1, 2, 3] }, playbookVersion: 1, policyVersion: 1 };
    const b = { plan: { items: [3, 2, 1] }, playbookVersion: 1, policyVersion: 1 };
    expect(computePlanHash(a)).not.toBe(computePlanHash(b));
  });

  it("playbook_version diferente → hash diferente (rastreabilidade)", () => {
    const plan = { activities: [{ name: "Prova de Matemática" }] };
    const v1 = computePlanHash({ plan, playbookVersion: 1, policyVersion: 1 });
    const v2 = computePlanHash({ plan, playbookVersion: 2, policyVersion: 1 });
    expect(v1).not.toBe(v2);
  });

  it("policy_version diferente → hash diferente (regra nova não confirma plano antigo)", () => {
    const plan = { activities: [{ name: "Prova" }] };
    const p1 = computePlanHash({ plan, playbookVersion: 1, policyVersion: 1 });
    const p2 = computePlanHash({ plan, playbookVersion: 1, policyVersion: 2 });
    expect(p1).not.toBe(p2);
  });

  it("hash é sha256 hex estável (determinístico, mesma entrada → mesma saída)", () => {
    const input = { plan: { a: 1 }, playbookVersion: 1, policyVersion: 1 };
    const h = computePlanHash(input);
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(computePlanHash(input)).toBe(h);
  });

  it("canonicalize omite undefined (paridade com JSON.stringify)", () => {
    expect(canonicalize({ a: 1, b: undefined })).toBe(canonicalize({ a: 1 }));
  });
});
