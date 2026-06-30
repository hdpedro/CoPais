import { describe, it, expect } from "vitest";
import {
  normalizeForFingerprint,
  activityFingerprint,
  fingerprintActivitySpec,
  dedupeWithinPlan,
  flagDuplicateCandidates,
  outboxDedupeKey,
  type ExistingActivity,
} from "@/lib/ai/brain/dedupe";
import type { ActivitySpec } from "@/lib/ai/brain/types";

const CHILD_A = "11111111-1111-1111-1111-111111111111";
const CHILD_B = "22222222-2222-2222-2222-222222222222";

function spec(over: Partial<ActivitySpec> = {}): ActivitySpec {
  return {
    childId: CHILD_A,
    name: "Prova de Matemática",
    category: "school",
    startDate: "2026-08-12",
    subject: "Matemática",
    activityType: "prova",
    ...over,
  };
}

describe("normalizeForFingerprint", () => {
  it("tira acento, caixa e colapsa espaços", () => {
    expect(normalizeForFingerprint("  Matemática  ")).toBe("matematica");
    expect(normalizeForFingerprint("PROVA   de  História")).toBe("prova de historia");
    expect(normalizeForFingerprint(null)).toBe("");
    expect(normalizeForFingerprint(undefined)).toBe("");
  });
});

describe("activityFingerprint — semântico, não só data", () => {
  it("é determinístico (mesma entrada → mesma chave)", () => {
    expect(fingerprintActivitySpec(spec())).toBe(fingerprintActivitySpec(spec()));
  });

  it("acento/caixa/espaço não mudam a chave", () => {
    const a = fingerprintActivitySpec(spec({ name: "Prova de Matemática", subject: "Matemática" }));
    const b = fingerprintActivitySpec(spec({ name: "prova de  MATEMATICA", subject: "matematica" }));
    expect(a).toBe(b);
  });

  it("PROVA × TRABALHO da mesma matéria no mesmo dia → chaves DIFERENTES", () => {
    // O caso que motiva o fingerprint: não é só a data.
    const prova = fingerprintActivitySpec(
      spec({ name: "Prova de Matemática", activityType: "prova" }),
    );
    const trabalho = fingerprintActivitySpec(
      spec({ name: "Trabalho de Matemática", activityType: "trabalho" }),
    );
    expect(prova).not.toBe(trabalho);
  });

  it("matérias diferentes no mesmo dia → chaves diferentes", () => {
    const mat = fingerprintActivitySpec(spec({ subject: "Matemática", name: "Prova de Matemática" }));
    const hist = fingerprintActivitySpec(spec({ subject: "História", name: "Prova de História" }));
    expect(mat).not.toBe(hist);
  });

  it("crianças diferentes → chaves diferentes", () => {
    expect(fingerprintActivitySpec(spec({ childId: CHILD_A }))).not.toBe(
      fingerprintActivitySpec(spec({ childId: CHILD_B })),
    );
  });

  it("childId null é um bucket próprio (não colide com criança específica)", () => {
    const nullChild = activityFingerprint({
      childId: null,
      category: "school",
      title: "Prova",
      date: "2026-08-12",
    });
    const someChild = activityFingerprint({
      childId: CHILD_A,
      category: "school",
      title: "Prova",
      date: "2026-08-12",
    });
    expect(nullChild).not.toBe(someChild);
  });
});

describe("dedupeWithinPlan — vision extrai a mesma prova 2×", () => {
  it("mantém a 1ª ocorrência e descarta a duplicata", () => {
    const dup = spec();
    const { unique, dropped } = dedupeWithinPlan([spec(), dup, spec({ subject: "História", name: "Prova de História" })]);
    expect(unique).toHaveLength(2);
    expect(dropped).toHaveLength(1);
    expect(unique[0].name).toBe("Prova de Matemática");
  });

  it("prova e trabalho da mesma matéria/dia NÃO são deduplicados", () => {
    const { unique, dropped } = dedupeWithinPlan([
      spec({ name: "Prova de Matemática", activityType: "prova" }),
      spec({ name: "Trabalho de Matemática", activityType: "trabalho" }),
    ]);
    expect(unique).toHaveLength(2);
    expect(dropped).toHaveLength(0);
  });

  it("plano vazio → resultado vazio", () => {
    expect(dedupeWithinPlan([])).toEqual({ unique: [], dropped: [] });
  });
});

describe("flagDuplicateCandidates — advisory (sugere comparar, não bloqueia)", () => {
  const existing: ExistingActivity[] = [
    {
      childId: CHILD_A,
      category: "school",
      subject: "Matemática",
      name: "Prova de Matemática",
      startDate: "2026-08-12",
      type: "prova",
    },
  ];

  it("sinaliza candidato semelhante e separa o que não tem semelhante", () => {
    const { create, candidates } = flagDuplicateCandidates(
      [spec(), spec({ subject: "História", name: "Prova de História" })],
      existing,
    );
    expect(candidates).toHaveLength(1);
    expect(create).toHaveLength(1);
    expect(create[0].subject).toBe("História");
  });

  it("uma prova existente NÃO marca o trabalho do mesmo dia/matéria como candidato", () => {
    const { create, candidates } = flagDuplicateCandidates(
      [spec({ name: "Trabalho de Matemática", activityType: "trabalho" })],
      existing,
    );
    expect(candidates).toHaveLength(0);
    expect(create).toHaveLength(1);
  });

  it("sem existentes → tudo vira create (nenhum candidato)", () => {
    const { create, candidates } = flagDuplicateCandidates([spec()], []);
    expect(create).toHaveLength(1);
    expect(candidates).toHaveLength(0);
  });
});

describe("outboxDedupeKey — idempotência da coordenação (retry não duplica)", () => {
  const intake = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";

  it("sha256 hex estável e determinístico (retry produz a MESMA chave)", () => {
    const k1 = outboxDedupeKey(intake, "collab_notify", CHILD_A);
    const k2 = outboxDedupeKey(intake, "collab_notify", CHILD_A);
    expect(k1).toBe(k2);
    expect(k1).toMatch(/^[0-9a-f]{64}$/);
  });

  it("muda por DESTINATÁRIO (cada coparente recebe sua linha de outbox)", () => {
    expect(outboxDedupeKey(intake, "collab_notify", CHILD_A)).not.toBe(
      outboxDedupeKey(intake, "collab_notify", CHILD_B),
    );
  });

  it("muda por TIPO de evento", () => {
    expect(outboxDedupeKey(intake, "collab_notify", CHILD_A)).not.toBe(
      outboxDedupeKey(intake, "push", CHILD_A),
    );
  });

  it("não confunde fronteira entre campos (separador)", () => {
    // 'a' + 'bc' vs 'ab' + 'c' não devem colidir.
    expect(outboxDedupeKey("a", "bc", CHILD_A)).not.toBe(outboxDedupeKey("ab", "c", CHILD_A));
  });
});
