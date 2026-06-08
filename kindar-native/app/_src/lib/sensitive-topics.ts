/**
 * Sensitive-topic values — single source of truth for native.
 *
 * MUST match the DB enum `sensitive_topic_type` AND the PWA's VALID_TOPICS in
 * src/app/api/sensitive-notes/route.ts. The server coerces anything else to
 * 'other' — so a value mismatch silently loses the topic.
 *
 * Bug Matheus (2026-06-08): native shipped a different PT taxonomy
 * (consumo/conflito/sexualidade/saude_mental/…) that didn't match these EN enum
 * values, so every topic except 'bullying' (the same word in both languages)
 * fell back to 'other'. Pure (no platform imports) so it stays unit-testable.
 */
export const SENSITIVE_TOPICS = [
  'gender_violence',
  'sexual_violence',
  'bullying',
  'mental_health',
  'substance_abuse',
  'safety',
  'other',
] as const;

export type SensitiveTopic = (typeof SENSITIVE_TOPICS)[number];
