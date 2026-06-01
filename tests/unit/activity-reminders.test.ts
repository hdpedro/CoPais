/**
 * activity-reminders.ts — testes do briefing matinal + smart defaults.
 *
 * Cobre:
 *  - categoryDefaultLead: tabela por categoria (medical, class, school, etc)
 *  - Mantém DEFAULT_LEAD_MINUTES = 60 pra "other" / desconhecido
 *  - Case-insensitive + trim de category
 *  - Sentinels -2 (véspera) pra saúde + aniversário
 *  - 30/60/180 pra logística/reuniões/aulas
 *
 * Não testa o cron inteiro (sendMorningBriefing) — requer mocks pesados de
 * Supabase + i18n. Fica pra próxima sprint com integration tests reais.
 */
import { describe, expect, test, vi } from "vitest";

// activity-reminders.ts é server-only (cron usa createAdminClient + APNs etc).
// Pra testar a função pura categoryDefaultLead precisamos mockar o sentinel
// "server-only" que faria throw em ambiente node test puro.
vi.mock("server-only", () => ({}));

const { categoryDefaultLead, selectReminderTone } = await import("../../src/lib/services/activity-reminders");

describe("categoryDefaultLead — smart defaults por categoria", () => {
  describe("saúde (véspera 20h BRT pra prep documento/jejum)", () => {
    test("medical → -2 (sentinel véspera)", () => {
      expect(categoryDefaultLead("medical")).toBe(-2);
    });
    test("dentist → -2", () => {
      expect(categoryDefaultLead("dentist")).toBe(-2);
    });
    test("exam → -2", () => {
      expect(categoryDefaultLead("exam")).toBe(-2);
    });
    test("health → -2", () => {
      expect(categoryDefaultLead("health")).toBe(-2);
    });
  });

  describe("aniversário (véspera pra comprar presente)", () => {
    test("birthday → -2", () => {
      expect(categoryDefaultLead("birthday")).toBe(-2);
    });
    test("anniversary → -2", () => {
      expect(categoryDefaultLead("anniversary")).toBe(-2);
    });
  });

  describe("aulas/esportes (T-3h pra uniforme + lanche)", () => {
    test("class → 180", () => {
      expect(categoryDefaultLead("class")).toBe(180);
    });
    test("lesson → 180", () => {
      expect(categoryDefaultLead("lesson")).toBe(180);
    });
    test("sport → 180", () => {
      expect(categoryDefaultLead("sport")).toBe(180);
    });
    test("extracurricular → 180", () => {
      expect(categoryDefaultLead("extracurricular")).toBe(180);
    });
  });

  describe("logística escolar (T-30min pra sair de casa)", () => {
    test("school → 30", () => {
      expect(categoryDefaultLead("school")).toBe(30);
    });
    test("pickup → 30", () => {
      expect(categoryDefaultLead("pickup")).toBe(30);
    });
    test("dropoff → 30", () => {
      expect(categoryDefaultLead("dropoff")).toBe(30);
    });
    test("daycare → 30", () => {
      expect(categoryDefaultLead("daycare")).toBe(30);
    });
  });

  describe("reuniões e contextuais (T-1h)", () => {
    test("meeting → 60", () => {
      expect(categoryDefaultLead("meeting")).toBe(60);
    });
    test("parents → 60", () => {
      expect(categoryDefaultLead("parents")).toBe(60);
    });
    test("therapy → 60", () => {
      expect(categoryDefaultLead("therapy")).toBe(60);
    });
  });

  describe("fallback (T-1h)", () => {
    test("other → 60", () => {
      expect(categoryDefaultLead("other")).toBe(60);
    });
    test("categoria desconhecida → 60", () => {
      expect(categoryDefaultLead("xyz_random")).toBe(60);
    });
    test("null → 60", () => {
      expect(categoryDefaultLead(null)).toBe(60);
    });
    test("undefined → 60", () => {
      expect(categoryDefaultLead(undefined)).toBe(60);
    });
    test("string vazia → 60", () => {
      expect(categoryDefaultLead("")).toBe(60);
    });
  });

  describe("robustez (case + trim)", () => {
    test("MEDICAL → -2", () => {
      expect(categoryDefaultLead("MEDICAL")).toBe(-2);
    });
    test("  Class  → 180 (trim + case-insensitive)", () => {
      expect(categoryDefaultLead("  Class  ")).toBe(180);
    });
    test("SCHOOL → 30", () => {
      expect(categoryDefaultLead("SCHOOL")).toBe(30);
    });
  });
});

describe("selectReminderTone — copy adaptativa por janela temporal", () => {
  describe("tomorrow (>12h ou sentinel -2)", () => {
    test("T-24h (1440) → tomorrow (fix bug Henrique 2026-06-01)", () => {
      expect(selectReminderTone(1440)).toBe("tomorrow");
    });
    test("T-13h (780) → tomorrow", () => {
      expect(selectReminderTone(780)).toBe("tomorrow");
    });
    test("T-7d (10080) → tomorrow", () => {
      expect(selectReminderTone(10080)).toBe("tomorrow");
    });
    test("sentinel véspera (-2) → tomorrow", () => {
      expect(selectReminderTone(-2)).toBe("tomorrow");
    });
  });

  describe("today (sentinel manhã do dia -1)", () => {
    test("sentinel -1 → today", () => {
      expect(selectReminderTone(-1)).toBe("today");
    });
  });

  describe("soon (60-720min)", () => {
    test("T-1h (60) → soon", () => {
      expect(selectReminderTone(60)).toBe("soon");
    });
    test("T-2h (120) → soon", () => {
      expect(selectReminderTone(120)).toBe("soon");
    });
    test("T-3h (180, smart default class) → soon", () => {
      expect(selectReminderTone(180)).toBe("soon");
    });
    test("T-12h (720) → soon (boundary)", () => {
      expect(selectReminderTone(720)).toBe("soon");
    });
  });

  describe("almostThere (<60min)", () => {
    test("T-15min → almostThere", () => {
      expect(selectReminderTone(15)).toBe("almostThere");
    });
    test("T-30min (smart default school) → almostThere", () => {
      expect(selectReminderTone(30)).toBe("almostThere");
    });
    test("T-59min → almostThere (boundary)", () => {
      expect(selectReminderTone(59)).toBe("almostThere");
    });
  });
});
