import { describe, it, expect } from "vitest";
import {
  buildOutboxPayloads,
  selectActivitiesByIndex,
  applyActivityEdits,
} from "@/lib/ai/brain/materialize-payload";
import type { ActivitySpec } from "@/lib/ai/brain/types";

const CHILD_A = "11111111-1111-1111-1111-111111111111";

function spec(over: Partial<ActivitySpec> = {}): ActivitySpec {
  return {
    childId: CHILD_A,
    name: "Prova de Matemática",
    category: "school",
    startDate: "2026-08-12",
    ...over,
  };
}

describe("applyActivityEdits — edição por item no preview", () => {
  const acts: ActivitySpec[] = [
    spec({ name: "Prova de Matemática", subject: "Matemática", startDate: "2026-08-12", timeStart: "08:00", notes: "Cap. 7" }),
    spec({ name: "Prova de História", subject: "História", startDate: "2026-08-13" }),
  ];

  it("sem edições → mesma lista (identidade)", () => {
    expect(applyActivityEdits(acts, undefined)).toBe(acts);
    expect(applyActivityEdits(acts, [])).toBe(acts);
  });

  it("edita título/matéria/data/hora/conteúdo de um item por índice", () => {
    const r = applyActivityEdits(acts, [
      { index: 0, name: "Prova AV2 Mat", subject: "Matemática Aplicada", startDate: "2026-08-14", timeStart: "09:30", notes: "Cap. 7 e 8" },
    ]);
    expect(r[0]).toMatchObject({
      name: "Prova AV2 Mat",
      subject: "Matemática Aplicada",
      startDate: "2026-08-14",
      timeStart: "09:30",
      notes: "Cap. 7 e 8",
    });
    expect(r[1]).toEqual(acts[1]); // outro item intocado
  });

  it("índice inválido é ignorado; não muta a entrada", () => {
    const r = applyActivityEdits(acts, [{ index: 9, name: "X" }, { index: -1, name: "Y" }]);
    expect(r[0]).toEqual(acts[0]);
    expect(acts[0].name).toBe("Prova de Matemática"); // input intacto
  });

  it("subject/notes null limpam; name vazio NÃO mexe", () => {
    const r = applyActivityEdits(acts, [{ index: 0, subject: null, notes: null, name: "   " }]);
    expect(r[0].subject).toBeNull();
    expect(r[0].notes).toBeNull();
    expect(r[0].name).toBe("Prova de Matemática"); // trim vazio = não mexeu
  });

  it("data/hora inválidas: data ignorada, hora vira null", () => {
    const r = applyActivityEdits(acts, [{ index: 0, startDate: "14/08/2026", timeStart: "9h" }]);
    expect(r[0].startDate).toBe("2026-08-12"); // formato inválido → mantém
    expect(r[0].timeStart).toBeNull(); // hora inválida → null
  });

  it("capa strings longas (name 200 / subject 120 / notes 2000)", () => {
    const long = "a".repeat(3000);
    const r = applyActivityEdits(acts, [{ index: 0, name: long, subject: long, notes: long }]);
    expect(r[0].name!.length).toBe(200);
    expect(r[0].subject!.length).toBe(120);
    expect(r[0].notes!.length).toBe(2000);
  });
});

describe("selectActivitiesByIndex — deseleção no preview (casos do dono)", () => {
  const acts: ActivitySpec[] = [
    spec({ name: "P0" }),
    spec({ name: "P1" }),
    spec({ name: "P2" }),
  ];
  it("undefined → mantém todas (confirma tudo)", () => {
    expect(selectActivitiesByIndex(acts, undefined)).toHaveLength(3);
  });
  it("subconjunto [0,2] → só 0 e 2, na ordem", () => {
    const r = selectActivitiesByIndex(acts, [0, 2]);
    expect(r.map((a) => a.name)).toEqual(["P0", "P2"]);
  });
  it("índice repetido [0,0,1] → não duplica", () => {
    expect(selectActivitiesByIndex(acts, [0, 0, 1]).map((a) => a.name)).toEqual(["P0", "P1"]);
  });
  it("índice inexistente [5] → ignora (vazio)", () => {
    expect(selectActivitiesByIndex(acts, [5])).toEqual([]);
  });
  it("array vazio → vazio (caller rejeita: nada a criar)", () => {
    expect(selectActivitiesByIndex(acts, [])).toEqual([]);
  });
  it("preserva a ordem original mesmo com índices fora de ordem", () => {
    expect(selectActivitiesByIndex(acts, [2, 0]).map((a) => a.name)).toEqual(["P0", "P2"]);
  });
});

describe("buildOutboxPayloads — um collab_notify por destinatário, idempotente", () => {
  const intakeId = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
  const R1 = "22222222-2222-2222-2222-222222222222";
  const R2 = "33333333-3333-3333-3333-333333333333";

  it("uma linha por destinatário, com dedupe_key sha256", () => {
    const out = buildOutboxPayloads({
      intakeId,
      recipientIds: [R1, R2],
      docType: "school_calendar",
      childId: CHILD_A,
      createdCount: 3,
    });
    expect(out).toHaveLength(2);
    expect(out[0].event_type).toBe("collab_notify");
    expect(out[0].dedupe_key).toMatch(/^[0-9a-f]{64}$/);
    expect(out[0].dedupe_key).not.toBe(out[1].dedupe_key);
    expect(out[0].payload).toMatchObject({ intake_id: intakeId, recipient_id: R1, created_count: 3 });
  });

  it("deduplica destinatários repetidos (uma linha por pessoa)", () => {
    const out = buildOutboxPayloads({
      intakeId,
      recipientIds: [R1, R1, R2],
      docType: "school_calendar",
      childId: null,
      createdCount: 1,
    });
    expect(out).toHaveLength(2);
  });

  it("sem destinatários → vazio (intake só do confirmador)", () => {
    expect(
      buildOutboxPayloads({ intakeId, recipientIds: [], docType: "school_calendar", childId: null, createdCount: 1 }),
    ).toEqual([]);
  });

  it("dedupe_key estável entre chamadas (retry do worker não duplica)", () => {
    const a = buildOutboxPayloads({ intakeId, recipientIds: [R1], docType: "school_calendar", childId: null, createdCount: 1 });
    const b = buildOutboxPayloads({ intakeId, recipientIds: [R1], docType: "school_calendar", childId: null, createdCount: 1 });
    expect(a[0].dedupe_key).toBe(b[0].dedupe_key);
  });
});
