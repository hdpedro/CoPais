/* ------------------------------------------------------------------ */
/* Fatia C1 (Convites): playbook puro — SEM DATA o convite não vira     */
/* evento (nunca chuta), descrição composta (tema + linha de RSVP),     */
/* multi-dia com span sano, gate conservador e flag fail-closed. Tudo   */
/* DORMENTE (fora de ENABLED_DOC_TYPES; FEATURE_BRAIN_EVENT_INVITE OFF).*/
/* ------------------------------------------------------------------ */

import { describe, it, expect } from "vitest";
import { eventInvitePlaybook } from "@/lib/ai/brain/understanding/playbooks/event-invite";
import { getPlaybook, ENABLED_DOC_TYPES } from "@/lib/ai/brain/understanding/registry";
import { looksLikeInviteText } from "@/lib/ai/brain/exam-text-gate";
import { isEventInviteEnabled } from "@/lib/services/brain-flag";
import { parseNarrativeClassification } from "@/lib/ai/document-classifier";
import type { PlaybookContext } from "@/lib/ai/brain/types";

const CTX: PlaybookContext = {
  groupId: "g1",
  userId: "u1",
  channel: "pwa",
  today: "2026-07-02",
  timezone: "America/Sao_Paulo",
  children: [
    { id: "c-otto", name: "Otto de Pedro" },
    { id: "c-martim", name: "Martim de Pedro" },
  ] as PlaybookContext["children"],
  resolvedChildId: null,
  schoolYearAnchor: 2026,
};

function raw(over: Record<string, unknown> = {}): unknown {
  return {
    recognized_as: "event_invite",
    title: "Aniversário do Théo — 7 anos",
    eventDate: "2026-07-12",
    endDate: null,
    timeStart: "15:00",
    timeEnd: "18:00",
    location: "Buffet Alegria — Rua X, 120",
    childName: "Otto",
    theme: "Tema dinossauros · traje verde",
    rsvpDeadline: "2026-07-05",
    rsvpContact: "com a Renata (21 99999-0000)",
    ...over,
  };
}

describe("eventInvitePlaybook.parse — transportador de convites", () => {
  it("convite completo: título, horários, local, criança, descrição composta com RSVP", () => {
    const plan = eventInvitePlaybook.parse(raw(), CTX);
    expect(plan).toMatchObject({
      title: "Aniversário do Théo — 7 anos",
      eventDate: "2026-07-12",
      timeStart: "15:00",
      timeEnd: "18:00",
      location: "Buffet Alegria — Rua X, 120",
      childId: "c-otto",
      allDay: false,
      rsvpDeadline: "2026-07-05",
    });
    expect(plan?.description).toContain("Tema dinossauros");
    expect(plan?.description).toContain("Confirmar presença até 05/07 com a Renata");
  });

  it("SEM data legível → null (evento sem data não existe); data fora do horizonte → null", () => {
    expect(eventInvitePlaybook.parse(raw({ eventDate: null }), CTX)).toBeNull();
    expect(eventInvitePlaybook.parse(raw({ eventDate: "2028-01-01" }), CTX)).toBeNull();
    expect(eventInvitePlaybook.parse(raw({ eventDate: "2026-05-01" }), CTX)).toBeNull();
  });

  it("sem horário = dia inteiro; timeEnd sem timeStart cai; multi-dia com span sano", () => {
    const allDay = eventInvitePlaybook.parse(raw({ timeStart: null, timeEnd: "18:00" }), CTX);
    expect(allDay).toMatchObject({ allDay: true, timeStart: null, timeEnd: null });

    const multi = eventInvitePlaybook.parse(raw({ endDate: "2026-07-13" }), CTX);
    expect(multi?.endDate).toBe("2026-07-13");
    const spanDemais = eventInvitePlaybook.parse(raw({ endDate: "2026-08-30" }), CTX);
    expect(spanDemais?.endDate).toBeNull();
  });

  it("RSVP depois do evento cai; criança desconhecida → null (pergunta rola no fluxo padrão)", () => {
    const p = eventInvitePlaybook.parse(raw({ rsvpDeadline: "2026-07-20", childName: "Joaquim" }), CTX);
    expect(p?.rsvpDeadline).toBeNull();
    expect(p?.childId).toBeNull();
  });

  it("plan(): docType event_invite + invite embutido + collabRecordType event", () => {
    const parsed = eventInvitePlaybook.parse(raw(), CTX)!;
    const plan = eventInvitePlaybook.plan(parsed);
    expect(plan).toMatchObject({ docType: "event_invite", confirmation: "single", collabRecordType: "event" });
    expect(plan.invite?.title).toContain("Théo");
  });
});

describe("registro DORMENTE + gate + flag + porta única", () => {
  it("registrado com FOTO e TEXTO, fora de ENABLED_DOC_TYPES", () => {
    const pb = getPlaybook("event_invite");
    expect(pb?.extractionPrompt?.system).toContain("CONVITE");
    expect(pb?.textExtractionPrompt?.system).toContain("convite");
    expect(ENABLED_DOC_TYPES).not.toContain("event_invite");
  });

  it.each([
    "chegou o convite do aniversário do Théo, sábado 12/07",
    "festa junina da escola dia 20",
    "reunião de pais quinta-feira",
    "campeonato de futsal do Martim sábado e domingo",
  ])("gate captura: %s", (s) => {
    expect(looksLikeInviteText(s)).toBe(true);
  });

  it.each([
    ["pergunta", "quando é a festa do Théo?"],
    ["sem ocasião", "sábado a gente se vê"],
    ["sem data", "chegou um convite de aniversário"],
  ])("gate NÃO captura (%s): %s", (_n, s) => {
    expect(looksLikeInviteText(s)).toBe(false);
  });

  it("flag fail-closed; porta única aceita event_invite", () => {
    delete process.env.FEATURE_BRAIN_EVENT_INVITE;
    expect(isEventInviteEnabled()).toBe(false);
    const r = parseNarrativeClassification('{"intents":[{"type":"event_invite","confidence":0.9}]}');
    expect(r.intents[0]).toEqual({ type: "event_invite", confidence: 0.9 });
  });
});
