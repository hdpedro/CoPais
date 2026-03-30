/* ------------------------------------------------------------------ */
/* Event parser types                                                  */
/* ------------------------------------------------------------------ */

export interface ParsedEventData {
  title: string | null;
  date: string | null;        // ISO: YYYY-MM-DD
  start_time: string | null;  // HH:MM
  end_time: string | null;    // HH:MM
  location: string | null;
  notes: string | null;
}

export interface ParseResult {
  success: boolean;
  data: ParsedEventData | null;
  rawText: string;
  error?: string;
}

export interface ParserMetadata {
  ocrConfidence?: number;
  processingTimeMs: number;
  parserType: "pilot" | "production";
}
