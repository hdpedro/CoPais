/**
 * Drift guard contra o bug F#58 (E2E PRD 2026-05-25): valores monetários
 * apareciam como "R$ 0.00" (ponto US) em vez de "R$ 0,00" (vírgula BR)
 * em /despesas. Causa: o anti-pattern `R$ ${v.toFixed(2)}` que estava
 * espalhado em ExpensesClient, DashboardClient e ~12 outros call-sites.
 *
 * Source-of-truth pra formatação é agora `src/lib/format/currency.ts`,
 * usando Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" })
 * — grouping correto + casas decimais sempre 2 + símbolo padrão.
 *
 * Este teste tranca os formatos contra regressão. Native tem versão
 * espelhada em `kindar-native/app/_src/lib/currency.ts` (Hermes inclui
 * Intl desde RN 0.74 + Expo SDK 51 — seguro usar lá também).
 */

import { describe, it, expect } from "vitest";
import { formatBRL, formatBRLAmount } from "@/lib/format/currency";

// Normaliza espaços-não-quebráveis ( ) que Intl insere entre "R$" e
// o valor — depende da versão do ICU; em CI pode aparecer espaço comum.
function norm(s: string): string {
  return s.replace(/ /g, " ");
}

describe("formatBRL — bug F#58 drift guard", () => {
  it("zero rende 'R$ 0,00' (vírgula BR, NÃO 'R$ 0.00')", () => {
    const out = norm(formatBRL(0));
    expect(out).toBe("R$ 0,00");
    expect(out).not.toContain("0.00"); // garantia explícita anti-regressão
  });

  it("valor com centavos rende com vírgula", () => {
    expect(norm(formatBRL(14.9))).toBe("R$ 14,90");
    expect(norm(formatBRL(29.99))).toBe("R$ 29,99");
  });

  it("valor >= 1000 rende com ponto de milhar", () => {
    expect(norm(formatBRL(1234.56))).toBe("R$ 1.234,56");
    expect(norm(formatBRL(1500))).toBe("R$ 1.500,00");
    expect(norm(formatBRL(1_000_000))).toBe("R$ 1.000.000,00");
  });

  it("valor negativo rende com sinal antes do símbolo", () => {
    // Intl em pt-BR usa "-R$ 50,00" (sign-symbol-amount).
    expect(norm(formatBRL(-50))).toBe("-R$ 50,00");
  });

  it("trunca/arredonda pra 2 casas (não estoura pra 3+)", () => {
    expect(norm(formatBRL(10.123))).toBe("R$ 10,12");
    expect(norm(formatBRL(10.999))).toBe("R$ 11,00");
  });
});

describe("formatBRLAmount — versão sem símbolo R$", () => {
  it("zero rende '0,00' (sem prefixo)", () => {
    expect(norm(formatBRLAmount(0))).toBe("0,00");
  });

  it("valor >= 1000 mantém ponto de milhar", () => {
    expect(norm(formatBRLAmount(1234.56))).toBe("1.234,56");
  });

  it("não contém 'R$'", () => {
    expect(norm(formatBRLAmount(50))).not.toContain("R$");
  });
});
