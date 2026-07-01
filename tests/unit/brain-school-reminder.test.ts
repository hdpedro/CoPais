import { describe, it, expect, vi } from "vitest";

// school-reminders.ts é server-only (cron: createAdminClient + push + i18n server).
// Só exercitamos os helpers PUROS de horário — mockamos "server-only" pra que o
// import não dê throw em node test puro (mesmo padrão de activity-reminders.test).
vi.mock("server-only", () => ({}));

const { schoolExamTriggerAt, isSchoolExamDue } = await import(
  "../../src/lib/services/school-reminders"
);

// Prova em 2026-08-13 → lembrete véspera 20:00 BRT = 2026-08-12T23:00:00Z.
const EXAM = "2026-08-13";
const TRIGGER_Z = "2026-08-12T23:00:00.000Z";

describe("schoolExamTriggerAt — véspera 20h BRT", () => {
  it("prova amanhã → 20:00 BRT da véspera", () => {
    expect(schoolExamTriggerAt(EXAM)?.toISOString()).toBe(TRIGGER_Z);
  });
  it("prova hoje → véspera é ontem 20h", () => {
    expect(schoolExamTriggerAt("2026-08-12")?.toISOString()).toBe("2026-08-11T23:00:00.000Z");
  });
});

describe("isSchoolExamDue — janela do slot (±8/7min)", () => {
  it("dispara no instante do trigger e dentro da janela", () => {
    expect(isSchoolExamDue(EXAM, new Date("2026-08-12T23:00:00Z"))).toBe(true); // exato
    expect(isSchoolExamDue(EXAM, new Date("2026-08-12T22:55:00Z"))).toBe(true); // 5min antes
    expect(isSchoolExamDue(EXAM, new Date("2026-08-12T23:05:00Z"))).toBe(true); // 5min depois
  });
  it("NÃO dispara fora da janela (cedo demais / tarde demais / outro horário)", () => {
    expect(isSchoolExamDue(EXAM, new Date("2026-08-12T22:45:00Z"))).toBe(false); // 15min antes
    expect(isSchoolExamDue(EXAM, new Date("2026-08-12T23:10:00Z"))).toBe(false); // 10min depois
    expect(isSchoolExamDue(EXAM, new Date("2026-08-12T21:00:00Z"))).toBe(false); // 18h BRT
    expect(isSchoolExamDue(EXAM, new Date("2026-08-13T12:00:00Z"))).toBe(false); // dia da prova
  });
});
