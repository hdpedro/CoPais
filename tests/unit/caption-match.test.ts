import { describe, it, expect } from "vitest";
import { matchChildFromCaption } from "@/lib/whatsapp/caption-match";

const kids = [
  { id: "1", full_name: "Bernardo Silva", birth_date: "2018-01-01" },
  { id: "2", full_name: "Beatriz Silva", birth_date: "2020-01-01" },
  { id: "3", full_name: "João Pedro", birth_date: "2016-01-01" },
];

describe("matchChildFromCaption", () => {
  it("matches a child by first name in the caption", () => {
    expect(matchChildFromCaption("receita Bernardo", kids)?.id).toBe("1");
    expect(matchChildFromCaption("receita beatriz amoxicilina", kids)?.id).toBe("2");
  });

  it("is accent-insensitive in both directions", () => {
    expect(matchChildFromCaption("receita joao", kids)?.id).toBe("3");
    expect(matchChildFromCaption("receita João", kids)?.id).toBe("3");
  });

  it("returns null when no first name is present (must ask, never guess)", () => {
    expect(matchChildFromCaption("receita", kids)).toBeNull();
    expect(matchChildFromCaption("", kids)).toBeNull();
    expect(matchChildFromCaption(undefined, kids)).toBeNull();
  });

  it("returns null when the named person is not in the group", () => {
    expect(matchChildFromCaption("receita Carlos", kids)).toBeNull();
  });

  it("matches the first child when multiple names appear", () => {
    // Bernardo comes first in the list, so it wins on a tie.
    expect(matchChildFromCaption("receita do Bernardo e da Beatriz", kids)?.id).toBe("1");
  });

  it("ignores children with empty names", () => {
    const withEmpty = [{ id: "9", full_name: "", birth_date: null }, ...kids];
    expect(matchChildFromCaption("receita Beatriz", withEmpty)?.id).toBe("2");
  });
});
