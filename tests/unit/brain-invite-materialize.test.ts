/* ------------------------------------------------------------------ */
/* Fatia C2 (Convites): materialização — payloads espelham o FORM Novo  */
/* Evento (multi-dia = 1 linha/dia "Título (i/N)"; event_time TEXT      */
/* "15:00 - 18:00"), hash canônico e validação defensiva pré-RPC. A     */
/* RPC (00142, NÃO aplicada) é o espelho SQL destes shapes.             */
/* ------------------------------------------------------------------ */

import { describe, it, expect } from "vitest";
import { buildInvitePayloads, buildInviteOutboxPayloads } from "@/lib/ai/brain/materialize-invite-payload";
import { validateInvitePlanForExecution } from "@/lib/ai/brain/validate-invite-plan";
import type { EventInvitePlan } from "@/lib/ai/brain/types";

const BASE: EventInvitePlan = {
  title: "Aniversário do Théo — 7 anos",
  description: "Tema dinossauros\nConfirmar presença até 05/07 com a Renata.",
  eventDate: "2026-07-12",
  endDate: null,
  timeStart: "15:00",
  timeEnd: "18:00",
  location: "Buffet Alegria — Rua X, 120",
  childId: "11111111-1111-4111-8111-111111111111",
  allDay: false,
  rsvpDeadline: "2026-07-05",
};

describe("buildInvitePayloads — espelho do form Novo Evento", () => {
  it("1 dia: 1 linha, event_time composto '15:00 - 18:00', hash canônico", () => {
    const rows = buildInvitePayloads(BASE);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      title: "Aniversário do Théo — 7 anos",
      event_date: "2026-07-12",
      end_date: null,
      event_time: "15:00 - 18:00",
      all_day: false,
      location: "Buffet Alegria — Rua X, 120",
    });
    expect(rows[0].payload_hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("multi-dia: 1 linha POR DIA com 'Título (i/N)' e end_date preenchido; hashes distintos", () => {
    const rows = buildInvitePayloads({ ...BASE, endDate: "2026-07-13", timeStart: null, timeEnd: null, allDay: true });
    expect(rows).toHaveLength(2);
    expect(rows[0].title).toBe("Aniversário do Théo — 7 anos (1/2)");
    expect(rows[1].title).toBe("Aniversário do Théo — 7 anos (2/2)");
    expect(rows[1].event_date).toBe("2026-07-13");
    expect(rows[0].end_date).toBe("2026-07-13");
    expect(rows[0].event_time).toBeNull();
    expect(rows[0].payload_hash).not.toBe(rows[1].payload_hash);
  });

  it("só timeStart: event_time simples; outbox 1 por destinatário com título+data", () => {
    const rows = buildInvitePayloads({ ...BASE, timeEnd: null });
    expect(rows[0].event_time).toBe("15:00");

    const ob = buildInviteOutboxPayloads({
      intakeId: "i1", recipientIds: ["r1", "r2"], title: BASE.title, eventDate: BASE.eventDate, childId: BASE.childId,
    });
    expect(ob).toHaveLength(2);
    expect(ob[0].payload).toMatchObject({ kind: "event_invite", title: BASE.title, event_date: "2026-07-12" });
    expect(ob[0].dedupe_key).not.toBe(ob[1].dedupe_key);
  });
});

describe("validateInvitePlanForExecution — defensiva pré-RPC", () => {
  it("plano válido passa; all-day multi-dia válido passa", () => {
    expect(validateInvitePlanForExecution(BASE)).toEqual({ ok: true });
    expect(validateInvitePlanForExecution({ ...BASE, endDate: "2026-07-13", timeStart: null, timeEnd: null, allDay: true })).toEqual({ ok: true });
  });

  it.each([
    ["bad_title", { ...BASE, title: "" }],
    ["bad_date", { ...BASE, eventDate: "12/07/2026" }],
    ["bad_span", { ...BASE, endDate: "2026-09-01" }],
    ["bad_span", { ...BASE, endDate: "2026-07-12" }],
    ["bad_time", { ...BASE, timeStart: "25:00" }],
    ["bad_time", { ...BASE, timeStart: null, timeEnd: "18:00" }],
    ["bad_child", { ...BASE, childId: "nope" }],
  ] as Array<[string, EventInvitePlan]>)("rejeita %s", (reason, plan) => {
    expect(validateInvitePlanForExecution(plan)).toEqual({ ok: false, reason });
  });
});
