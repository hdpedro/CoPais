import { describe, it, expect } from "vitest";
import {
  schoolCalendarPlaybook,
  resolveExamDate,
} from "@/lib/ai/brain/understanding/playbooks/school-calendar";
import type { PlaybookContext } from "@/lib/ai/brain/types";

const CHILD = "11111111-1111-1111-1111-111111111111";

function ctx(over: Partial<PlaybookContext> = {}): PlaybookContext {
  return {
    groupId: "g1",
    userId: "u1",
    channel: "pwa",
    today: "2026-06-30",
    timezone: "America/Sao_Paulo",
    children: [{ id: CHILD, name: "Martim" }],
    resolvedChildId: CHILD,
    schoolYearAnchor: 2026,
    ...over,
  };
}

function exam(over: Record<string, unknown> = {}) {
  return {
    subject: "Matemática",
    date: "2026-08-12",
    type: "prova",
    content: "Capítulos 3 e 4",
    materials: ["calculadora"],
    time: "08:00",
    date_confidence: 0.9,
    name_confidence: 0.95,
    ...over,
  };
}

function payload(over: Record<string, unknown> = {}) {
  return { recognized_as: "school_calendar", school_year: 2026, child_name_hint: "Martim", exams: [exam()], ...over };
}

describe("resolveExamDate", () => {
  it("ISO válido passa; ISO irreal → null", () => {
    expect(resolveExamDate("2026-08-12", 2026)).toBe("2026-08-12");
    expect(resolveExamDate("2026-02-31", 2026)).toBeNull();
  });
  it("DD/MM resolve com o ano letivo", () => {
    expect(resolveExamDate("12/08", 2026)).toBe("2026-08-12");
    expect(resolveExamDate("5/9", 2026)).toBe("2026-09-05");
  });
  it("DD/MM/YYYY usa o ano explícito", () => {
    expect(resolveExamDate("12/08/2027", 2026)).toBe("2027-08-12");
  });
  it("lixo → null (nunca chuta)", () => {
    expect(resolveExamDate("amanhã", 2026)).toBeNull();
    expect(resolveExamDate(null, 2026)).toBeNull();
  });
});

describe("schoolCalendarPlaybook.parse — validação estrita", () => {
  it("recognized_as != school_calendar → null (unknown_document)", () => {
    expect(schoolCalendarPlaybook.parse(payload({ recognized_as: "unknown" }), ctx())).toBeNull();
  });
  it("payload não-objeto / exams não-array → null", () => {
    expect(schoolCalendarPlaybook.parse(null, ctx())).toBeNull();
    expect(schoolCalendarPlaybook.parse("x", ctx())).toBeNull();
    expect(schoolCalendarPlaybook.parse(payload({ exams: "nope" }), ctx())).toBeNull();
  });
  it("descarta exame sem matéria; sem nenhum exame válido → null", () => {
    const r = schoolCalendarPlaybook.parse(payload({ exams: [exam(), { date: "2026-08-12" }] }), ctx());
    expect(r?.exams).toHaveLength(1);
    expect(schoolCalendarPlaybook.parse(payload({ exams: [{ date: "2026-08-12" }] }), ctx())).toBeNull();
  });
  it("normaliza data DD/MM e tipo desconhecido vira 'outro'", () => {
    const r = schoolCalendarPlaybook.parse(payload({ exams: [exam({ date: "13/08", type: "xpto" })] }), ctx());
    expect(r?.exams[0].isoDate).toBe("2026-08-13");
    expect(r?.exams[0].type).toBe("outro");
  });
  it("time inválido vira null; materials não-array vira []", () => {
    const r = schoolCalendarPlaybook.parse(payload({ exams: [exam({ time: "25:99", materials: "x" })] }), ctx());
    expect(r?.exams[0].time).toBeNull();
    expect(r?.exams[0].materials).toEqual([]);
  });

  it("limita o tamanho de matéria/conteúdo (saída de LLM longa)", () => {
    const longSubject = "M".repeat(300);
    const longContent = "C".repeat(5000);
    const r = schoolCalendarPlaybook.parse(payload({ exams: [exam({ subject: longSubject, content: longContent })] }), ctx());
    expect(r?.exams[0].subject.length).toBe(120);
    expect((r?.exams[0].content ?? "").length).toBe(2000);
  });
});

