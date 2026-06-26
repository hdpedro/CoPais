import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { runProviderChain, isUsableVisionText } from "@/lib/ai/router";
import type { AIProvider } from "@/lib/ai/providers/types";

// Minimal fake provider — runProviderChain only reads `.name`.
const P = (name: string): AIProvider => ({ name }) as unknown as AIProvider;
const accept = () => true;
const nonEmpty = (r: string) => isUsableVisionText(r);

beforeEach(() => {
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe("isUsableVisionText (OCR sentinel detection)", () => {
  it("rejects blank and the empty sentinels the providers emit", () => {
    expect(isUsableVisionText("")).toBe(false);
    expect(isUsableVisionText("   ")).toBe(false);
    expect(isUsableVisionText("{}")).toBe(false); // Groq/OpenAI/Together empty default
    expect(isUsableVisionText("[]")).toBe(false);
    expect(isUsableVisionText(" {} ")).toBe(false);
  });
  it("accepts a real extraction", () => {
    expect(isUsableVisionText('{"medications":[{"name":"Amoxicilina"}]}')).toBe(true);
    expect(isUsableVisionText("texto extraído")).toBe(true);
  });
});

describe("runProviderChain", () => {
  it("returns the first provider whose result is usable", async () => {
    const out = await runProviderChain([P("A"), P("B")], "t", async (p) => p.name, accept);
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
      accept,
    );
    expect(out.result).toBe("B");
    expect(out.provider).toBe("B");
    expect(out.attempts).toEqual([{ provider: "A", error: "boom" }]);
  });

  it("HARDENING: falls through on a blank/'{}' result to the next usable provider", async () => {
    const out = await runProviderChain(
      [P("A"), P("B")],
      "t",
      async (p) => (p.name === "A" ? "{}" : '{"ok":true}'),
      nonEmpty,
    );
    expect(out.result).toBe('{"ok":true}');
    expect(out.provider).toBe("B");
    expect(out.attempts).toEqual([{ provider: "A", error: "empty/unusable response" }]);
  });

  it("mixes exception + blank before landing on a usable provider", async () => {
    const out = await runProviderChain(
      [P("A"), P("B"), P("C")],
      "t",
      async (p) => {
        if (p.name === "A") throw new Error("429 rate limit");
        if (p.name === "B") return "{}"; // empty sentinel → unusable
        return '{"x":1}';
      },
      nonEmpty,
    );
    expect(out.provider).toBe("C");
    expect(out.attempts.map((a) => a.provider)).toEqual(["A", "B"]);
  });

  it("returns the LAST blank result (no throw) when none are usable — callers degrade gracefully", async () => {
    const out = await runProviderChain(
      [P("A"), P("B")],
      "t",
      async (p) => (p.name === "A" ? "{}" : ""),
      nonEmpty,
    );
    // B is the last provider that returned (blank) — handed back, not thrown.
    expect(out.provider).toBe("B");
    expect(out.result).toBe("");
    expect(out.attempts.map((a) => a.provider)).toEqual(["A", "B"]);
  });

  it("throws ONLY when every provider throws (nothing came back)", async () => {
    await expect(
      runProviderChain([P("A"), P("B")], "t", async () => {
        throw new Error("down");
      }, nonEmpty),
    ).rejects.toThrow(/Todos os provedores falharam/);
  });

  it("throws a clear error when the provider list is empty", async () => {
    await expect(
      runProviderChain([], "t", async () => "x", accept),
    ).rejects.toThrow(/Nenhum provedor/);
  });
});
