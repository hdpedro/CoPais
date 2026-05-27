/**
 * family-names.ts — testes da formatação natural pt-BR + fallback de grupo.
 *
 * Garante regressão zero pra cenários comuns:
 *  - 1 filho → "Otto"
 *  - 2 filhos → "Otto e Martim"
 *  - 3+ filhos → "Otto, Martim e Joaquim"
 *  - 0 filhos → "as crianças" (gender-neutral)
 *  - child_id específico vence sobre grupo
 *  - embeddedFullName otimiza (não faz query DB)
 */
import { describe, expect, test, vi } from "vitest";
import {
  resolveChildrenName,
  buildChildrenNameResolver,
} from "../../src/lib/services/family-names";

type FakeRow = { id?: string; full_name: string | null; birth_date?: string; group_id?: string };

function makeSupabase(opts: {
  bySingleId?: Record<string, FakeRow>;
  byGroup?: Record<string, FakeRow[]>;
}) {
  return {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn((_field: string, value: string) => ({
          single: vi.fn(async () => ({
            data: opts.bySingleId?.[value] ?? null,
          })),
          order: vi.fn(async () => ({
            data: opts.byGroup?.[value] ?? [],
          })),
        })),
        in: vi.fn((_field: string, values: string[]) => ({
          order: vi.fn(async () => ({
            data: values.flatMap((g) =>
              (opts.byGroup?.[g] ?? []).map((k) => ({ ...k, group_id: g })),
            ),
          })),
        })),
      })),
    })),
  } as unknown as Parameters<typeof resolveChildrenName>[0];
}

describe("resolveChildrenName — atividade única", () => {
  test("childId específico → first name dele", async () => {
    const s = makeSupabase({
      bySingleId: { "kid-1": { full_name: "Otto Garcia" } },
    });
    expect(await resolveChildrenName(s, { childId: "kid-1", groupId: "g1" })).toBe("Otto");
  });

  test("embeddedFullName ganha (sem hit DB)", async () => {
    const s = makeSupabase({});
    expect(
      await resolveChildrenName(s, {
        childId: "kid-1",
        groupId: "g1",
        embeddedFullName: "Martim Silva",
      }),
    ).toBe("Martim");
    // não deve ter chamado from()
    expect((s as unknown as { from: ReturnType<typeof vi.fn> }).from).not.toHaveBeenCalled();
  });

  test("child_id NULL + 2 filhos no grupo → 'A e B'", async () => {
    const s = makeSupabase({
      byGroup: {
        g1: [{ full_name: "Otto Garcia" }, { full_name: "Martim Silva" }],
      },
    });
    expect(await resolveChildrenName(s, { childId: null, groupId: "g1" })).toBe("Otto e Martim");
  });

  test("child_id NULL + 3 filhos → 'A, B e C'", async () => {
    const s = makeSupabase({
      byGroup: {
        g1: [
          { full_name: "Otto" },
          { full_name: "Martim" },
          { full_name: "Joaquim" },
        ],
      },
    });
    expect(await resolveChildrenName(s, { childId: null, groupId: "g1" })).toBe("Otto, Martim e Joaquim");
  });

  test("child_id NULL + 0 filhos → fallback 'as crianças'", async () => {
    const s = makeSupabase({ byGroup: { g1: [] } });
    expect(await resolveChildrenName(s, { childId: null, groupId: "g1" })).toBe("as crianças");
  });

  test("full_name vazio é filtrado", async () => {
    const s = makeSupabase({
      byGroup: { g1: [{ full_name: "" }, { full_name: "Otto" }, { full_name: null }] },
    });
    expect(await resolveChildrenName(s, { childId: null, groupId: "g1" })).toBe("Otto");
  });
});

describe("buildChildrenNameResolver — batched pra crons", () => {
  test("resolve correctamente sem nova query no loop", async () => {
    const s = makeSupabase({
      byGroup: {
        g1: [
          { id: "k1", full_name: "Otto" },
          { id: "k2", full_name: "Martim" },
        ],
        g2: [{ id: "k3", full_name: "Joaquim" }],
      },
    });
    const resolve = await buildChildrenNameResolver(s, ["g1", "g2"]);

    expect(resolve("k1", "g1")).toBe("Otto");
    expect(resolve("k2", "g1")).toBe("Martim");
    expect(resolve(null, "g1")).toBe("Otto e Martim");
    expect(resolve(null, "g2")).toBe("Joaquim");

    // 1 query no setup + ZERO durante o loop
    expect((s as unknown as { from: ReturnType<typeof vi.fn> }).from).toHaveBeenCalledTimes(1);
  });

  test("groupIds vazio retorna fallback sem query", async () => {
    const s = makeSupabase({});
    const resolve = await buildChildrenNameResolver(s, []);
    expect(resolve(null, "qualquer")).toBe("as crianças");
    expect((s as unknown as { from: ReturnType<typeof vi.fn> }).from).not.toHaveBeenCalled();
  });

  test("childId desconhecido (deletado?) cai pro fallback do grupo", async () => {
    const s = makeSupabase({
      byGroup: { g1: [{ id: "k1", full_name: "Otto" }] },
    });
    const resolve = await buildChildrenNameResolver(s, ["g1"]);
    // childId nao existe no group cache — fallback pro grupo (1 filho)
    expect(resolve("kid-deletado", "g1")).toBe("Otto");
  });
});
