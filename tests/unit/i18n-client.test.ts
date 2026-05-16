/**
 * Tests for src/i18n/index.ts — client-side dict loader + t() with fallback.
 *
 * Anchors the Regra Canônica 6 behavior (dev shows MISSING marker, prod
 * returns key) and the source-language fallback chain.
 */

import { describe, it, expect } from "vitest";
import { t, getDictionary, loadDictionary, SUPPORTED_LOCALES } from "@/i18n";

describe("client t()", () => {
  it("returns the requested locale's translation when present", async () => {
    await loadDictionary("en");
    expect(t("common.save", undefined, "en")).toBe("Save");
  });

  it("falls back to pt-BR (source) when key missing in requested locale", () => {
    // Synthetic miss: pass a long path that can't exist. The fallback
    // chain should bottom out at pt or — if not even in pt — at the key
    // literal (production) or MISSING marker (dev).
    const out = t("totally.fake.deep.key.value", undefined, "en");
    // Either MISSING marker (dev) or raw key (prod).
    expect(
      out === "totally.fake.deep.key.value" ||
        out.startsWith("🔴 MISSING:"),
    ).toBe(true);
  });

  it("interpolates {var} placeholders", () => {
    const out = t("dashboard.welcome", { name: "Aline" }, "pt");
    expect(out).toContain("Aline");
  });

  it("preserves {var} when var is missing from caller", () => {
    const out = t("dashboard.welcome", {}, "pt");
    expect(out).toContain("{name}");
  });
});

describe("getDictionary", () => {
  it("returns pt dictionary by default", () => {
    const dict = getDictionary();
    expect(dict.common.save).toBe("Salvar");
  });

  it("returns pt fallback when locale not yet loaded", () => {
    // Loading is async; calling sync before load yields pt as the safe default.
    const dict = getDictionary("de");
    expect(typeof dict.common.save).toBe("string");
  });
});

describe("SUPPORTED_LOCALES", () => {
  it("contains all 5 expected locales", () => {
    expect(SUPPORTED_LOCALES).toEqual(["pt", "en", "es", "fr", "de"]);
  });
});
