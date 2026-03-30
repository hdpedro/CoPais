/* ------------------------------------------------------------------ */
/* Event Parser — factory with env-based switching                     */
/* ------------------------------------------------------------------ */

export type { EventParser } from "./event-parser.interface";
export type { ParsedEventData, ParseResult, ParserMetadata } from "./types";

import { EventParser } from "./event-parser.interface";
import { PilotParser } from "./pilot-parser";

/**
 * Returns the appropriate parser based on AI_MODE env var.
 * Default: "pilot" (free tier — Tesseract + Groq)
 * Future:  "production" (Google Vision + Claude/GPT)
 */
export function getEventParser(): EventParser {
  const mode = process.env.AI_MODE || "pilot";

  if (mode === "production") {
    // Future: import and return ProductionParser
    // return new ProductionParser();
    throw new Error(
      "ProductionParser not yet implemented. Set AI_MODE=pilot or remove the variable."
    );
  }

  return new PilotParser();
}
