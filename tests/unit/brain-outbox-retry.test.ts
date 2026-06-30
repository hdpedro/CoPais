import { describe, it, expect } from "vitest";
import {
  isDeadLettered,
  nextRetryDelayMs,
  MAX_OUTBOX_ATTEMPTS,
} from "@/lib/ai/brain/outbox-retry";

describe("outbox retry — backoff 1/5/30 + dead-letter", () => {
  it("MAX = 1 inicial + 3 retries", () => {
    expect(MAX_OUTBOX_ATTEMPTS).toBe(4);
  });

  it("backoff cresce 1 → 5 → 30 min", () => {
    expect(nextRetryDelayMs(1)).toBe(1 * 60_000);
    expect(nextRetryDelayMs(2)).toBe(5 * 60_000);
    expect(nextRetryDelayMs(3)).toBe(30 * 60_000);
  });

  it("clampa fora do range", () => {
    expect(nextRetryDelayMs(0)).toBe(1 * 60_000);
    expect(nextRetryDelayMs(99)).toBe(30 * 60_000);
  });

  it("dead-letter só após esgotar (>=4 tentativas)", () => {
    expect(isDeadLettered(1)).toBe(false);
    expect(isDeadLettered(3)).toBe(false);
    expect(isDeadLettered(4)).toBe(true);
    expect(isDeadLettered(5)).toBe(true);
  });
});
