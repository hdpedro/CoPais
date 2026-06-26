import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { runProviderChain } from "@/lib/ai/router";
import type { AIProvider } from "@/lib/ai/providers/types";

// Minimal fake provider — runProviderChain only reads `.name`.
const P = (name: string): AIProvider => ({ name }) as unknown as AIProvider;

beforeEach(() => {
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe("runProviderChain", () => {
  it("returns the first provider whose result is usable", async () => {
    const out = await runProviderChain([P("A"), P("B")], "t", async (p) => p.name, () => true);
    expect(out.result).toBe("A");
    expect(out.provider).toBe("A");
    expect(out.attempts).toEqual([]);
  });

  it("CHARACTERIZATION: falls through on an exception to the next provider", async () => {
    const out = await runProviderChain(
      [P("A"), P("B")],
      "t",
      async (p) => {
        if (p.name === "A") throw new Error("boom");
        return p.name;
      },
      () => true,
    );
    expect(out.result).toBe("B");
    expect(out.provider).toBe("B");
    expect(out.attempts).toEqual([{ provider: "A", error: "boom" }]);
  });

  it("HARDENING: falls through on an empty/unusable result to the next provider", async () => {
    const out = await runProviderChain(
      [P("A"), P("B")],
      "t",
      async (p) => (p.name === "A" ? "" : "conteúdo real"),
      (r) => r.trim().length > 0,
    );
    expect(out.result).toBe("conteúdo real");
    expect(out.provider).toBe("B");
    expect(out.attempts).toEqual([{ provider: "A", error: "empty/unusable response" }]);
  });

  it("mixes exception + empty before landing on a usable provider", async () => {
    const out = await runProviderChain(
      [P("A"), P("B"), P("C")],
      "t",
      async (p) => {
        if (p.name === "A") throw new Error("429 rate limit");
        if (p.name === "B") return "   "; // whitespace only → unusable
        return "ok";
      },
      (r) => r.trim().length > 0,
    );
    expect(out.provider).toBe("C");
    expect(out.attempts.map((a) => a.provider)).toEqual(["A", "B"]);
  });

  it("throws when every provider throws", async () => {
    await expect(
      runProviderChain([P("A"), P("B")], "t", async () => {
        throw new Error("down");
      }, () => true),
    ).rejects.toThrow(/Todos os provedores falharam/);
  });

  it("throws when every provider returns an unusable result", async () => {
    await expect(
      runProviderChain([P("A"), P("B")], "t", async () => "", (r) => r.length > 0),
    ).rejects.toThrow(/Todos os provedores falharam/);
  });

  it("throws a clear error when the provider list is empty", async () => {
    await expect(
      runProviderChain([], "t", async () => "x", () => true),
    ).rejects.toThrow(/Nenhum provedor/);
  });
});
