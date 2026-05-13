/**
 * Testes dos helpers puros de formatação do wizard (PWA).
 *
 * São funções determinísticas — fáceis de testar com I/O fixo. As datas
 * de teste usam um clock fixo via vi.useFakeTimers pra evitar flakiness
 * em cenários de idade.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ageLabel,
  avatarEmoji,
  formatBR,
} from "@/app/(app)/onboarding/_lib/format";

// Mock simples de `t` que devolve a chave + serializa params. Os testes
// se importam só com qual chave foi escolhida + qual count interpolado.
const mockT = (key: string, vars?: Record<string, string | number>) =>
  vars ? `${key}:${JSON.stringify(vars)}` : key;

describe("formatBR", () => {
  it.each([
    ["2020-05-10", "10/05/2020"],
    ["2026-01-01", "01/01/2026"],
    ["1990-12-31", "31/12/1990"],
  ])("%s → %s", (iso, expected) => {
    expect(formatBR(iso)).toBe(expected);
  });
});

describe("avatarEmoji", () => {
  it("F → 👧", () => expect(avatarEmoji("F")).toBe("👧"));
  it("M → 👦", () => expect(avatarEmoji("M")).toBe("👦"));
  it("null → 🧒", () => expect(avatarEmoji(null)).toBe("🧒"));
});

describe("ageLabel", () => {
  beforeEach(() => {
    // Clock fixo em 15/maio/2026 12:00 — garante idades determinísticas.
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-15T12:00:00Z"));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("nascido hoje → ageNewborn", () => {
    expect(ageLabel("2026-05-15", mockT)).toBe("onboardingForm.ageNewborn");
  });

  it("nascido há 1 mês → ageMonthOne (singular)", () => {
    expect(ageLabel("2026-04-15", mockT)).toBe("onboardingForm.ageMonthOne");
  });

  it("nascido há 5 meses → ageMonths com count", () => {
    expect(ageLabel("2025-12-15", mockT)).toBe(
      'onboardingForm.ageMonths:{"count":5}',
    );
  });

  it("nascido há 1 ano → ageYearOne (singular)", () => {
    expect(ageLabel("2025-05-15", mockT)).toBe("onboardingForm.ageYearOne");
  });

  it("nascido há 5 anos → ageYears com count", () => {
    expect(ageLabel("2021-05-15", mockT)).toBe(
      'onboardingForm.ageYears:{"count":5}',
    );
  });

  it("ISO inválido → string vazia", () => {
    expect(ageLabel("not-a-date", mockT)).toBe("");
  });

  it("aniversário hoje vs ontem (mesmo mês, dia adjacente)", () => {
    // 2 anos completos
    expect(ageLabel("2024-05-15", mockT)).toBe(
      'onboardingForm.ageYears:{"count":2}',
    );
    // 1 ano + ~12 meses (mas ainda <2 — não completou aniversário)
    expect(ageLabel("2024-05-16", mockT)).toBe("onboardingForm.ageYearOne");
  });
});
