/**
 * Tests for src/i18n/pseudo.ts — pseudo-localization transliteration.
 *
 * Pseudo-loc is the cheapest way to catch hardcoded strings + truncation.
 * These tests pin its behavior so a future refactor doesn't break the
 * preservation of placeholders/URLs/tags (which would catastrophically
 * mangle production templates if the flag accidentally flipped on).
 */

import { describe, it, expect } from "vitest";
import { pseudoLocalize, pseudoLocalizeDict, isPseudoLocEnabled } from "@/i18n/pseudo";

describe("pseudoLocalize", () => {
  it("transliterates ASCII letters", () => {
    const out = pseudoLocalize("Save");
    // Mapping per PSEUDO_MAP in src/i18n/pseudo.ts: S→Ś, a→å, v→ṽ, e→é
    expect(out).toContain("Śåṽé");
  });

  it("wraps the result with [!! ... !!] markers", () => {
    expect(pseudoLocalize("Hi")).toMatch(/^\[!! .* !!\]$/);
  });

  it("preserves single-brace placeholders ({name})", () => {
    const out = pseudoLocalize("Hi {name}");
    expect(out).toContain("{name}");
  });

  it("preserves double-brace placeholders ({{name}}) — legacy i18next style", () => {
    const out = pseudoLocalize("Hi {{name}}");
    expect(out).toContain("{{name}}");
  });

  it("preserves URLs", () => {
    const url = "https://www.kindar.com.br";
    expect(pseudoLocalize(`Visit ${url}`)).toContain(url);
  });

  it("preserves HTML/JSX tags", () => {
    expect(pseudoLocalize("<b>Hi</b>")).toContain("<b>");
  });

  it("pads result ~40% longer than source for length-stress", () => {
    const out = pseudoLocalize("Save");
    // "Save" is 4 chars → pad at least 3 'Ŵ' + brackets + spaces. Total
    // length comfortably exceeds source.
    expect(out.length).toBeGreaterThan("Save".length * 2);
  });

  it("returns empty string unchanged", () => {
    expect(pseudoLocalize("")).toBe("");
  });
});

describe("pseudoLocalizeDict", () => {
  it("recursively transliterates leaf strings", () => {
    const out = pseudoLocalizeDict({
      common: { save: "Salvar", nested: { cancel: "Cancelar" } },
    });
    expect((out as { common: { save: string } }).common.save).toContain("[!!");
    expect(
      (out as { common: { nested: { cancel: string } } }).common.nested.cancel,
    ).toContain("[!!");
  });

  it("preserves arrays as arrays", () => {
    const out = pseudoLocalizeDict({ items: ["one", "two"] });
    expect(Array.isArray((out as { items: string[] }).items)).toBe(true);
    expect((out as { items: string[] }).items).toHaveLength(2);
  });

  it("returns null/undefined unchanged", () => {
    expect(pseudoLocalizeDict(null)).toBeNull();
    expect(pseudoLocalizeDict(undefined)).toBeUndefined();
  });
});

describe("isPseudoLocEnabled", () => {
  // Vitest sets NODE_ENV as a non-configurable property, so we can't simulate
  // "production" from a test. Instead, we assert the flag-based logic with the
  // current test env (NODE_ENV === "test" — falls through the production guard
  // and uses the flag).
  it("returns false when no flag set", () => {
    const originalFlag = process.env.NEXT_PUBLIC_PSEUDO_LOC;
    const originalExpo = process.env.EXPO_PUBLIC_PSEUDO_LOC;
    delete process.env.NEXT_PUBLIC_PSEUDO_LOC;
    delete process.env.EXPO_PUBLIC_PSEUDO_LOC;
    expect(isPseudoLocEnabled()).toBe(false);
    if (originalFlag !== undefined) process.env.NEXT_PUBLIC_PSEUDO_LOC = originalFlag;
    if (originalExpo !== undefined) process.env.EXPO_PUBLIC_PSEUDO_LOC = originalExpo;
  });

  it("returns true when NEXT_PUBLIC_PSEUDO_LOC=1 in non-production", () => {
    const originalFlag = process.env.NEXT_PUBLIC_PSEUDO_LOC;
    process.env.NEXT_PUBLIC_PSEUDO_LOC = "1";
    expect(isPseudoLocEnabled()).toBe(true);
    if (originalFlag === undefined) delete process.env.NEXT_PUBLIC_PSEUDO_LOC;
    else process.env.NEXT_PUBLIC_PSEUDO_LOC = originalFlag;
  });

  it("returns true when EXPO_PUBLIC_PSEUDO_LOC=true in non-production", () => {
    const originalExpo = process.env.EXPO_PUBLIC_PSEUDO_LOC;
    process.env.EXPO_PUBLIC_PSEUDO_LOC = "true";
    expect(isPseudoLocEnabled()).toBe(true);
    if (originalExpo === undefined) delete process.env.EXPO_PUBLIC_PSEUDO_LOC;
    else process.env.EXPO_PUBLIC_PSEUDO_LOC = originalExpo;
  });
});
