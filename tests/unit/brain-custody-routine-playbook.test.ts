/* ------------------------------------------------------------------ */
/* Playbook de NARRATIVA de guarda & rotina (Fatia N1) — salvaguardas:  */
/* pessoa externa NUNCA vira membro em guarda (só rótulo em leva/busca);*/
/* permanente nunca por presunção; datas validadas; "EU" = narrador.    */
/* ------------------------------------------------------------------ */

import { describe, it, expect } from "vitest";
import {
  custodyRoutinePlaybook,
  resolvePersonRef,
  resolveChildIds,
} from "@/lib/ai/brain/understanding/playbooks/custody-routine";
import type { PlaybookContext } from "@/lib/ai/brain/types";

const PAI = "user-pai";
const MAE = "user-mae";
const OTTO = "child-otto";
const MARTIM = "child-martim";

function ctx(over: Partial<PlaybookContext> = {}): PlaybookContext {
  return {
    groupId: "g1",
    userId: PAI, // narrador = pai
    channel: "pwa",
    today: "2026-07-02",
    timezone: "America/Sao_Paulo",
    children: [
      { id: OTTO, name: "Otto" },
      { id: MARTIM, name: "Martim" },
    ],
    resolvedChildId: null,
    schoolYearAnchor: 2026,
    members: [
      { id: PAI, name: "Henrique de Pedro" },
      { id: MAE, name: "Fernanda Souza" },
    ],
    ...over,
  };
}

function payload(items: unknown[]): unknown {
  return { recognized_as: "custody_routine", items };
}

describe("resolvePersonRef — pessoas citadas na narrativa", () => {
  it("'EU' resolve pro narrador; nome/1º nome resolve pro membro (sem acento/caixa)", () => {
    expect(resolvePersonRef("EU", ctx()).memberId).toBe(PAI);
    expect(resolvePersonRef("fernanda", ctx()).memberId).toBe(MAE);
    expect(resolvePersonRef("FERNANDA SOUZA", ctx()).memberId).toBe(MAE);
  });

  it("pessoa externa ('a avó') NÃO vira membro — rótulo preservado", () => {
    const p = resolvePersonRef("a avó", ctx());
    expect(p.memberId).toBeNull();
    expect(p.label).toBe("a avó");
  });

  it("nome ambíguo entre membros → não resolve (externo)", () => {
    const c = ctx({
      members: [
        { id: PAI, name: "Ana Silva" },
        { id: MAE, name: "Ana Souza" },
      ],
    });
    expect(resolvePersonRef("Ana", c).memberId).toBeNull();
  });
});

describe("resolveChildIds — crianças citadas", () => {
  it("nome citado resolve; null/vazio = todas; desconhecido cai em todas (conservador)", () => {
    expect(resolveChildIds(["Otto"], ctx())).toEqual([OTTO]);
    expect(resolveChildIds(null, ctx())).toEqual([OTTO, MARTIM]);
    expect(resolveChildIds(["Lucas"], ctx())).toEqual([OTTO, MARTIM]);
  });
});

