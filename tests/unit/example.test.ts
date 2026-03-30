import { describe, it, expect } from "vitest";
import { parseTime, parseAmount, parseRelativeDate } from "@/lib/ai-local-parser";

describe("Smoke tests", () => {
  it("should pass a basic assertion", () => {
    expect(1 + 1).toBe(2);
  });

  it("should have correct environment", () => {
    expect(typeof window).toBe("object"); // jsdom
    expect(typeof document).toBe("object");
  });
});

describe("parseTime", () => {
  it("parses HH:MM format", () => {
    expect(parseTime("reunião às 14:30")).toBe("14:30");
  });

  it("parses hora cheia", () => {
    expect(parseTime("às 3 horas")).toBe("03:00");
  });

  it("returns empty for no time", () => {
    expect(parseTime("sem horário")).toBe("");
  });
});

describe("parseAmount", () => {
  it("parses R$ currency", () => {
    expect(parseAmount("custou R$ 150,00")).toBe(150);
  });

  it("parses plain number", () => {
    expect(parseAmount("valor 200")).toBe(200);
  });

  it("returns 0 for no amount", () => {
    expect(parseAmount("sem valor")).toBe(0);
  });
});

// Helper: local date as YYYY-MM-DD (avoids UTC shift from toISOString)
function localDate(offsetDays = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

describe("parseRelativeDate", () => {
  it("parses 'hoje'", () => {
    expect(parseRelativeDate("hoje")).toBe(localDate(0));
  });

  it("parses 'amanhã'", () => {
    expect(parseRelativeDate("amanhã")).toBe(localDate(1));
  });
});
