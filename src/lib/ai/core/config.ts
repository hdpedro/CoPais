/* ------------------------------------------------------------------ */
/* AI Config — feature flags, limits, billing                          */
/* ------------------------------------------------------------------ */

/** Master flag: when true, enforce usage limits per plan */
export const AI_BILLING_ENABLED = false;

/** Usage limits per feature per plan (requests per day) */
export const AI_LIMITS = {
  free: {
    invite_parser: 10,
    assistant_chat: 50,
    assistant_tool: 30,
    summary: 10,
    suggestion: 20,
    prescription_ocr: 5,
    clinical_inference: 3,
  },
  premium: {
    invite_parser: 100,
    assistant_chat: 500,
    assistant_tool: 300,
    summary: 100,
    suggestion: 200,
    prescription_ocr: 50,
    clinical_inference: 50,
  },
} as const;

/** Provider priority order */
export const PROVIDER_ORDER = ["Groq", "Together", "Gemini"] as const;

/** Default timeouts per feature (ms) */
export const TIMEOUTS = {
  invite_parser: 30000,
  assistant_chat: 10000,
  assistant_tool: 10000,
  summary: 15000,
  suggestion: 8000,
  prescription_ocr: 30000,
  clinical_inference: 20000,
} as const;