describe("parse — salvaguardas por tipo de item", () => {
  it("exceção de guarda válida ('fica comigo de 8 a 12') → item com narrador", () => {
    const d = custodyRoutinePlaybook.parse(
      payload([
        {
          kind: "custody_exception",
          children: ["Otto"],
          start_date: "2026-07-08",
          end_date: "2026-07-12",
          responsible: "EU",
          reason: "a Fernanda viaja",
        },
      ]),
      ctx(),
    );
    expect(d?.items).toHaveLength(1);
    const it0 = d!.items[0];
    expect(it0.kind).toBe("custody_exception");
    if (it0.kind === "custody_exception") {
      expect(it0.responsible.memberId).toBe(PAI);
      expect(it0.childIds).toEqual([OTTO]);
      expect(it0.reason).toBe("a Fernanda viaja");
    }
  });

  it("GUARDA com pessoa externa ('minha mãe') → DESCARTADA (skipped), não inventa membro", () => {
    const d = custodyRoutinePlaybook.parse(
      payload([
        {
          kind: "custody_exception",
          children: ["Otto"],
          start_date: "2026-07-08",
          end_date: "2026-07-12",
          responsible: "minha mãe",
        },
        // um item válido pra não zerar o parse
        { kind: "leg_override", children: ["Otto"], date: "2026-07-09", leg: "pickup", responsible: "EU" },
      ]),
      ctx(),
    );
    expect(d?.items).toHaveLength(1);
    expect(d?.items[0].kind).toBe("leg_override");
    expect(d?.skipped).toBe(1);
  });

  it("LEVA/BUSCA com pessoa externa ('a avó busca') → item mantido com rótulo (memberId null)", () => {
    const d = custodyRoutinePlaybook.parse(
      payload([
        {
          kind: "leg_override",
          children: ["Otto"],
          date: "2026-07-09",
          leg: "pickup",
          responsible: "a avó",
          time: "15:00",
        },
      ]),
      ctx(),
    );
    const it0 = d!.items[0];
    expect(it0.kind).toBe("leg_override");
    if (it0.kind === "leg_override") {
      expect(it0.responsible.memberId).toBeNull();
      expect(it0.responsible.label).toBe("a avó");
      expect(it0.time).toBe("15:00");
    }
  });

  it("troca ('troquei o sábado com a Fernanda') → counterpart membro ≠ narrador", () => {
    const d = custodyRoutinePlaybook.parse(
      payload([
        { kind: "swap_proposal", children: null, original_date: "2026-07-04", counterpart: "Fernanda" },
      ]),
      ctx(),
    );
    const it0 = d!.items[0];
    expect(it0.kind).toBe("swap_proposal");
    if (it0.kind === "swap_proposal") expect(it0.counterpart.memberId).toBe(MAE);
  });

  it("troca com counterpart = o PRÓPRIO narrador → descartada (auto-troca)", () => {
    const d = custodyRoutinePlaybook.parse(
      payload([{ kind: "swap_proposal", children: null, original_date: "2026-07-04", counterpart: "EU" }]),
      ctx(),
    );
    expect(d).toBeNull(); // único item inválido → nada útil
  });

  it("slot_change (permanente) exige membro; weekday inválido descarta", () => {
    const d = custodyRoutinePlaybook.parse(
      payload([
        { kind: "slot_change", children: ["Otto"], weekday: 1, leg: "dropoff", responsible: "Fernanda", time: "07:30" },
        { kind: "slot_change", children: ["Otto"], weekday: 9, leg: "dropoff", responsible: "Fernanda" },
        { kind: "slot_change", children: ["Otto"], weekday: 2, leg: "pickup", responsible: "a avó" },
      ]),
      ctx(),
    );
    expect(d?.items).toHaveLength(1);
    expect(d?.skipped).toBe(2);
    const it0 = d!.items[0];
    if (it0.kind === "slot_change") {
      expect(it0.weekday).toBe(1);
      expect(it0.responsible.memberId).toBe(MAE);
    }
  });

  it("datas: range invertido, só-passado e fora do horizonte descartam", () => {
    const d = custodyRoutinePlaybook.parse(
      payload([
        { kind: "custody_exception", children: null, start_date: "2026-07-12", end_date: "2026-07-08", responsible: "EU" },
        { kind: "custody_exception", children: null, start_date: "2026-06-01", end_date: "2026-06-10", responsible: "EU" },
        { kind: "custody_exception", children: null, start_date: "2028-01-01", end_date: "2028-01-05", responsible: "EU" },
      ]),
      ctx(),
    );
    expect(d).toBeNull();
  });

  it("exceção que COMEÇOU no passado mas ainda vale (end >= hoje) é mantida", () => {
    const d = custodyRoutinePlaybook.parse(
      payload([
        { kind: "custody_exception", children: null, start_date: "2026-06-28", end_date: "2026-07-05", responsible: "EU" },
      ]),
      ctx(),
    );
    expect(d?.items).toHaveLength(1);
  });

  it("narrativa MISTA ('fica comigo semana que vem E quinta a avó busca') → 2 itens", () => {
    const d = custodyRoutinePlaybook.parse(
      payload([
        { kind: "custody_exception", children: ["Otto"], start_date: "2026-07-06", end_date: "2026-07-10", responsible: "EU" },
        { kind: "leg_override", children: ["Otto"], date: "2026-07-09", leg: "pickup", responsible: "a avó" },
      ]),
      ctx(),
    );
    expect(d?.items.map((i) => i.kind)).toEqual(["custody_exception", "leg_override"]);
    expect(d?.skipped).toBe(0);
  });

  it("vacation sem crianças citadas preserva null (família toda); com criança vira ids", () => {
    const d = custodyRoutinePlaybook.parse(
      payload([
        { kind: "vacation", children: null, start_date: "2026-07-15", end_date: "2026-07-30", responsible: "Fernanda" },
        { kind: "vacation", children: ["Martim"], start_date: "2026-08-01", end_date: "2026-08-05", responsible: "EU" },
      ]),
      ctx(),
    );
    const [fam, soMartim] = d!.items;
    if (fam.kind === "vacation") expect(fam.childIds).toBeNull();
    if (soMartim.kind === "vacation") expect(soMartim.childIds).toEqual([MARTIM]);
  });

  it("recognized_as != custody_routine ou sem itens válidos → null (cai no chat)", () => {
    expect(custodyRoutinePlaybook.parse({ recognized_as: "unknown", items: [] }, ctx())).toBeNull();
    expect(custodyRoutinePlaybook.parse(payload([]), ctx())).toBeNull();
  });
});

describe("plan — MaterializationPlan de guarda", () => {
  it("empacota itens em plan.custody com collabRecordType custody_event", () => {
    const d = custodyRoutinePlaybook.parse(
      payload([
        { kind: "leg_override", children: ["Otto"], date: "2026-07-09", leg: "pickup", responsible: "a avó" },
      ]),
      ctx(),
    )!;
    const plan = custodyRoutinePlaybook.plan(d, ctx());
    expect(plan.docType).toBe("custody_routine");
    expect(plan.confirmation).toBe("single");
    expect(plan.custody?.items).toHaveLength(1);
    expect(plan.collabRecordType).toBe("custody_event");
    expect(plan.activities).toEqual([]);
  });
});
