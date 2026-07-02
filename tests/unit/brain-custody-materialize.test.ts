/* ------------------------------------------------------------------ */
/* Materialização de guarda/rotina (Fatia N2, parte pura): payloads +   */
/* hashes + roteamento de governança — externo vira NOTE (nunca membro),*/
/* troca vira swap_request pending, permanente vira PROPOSTA (sem       */
/* tabela), outbox por destinatário. + validação defensiva pré-RPC.     */
/* ------------------------------------------------------------------ */

import { describe, it, expect } from "vitest";
import {
  buildCustodyEventPayloads,
  buildLegOverridePayloads,
  buildSwapRequestPayloads,
  buildSlotChangeProposals,
  buildCustodyOutboxPayloads,
  buildCustodyPayloads,
} from "@/lib/ai/brain/materialize-custody-payload";
import { validateCustodyPlanForExecution } from "@/lib/ai/brain/validate-custody-plan";
import type { CustodyRoutinePlan } from "@/lib/ai/brain/types";

const PAI = "11111111-1111-1111-1111-111111111111";
const MAE = "22222222-2222-2222-2222-222222222222";
const OTTO = "33333333-3333-3333-3333-333333333333";
const MARTIM = "44444444-4444-4444-4444-444444444444";

function plan(items: CustodyRoutinePlan["items"]): CustodyRoutinePlan {
  return { items };
}

describe("buildCustodyEventPayloads — exceção e férias", () => {
  it("exceção com 2 crianças → 2 linhas custody_type=exception com hash", () => {
    const p = plan([
      {
        kind: "custody_exception",
        childIds: [OTTO, MARTIM],
        startDate: "2026-07-08",
        endDate: "2026-07-12",
        responsible: { memberId: PAI, label: "Henrique" },
        reason: "Fernanda viaja",
      },
    ]);
    const rows = buildCustodyEventPayloads(p);
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.child_id).sort()).toEqual([OTTO, MARTIM].sort());
    expect(rows[0].custody_type).toBe("exception");
    expect(rows[0].notes).toBe("Fernanda viaja");
    expect(rows[0].payload_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(rows[0].payload_hash).not.toBe(rows[1].payload_hash); // criança entra no hash
  });

  it("férias família-toda (childIds null) → UMA linha child_id null", () => {
    const p = plan([
      {
        kind: "vacation",
        childIds: null,
        startDate: "2026-07-15",
        endDate: "2026-07-30",
        responsible: { memberId: MAE, label: "Fernanda" },
        notes: "praia",
      },
    ]);
    const rows = buildCustodyEventPayloads(p);
    expect(rows).toHaveLength(1);
    expect(rows[0].child_id).toBeNull();
    expect(rows[0].custody_type).toBe("vacation");
  });
});

describe("buildLegOverridePayloads — pessoa externa vira NOTE, nunca membro", () => {
  it("'a avó busca às 15:00' → responsible = NARRADOR + note com a verdade humana", () => {
    const p = plan([
      {
        kind: "leg_override",
        childIds: [OTTO],
        date: "2026-07-09",
        leg: "pickup",
        responsible: { memberId: null, label: "a avó" },
        time: "15:00",
        note: null,
      },
    ]);
    const rows = buildLegOverridePayloads(p, PAI);
    expect(rows).toHaveLength(1);
    expect(rows[0].responsible_id).toBe(PAI); // narrador responde no app
    expect(rows[0].note).toBe("Quem busca: a avó — às 15:00");
  });

  it("membro resolvido → responsible = membro, note só o que foi dito", () => {
    const p = plan([
      {
        kind: "leg_override",
        childIds: [OTTO],
        date: "2026-07-09",
        leg: "dropoff",
        responsible: { memberId: MAE, label: "Fernanda" },
        time: null,
        note: "leva mais cedo",
      },
    ]);
    const rows = buildLegOverridePayloads(p, PAI);
    expect(rows[0].responsible_id).toBe(MAE);
    expect(rows[0].note).toBe("leva mais cedo");
  });
});

