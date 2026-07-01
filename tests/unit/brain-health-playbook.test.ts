/* ------------------------------------------------------------------ */
/* brain-health-playbook — núcleo PURO do Playbook de Saúde             */
/*                                                                     */
/* Trava o comportamento do parse/plan e as SALVAGUARDAS (transportador */
/* nunca assistente): dose/frequência null quando não ditas (nunca      */
/* inventa), retorno relativo→absoluto, diagnóstico só citado, episódio */
/* só quando há achado. Playbook REAL, sem I/O.                         */
/* ------------------------------------------------------------------ */

import { describe, it, expect } from "vitest";
import {
  healthVisitPlaybook,
  resolveFollowUpDate,
  parseFrequencyHours,
} from "@/lib/ai/brain/understanding/playbooks/health-visit";
import type { PlaybookContext } from "@/lib/ai/brain/types";

const CHILD = "11111111-1111-1111-1111-111111111111";

function ctx(over: Partial<PlaybookContext> = {}): PlaybookContext {
  return {
    groupId: "g1",
    userId: "u1",
    channel: "pwa",
    today: "2026-07-01",
    timezone: "America/Sao_Paulo",
    children: [{ id: CHILD, name: "Otto" }],
    resolvedChildId: CHILD,
    schoolYearAnchor: 2026,
    ...over,
  } as PlaybookContext;
}

/** Payload típico da cena do dono: "consulta boa, alergia leve, remédio 7 dias, retorno dia 5". */
function visitPayload(over: Record<string, unknown> = {}) {
  return {
    recognized_as: "health_visit",
    consultation_date: "2026-07-01",
    child_name_hint: "Otto",
    appointment: {
      type: "rotina",
      professional_name: "Dra. Ana",
      specialty: "Pediatria",
      location: null,
      time: null,
      summary: "Disse que é alergia leve, observar evolução",
    },
    diagnosis: "Alergia leve",
    symptoms: ["coceira"],
    severity: "leve",
    medications: [
      {
        name: "Amoxicilina",
        dosage: "500 mg",
        frequency: "a cada 8h",
        duration_days: 7,
        reason: "para otite",
        prescribed_by: "Dra. Ana",
        care_type: "medication",
      },
    ],
    follow_up: { date: "2026-08-05", raw: "retorno em um mês, já marquei dia 5" },
    exam_requests: [],
    ...over,
  };
}

describe("healthVisitPlaybook.parse — normalização + salvaguardas", () => {
  it("consulta completa → dados normalizados (citação, dose explícita, retorno ISO)", () => {
    const d = healthVisitPlaybook.parse(visitPayload(), ctx());
    expect(d).not.toBeNull();
    if (!d) return;
    expect(d.consultationDate).toBe("2026-07-01");
    expect(d.diagnosis).toBe("Alergia leve");
    expect(d.severity).toBe("leve");
    expect(d.medications).toHaveLength(1);
    expect(d.medications[0].dosage).toBe("500 mg");
    expect(d.medications[0].frequencyHours).toBe(8);
    expect(d.medications[0].durationDays).toBe(7);
    expect(d.followUpDate).toBe("2026-08-05");
  });

  it("recognized_as != health_visit → null (não força)", () => {
    expect(healthVisitPlaybook.parse(visitPayload({ recognized_as: "unknown" }), ctx())).toBeNull();
  });

  it("consulta SEM nenhum sinal (só rótulo) → null (extração falhou)", () => {
    const empty = {
      recognized_as: "health_visit",
      appointment: { type: "rotina", summary: null },
      diagnosis: null,
      symptoms: [],
      medications: [],
      follow_up: null,
      exam_requests: [],
    };
    expect(healthVisitPlaybook.parse(empty, ctx())).toBeNull();
  });

  it("SALVAGUARDA: remédio sem dose/frequência → campos null (NUNCA inventa cadência)", () => {
    const d = healthVisitPlaybook.parse(
      visitPayload({
        medications: [{ name: "Xarope", dosage: null, frequency: null, care_type: "medication" }],
      }),
      ctx(),
    );
    expect(d).not.toBeNull();
    if (!d) return;
    expect(d.medications[0].dosage).toBeNull();
    expect(d.medications[0].frequency).toBeNull();
    expect(d.medications[0].frequencyHours).toBeNull();
  });

  it("consultation_date ausente → cai no hoje do contexto", () => {
    const d = healthVisitPlaybook.parse(visitPayload({ consultation_date: null }), ctx({ today: "2026-07-10" }));
    expect(d?.consultationDate).toBe("2026-07-10");
  });

  it("descarta medicação sem nome + severity fora do enum vira null", () => {
    const d = healthVisitPlaybook.parse(
      visitPayload({
        severity: "severe", // enum inglês inválido → null (evita INSERT quebrado)
        medications: [{ name: null, dosage: "10ml" }, { name: "Dipirona", dosage: "500mg", frequency: "a cada 6h" }],
      }),
      ctx(),
    );
    expect(d?.severity).toBeNull();
    expect(d?.medications).toHaveLength(1);
    expect(d?.medications[0].name).toBe("Dipirona");
    expect(d?.medications[0].frequencyHours).toBe(6);
  });
});