describe("schoolCalendarPlaybook.parse — confiança composta", () => {
  it("data 2023 com ano letivo 2026 → confiança BAIXA apesar de LLM 0.9", () => {
    const r = schoolCalendarPlaybook.parse(
      payload({ school_year: 2026, exams: [exam({ date: "2023-08-12", date_confidence: 0.9 })] }),
      ctx(),
    );
    expect(r?.exams[0].dateConfidence.level).toBe("low");
  });
  it("data inválida → isoDate null + confiança baixa", () => {
    const r = schoolCalendarPlaybook.parse(payload({ exams: [exam({ date: "lixo", date_confidence: 0.9 })] }), ctx());
    expect(r?.exams[0].isoDate).toBeNull();
    expect(r?.exams[0].dateConfidence.level).toBe("low");
  });
  it("data boa + LLM alto → confiança alta", () => {
    const r = schoolCalendarPlaybook.parse(payload({ exams: [exam({ date: "2026-08-12", date_confidence: 0.9 })] }), ctx());
    expect(r?.exams[0].dateConfidence.level).toBe("high");
  });
});

describe("schoolCalendarPlaybook.plan", () => {
  it("monta atividades só p/ exames com data; lembrete véspera 20h IANA do grupo", () => {
    const data = schoolCalendarPlaybook.parse(payload(), ctx())!;
    const plan = schoolCalendarPlaybook.plan(data, ctx());
    expect(plan.docType).toBe("school_calendar");
    expect(plan.activities).toHaveLength(1);
    const a = plan.activities![0];
    expect(a.name).toBe("Prova de Matemática");
    expect(a.category).toBe("school");
    expect(a.startDate).toBe("2026-08-12");
    expect(a.childId).toBe(CHILD);
    expect(a.subject).toBe("Matemática");
    expect(a.activityType).toBe("prova");
    expect(a.checklist).toEqual(["calculadora"]);
    expect(a.notes).toBe("Capítulos 3 e 4");
    expect(a.reminderRule).toEqual({ type: "previous_day_at_time", time: "20:00", timezone: "America/Sao_Paulo" });
    expect(a.reminderRouting).toBe("auto");
  });

  it("exame sem data resolvível NÃO entra no plano (vai pro 'precisa confirmar')", () => {
    const data = schoolCalendarPlaybook.parse(payload({ exams: [exam(), exam({ subject: "História", date: "lixo" })] }), ctx())!;
    const plan = schoolCalendarPlaybook.plan(data, ctx());
    expect(plan.activities).toHaveLength(1);
    expect(plan.activities![0].subject).toBe("Matemática");
  });

  it("data de confiança média marca startDate em lowConfidenceFields", () => {
    // sem ano explícito + horizonte ok, mas LLM médio → não-high
    const data = schoolCalendarPlaybook.parse(payload({ exams: [exam({ date: "12/08", date_confidence: 0.65 })] }), ctx())!;
    const plan = schoolCalendarPlaybook.plan(data, ctx());
    expect(plan.activities![0].lowConfidenceFields).toContain("startDate");
  });

  it("criança não resolvida → childId null + flag de revisão", () => {
    const data = schoolCalendarPlaybook.parse(payload(), ctx({ resolvedChildId: null }))!;
    const plan = schoolCalendarPlaybook.plan(data, ctx({ resolvedChildId: null }));
    expect(plan.activities![0].childId).toBeNull();
    expect(plan.activities![0].lowConfidenceFields).toContain("childId");
  });
});