describe("buildSwapRequestPayloads / buildSlotChangeProposals — governança", () => {
  it("troca → swap_request (o fluxo bilateral existente decide)", () => {
    const p = plan([
      {
        kind: "swap_proposal",
        childIds: [OTTO],
        originalDate: "2026-07-04",
        proposedDate: null,
        counterpart: { memberId: MAE, label: "Fernanda" },
        reason: "compromisso",
      },
    ]);
    const rows = buildSwapRequestPayloads(p);
    expect(rows).toHaveLength(1);
    expect(rows[0].target_user_id).toBe(MAE);
    expect(rows[0].proposed_date).toBeNull();
  });

  it("mudança permanente → PROPOSTA (payload próprio, sem linha de tabela)", () => {
    const p = plan([
      {
        kind: "slot_change",
        childIds: [OTTO, MARTIM],
        weekday: 1,
        leg: "dropoff",
        responsible: { memberId: PAI, label: "Henrique" },
        time: "07:30",
      },
    ]);
    const rows = buildSlotChangeProposals(p);
    expect(rows).toHaveLength(1);
    expect(rows[0].weekday).toBe(1);
    expect(rows[0].child_ids.sort()).toEqual([OTTO, MARTIM].sort());
    expect(rows[0].payload_hash).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("buildCustodyOutboxPayloads — coordenação por destinatário", () => {
  it("1 collab_notify por destinatário, dedupe_key estável, contagens no payload", () => {
    const rows = buildCustodyOutboxPayloads({
      intakeId: "intake-1",
      recipientIds: [MAE, MAE, PAI],
      appliedCount: 2,
      swapProposalCount: 1,
      slotProposalCount: 0,
    });
    expect(rows).toHaveLength(2); // dedup do destinatário repetido
    expect(rows[0].event_type).toBe("collab_notify");
    expect(rows[0].payload.kind).toBe("custody_routine");
    expect(rows[0].payload.applied_count).toBe(2);
    expect(rows[0].payload.swap_proposal_count).toBe(1);
    expect(rows[0].dedupe_key).not.toBe(rows[1].dedupe_key);
  });
});

describe("buildCustodyPayloads — narrativa mista roteia cada item", () => {
  it("exceção + avó busca + troca + permanente → 4 baldes certos", () => {
    const p = plan([
      {
        kind: "custody_exception",
        childIds: [OTTO],
        startDate: "2026-07-06",
        endDate: "2026-07-10",
        responsible: { memberId: PAI, label: "Henrique" },
        reason: null,
      },
      {
        kind: "leg_override",
        childIds: [OTTO],
        date: "2026-07-09",
        leg: "pickup",
        responsible: { memberId: null, label: "a avó" },
        time: null,
        note: null,
      },
      {
        kind: "swap_proposal",
        childIds: [OTTO],
        originalDate: "2026-07-11",
        proposedDate: "2026-07-18",
        counterpart: { memberId: MAE, label: "Fernanda" },
        reason: null,
      },
      {
        kind: "slot_change",
        childIds: [OTTO],
        weekday: 1,
        leg: "dropoff",
        responsible: { memberId: MAE, label: "Fernanda" },
        time: null,
      },
    ]);
    const b = buildCustodyPayloads(p, PAI);
    expect(b.custodyEvents).toHaveLength(1);
    expect(b.legOverrides).toHaveLength(1);
    expect(b.swapRequests).toHaveLength(1);
    expect(b.slotProposals).toHaveLength(1);
  });
});

describe("validateCustodyPlanForExecution — defesa pré-RPC", () => {
  const VALID: CustodyRoutinePlan = {
    items: [
      {
        kind: "custody_exception",
        childIds: [OTTO],
        startDate: "2026-07-08",
        endDate: "2026-07-12",
        responsible: { memberId: PAI, label: "H" },
        reason: null,
      },
    ],
  };

  it("plano válido passa; vazio/nulo não", () => {
    expect(validateCustodyPlanForExecution(VALID).ok).toBe(true);
    expect(validateCustodyPlanForExecution({ items: [] }).ok).toBe(false);
    expect(validateCustodyPlanForExecution(null).ok).toBe(false);
  });

  it("guarda com responsible não-membro (memberId null) → rejeita", () => {
    const bad: CustodyRoutinePlan = {
      items: [{ ...VALID.items[0], responsible: { memberId: null, label: "a avó" } } as CustodyRoutinePlan["items"][0]],
    };
    const r = validateCustodyPlanForExecution(bad);
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("exception_responsible");
  });

  it("range invertido, uuid inválido e weekday fora do range → rejeitam", () => {
    expect(
      validateCustodyPlanForExecution({
        items: [{ ...VALID.items[0], startDate: "2026-07-12", endDate: "2026-07-08" } as CustodyRoutinePlan["items"][0]],
      }).ok,
    ).toBe(false);
    expect(
      validateCustodyPlanForExecution({
        items: [{ ...VALID.items[0], childIds: ["not-a-uuid"] } as CustodyRoutinePlan["items"][0]],
      }).ok,
    ).toBe(false);
    expect(
      validateCustodyPlanForExecution({
        items: [
          {
            kind: "slot_change",
            childIds: [OTTO],
            weekday: 7,
            leg: "dropoff",
            responsible: { memberId: PAI, label: "H" },
            time: null,
          },
        ],
      }).ok,
    ).toBe(false);
  });

  it("override com externo passa (payload resolve) e time inválido rejeita", () => {
    const ok = validateCustodyPlanForExecution({
      items: [
        {
          kind: "leg_override",
          childIds: [OTTO],
          date: "2026-07-09",
          leg: "pickup",
          responsible: { memberId: null, label: "a avó" },
          time: null,
          note: null,
        },
      ],
    });
    expect(ok.ok).toBe(true);
    const badTime = validateCustodyPlanForExecution({
      items: [
        {
          kind: "leg_override",
          childIds: [OTTO],
          date: "2026-07-09",
          leg: "pickup",
          responsible: { memberId: MAE, label: "F" },
          time: "25:00",
          note: null,
        },
      ],
    });
    expect(badTime.ok).toBe(false);
  });
});