describe("healthVisitPlaybook.plan — materialização declarativa", () => {
  it("cena completa → appointment + episode + medication(endDate) + followUp + collabRecordType", () => {
    const d = healthVisitPlaybook.parse(visitPayload(), ctx());
    const plan = healthVisitPlaybook.plan(d!, ctx());
    expect(plan.docType).toBe("health_visit");
    expect(plan.confirmation).toBe("single");
    expect(plan.collabRecordType).toBe("medical_appointment");
    const h = plan.health!;
    expect(h.appointment.childId).toBe(CHILD);
    expect(h.appointment.title).toBe("Consulta — Pediatria"); // rotina + especialidade
    expect(h.appointment.summary).toContain("alergia leve");
    expect(h.episode?.title).toBe("Alergia leve");
    expect(h.medications).toHaveLength(1);
    expect(h.medications![0].endDate).toBe("2026-07-08"); // 01/07 + 7 dias
    expect(h.followUp?.date).toBe("2026-08-05");
  });

  it("consulta de rotina SEM achado → sem episódio (não cria doença à toa)", () => {
    const d = healthVisitPlaybook.parse(
      visitPayload({
        diagnosis: null,
        symptoms: [],
        appointment: { type: "rotina", summary: "Tudo bem, desenvolvimento normal" },
        medications: [],
        follow_up: null,
      }),
      ctx(),
    );
    const plan = healthVisitPlaybook.plan(d!, ctx());
    expect(plan.health?.episode ?? null).toBeNull();
    expect(plan.health?.appointment.summary).toContain("desenvolvimento normal");
  });

  it("SALVAGUARDA: dose null → lowConfidenceFields marca dosage/frequency (pede revisão)", () => {
    const d = healthVisitPlaybook.parse(
      visitPayload({ medications: [{ name: "Xarope", dosage: null, frequency: null, care_type: "medication" }] }),
      ctx(),
    );
    const plan = healthVisitPlaybook.plan(d!, ctx());
    const med = plan.health!.medications![0];
    expect(med.dosage).toBeNull();
    expect(med.lowConfidenceFields).toContain("dosage");
    expect(med.lowConfidenceFields).toContain("frequency");
  });

  it("criança não resolvida → lowConfidence childId no appointment e nas medicações", () => {
    const d = healthVisitPlaybook.parse(visitPayload(), ctx({ resolvedChildId: null, children: [{ id: "a", name: "Otto" }, { id: "b", name: "Lia" }] }));
    const plan = healthVisitPlaybook.plan(d!, ctx({ resolvedChildId: null }));
    expect(plan.health!.appointment.childId).toBeNull();
    expect(plan.health!.appointment.lowConfidenceFields).toContain("childId");
    expect(plan.health!.medications![0].lowConfidenceFields).toContain("childId");
  });

  it("exames solicitados viram citação no resumo (A0 sem tabela dedicada)", () => {
    const d = healthVisitPlaybook.parse(visitPayload({ exam_requests: ["hemograma", "urina tipo 1"] }), ctx());
    const plan = healthVisitPlaybook.plan(d!, ctx());
    expect(plan.health!.appointment.summary).toContain("Exames solicitados: hemograma, urina tipo 1");
  });
});

describe("resolveFollowUpDate — retorno relativo→absoluto (transporte, não interpretação)", () => {
  it("ISO do modelo vence", () => {
    expect(resolveFollowUpDate("2026-08-05", "em 1 mês", "2026-07-01")).toBe("2026-08-05");
  });
  it("relativo 'em 15 dias' resolve contra a data da consulta", () => {
    expect(resolveFollowUpDate(null, "retorno em 15 dias", "2026-07-01")).toBe("2026-07-16");
  });
  it("relativo 'em 2 semanas'", () => {
    expect(resolveFollowUpDate(null, "voltar em 2 semanas", "2026-07-01")).toBe("2026-07-15");
  });
  it("relativo 'em 1 mês' ≈ 30 dias", () => {
    expect(resolveFollowUpDate(null, "em 1 mês", "2026-07-01")).toBe("2026-07-31");
  });
  it("sem data e sem padrão relativo → null (não chuta)", () => {
    expect(resolveFollowUpDate(null, "quando precisar", "2026-07-01")).toBeNull();
  });
});

describe("parseFrequencyHours — só transcreve intervalo numérico explícito", () => {
  it("'a cada 8h' → 8", () => expect(parseFrequencyHours("a cada 8h")).toBe(8));
  it("'8/8h' → 8", () => expect(parseFrequencyHours("8/8h")).toBe(8));
  it("'de 8 em 8 horas' → 8", () => expect(parseFrequencyHours("de 8 em 8 horas")).toBe(8));
  it("'3x ao dia' → null (conservador, não interpreta)", () => expect(parseFrequencyHours("3x ao dia")).toBeNull());
  it("'se necessário' → null", () => expect(parseFrequencyHours("se necessário")).toBeNull());
  it("null → null", () => expect(parseFrequencyHours(null)).toBeNull());
});
