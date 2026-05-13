/**
 * Drift guard: the PWA and the mobile app each maintain their own
 * `EVENTS` catalog (no monorepo — EAS uploads only `kindar-native/`).
 * If the catalogs diverge silently, PostHog `breakdown: platform`
 * queries break.
 *
 * This test enforces the only invariant that matters: every mobile
 * event MUST also exist in the PWA catalog. The PWA can have extra
 * events (e.g., web-only flows like coupon-applied) — that's fine.
 *
 * Parsing strategy: regex over file text. Importing the mobile module
 * would pull `posthog-react-native` into the Vitest environment, which
 * fails because the SDK expects a React Native runtime.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const PWA_ANALYTICS = join(__dirname, "../../src/lib/analytics.ts");
const MOBILE_ANALYTICS = join(
  __dirname,
  "../../kindar-native/app/_src/lib/analytics.ts"
);

function extractEvents(filePath: string): Set<string> {
  const source = readFileSync(filePath, "utf8");
  const eventsBlockMatch = source.match(/EVENTS\s*=\s*\{([\s\S]*?)\}\s*as\s*const/);
  if (!eventsBlockMatch) {
    throw new Error(`Could not locate EVENTS block in ${filePath}`);
  }
  const block = eventsBlockMatch[1];
  // Match `KEY: 'value'` and `KEY: "value"` — ignores comment lines.
  const pairRe = /^\s*[A-Z_][A-Z0-9_]*\s*:\s*["']([^"']+)["']/gm;
  const values = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = pairRe.exec(block)) !== null) {
    values.add(m[1]);
  }
  return values;
}

describe("analytics EVENTS catalog parity", () => {
  it("every mobile event also exists in the PWA catalog", () => {
    const pwaEvents = extractEvents(PWA_ANALYTICS);
    const mobileEvents = extractEvents(MOBILE_ANALYTICS);

    // Sanity: both catalogs are non-empty, otherwise the regex parse
    // silently failed.
    expect(pwaEvents.size).toBeGreaterThan(0);
    expect(mobileEvents.size).toBeGreaterThan(0);

    const missing = [...mobileEvents].filter((e) => !pwaEvents.has(e));
    expect(missing, `Mobile events missing from PWA catalog: ${missing.join(", ")}`).toEqual([]);
  });
});
