/* ------------------------------------------------------------------ */
/* Prescription utilities — normalization, classification, mapping     */
/* ------------------------------------------------------------------ */

/**
 * Normalize medication name for cache and comparison.
 * Removes accents, lowercases, trims, collapses whitespace.
 */
export function normalizeMedName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

/**
 * Map frequency string to hours interval.
 * "8/8h" → 8, "12/12h" → 12, "1x/dia" → 24, etc.
 */
export function mapFrequencyToHours(freq: string): number | null {
  if (!freq) return null;
  const intervalMatch = freq.match(/(\d+)\s*\/\s*(\d+)\s*h/i);
  if (intervalMatch) return parseInt(intervalMatch[1]);
  if (/1\s*x?\s*\/?\s*dia/i.test(freq)) return 24;
  if (/2\s*x?\s*\/?\s*dia/i.test(freq)) return 12;
  if (/3\s*x?\s*\/?\s*dia/i.test(freq)) return 8;
  if (/4\s*x?\s*\/?\s*dia/i.test(freq)) return 6;
  if (/6\s*\/\s*6\s*h/i.test(freq)) return 6;
  return null;
}

const COMMON_ANTIBIOTICS = [
  "amoxicilina", "azitromicina", "cefalexina", "cefuroxima", "ceftriaxona",
  "claritromicina", "metronidazol", "sulfametoxazol", "trimetoprima",
  "ciprofloxacino", "levofloxacino", "penicilina", "ampicilina",
  "eritromicina", "clindamicina", "nitrofurantoina", "cefaclor",
  "amoxicilina+clavulanato", "bactrim", "clavulin",
];

/**
 * Check if a medication is an antibiotic based on name.
 */
export function isAntibiotic(name: string): boolean {
  const normalized = normalizeMedName(name);
  return COMMON_ANTIBIOTICS.some((a) => normalized.includes(a));
}

/**
 * Compute end date from start date + duration string.
 * "7 dias" → date 7 days after start.
 */
export function computeEndDate(startDate: string, duration: string | null): string | null {
  if (!duration) return null;
  const match = duration.match(/(\d+)\s*dias?/i);
  if (!match) return null;
  const days = parseInt(match[1]);
  const date = new Date(startDate + "T12:00:00");
  date.setDate(date.getDate() + days);
  return date.toISOString().split("T")[0];
}

/**
 * Compute child age string from birth date.
 * Returns "X anos" or "X meses" for babies.
 */
export function computeChildAge(birthDate: string): string {
  const birth = new Date(birthDate + "T12:00:00");
  const now = new Date();
  const months = (now.getFullYear() - birth.getFullYear()) * 12 + (now.getMonth() - birth.getMonth());
  if (months < 24) return `${months} meses`;
  return `${Math.floor(months / 12)} anos`;
}

/** Medication parsed from OCR */
export interface ParsedMedication {
  name: string;
  normalized_name: string;
  dosage: string;
  frequency: string;
  duration: string | null;
  route: string | null;
  notes: string | null;
}

/** Prescription data from OCR */
export interface PrescriptionData {
  doctor_name: string | null;
  crm: string | null;
  clinic: string | null;
  prescription_date: string | null;
  medications: ParsedMedication[];
}

/** Clinical inference per medication */
export interface ClinicalInference {
  medication_normalized_name: string;
  possible_conditions: string[];
  category: string;
  severity_level: "leve" | "moderado" | "grave";
  confidence: number;
  common_usage_note: string;
}

/** History context from cross-reference */
export interface HistoryContext {
  recent_antibiotics: { name: string; date: string }[];
  recurrence_patterns: { condition: string; count: number; last_date: string }[];
  related_symptoms: { type: string; date: string; intensity: string | null }[];
  allergy_conflicts: { medication: string; allergy_name: string; severity: string }[];
}

/** Alert generated from analysis */
export interface ClinicalAlert {
  type: "allergy_conflict" | "recurrence" | "antibiotic_frequency" | "high_severity";
  message: string;
  severity: "warning" | "critical";
}

/** Full inference result */
export interface InferenceResult {
  id: string;
  prescription_data: PrescriptionData;
  medications_parsed: ParsedMedication[];
  clinical_inferences: ClinicalInference[];
  history_context: HistoryContext;
  ai_summary: string | null;
  alerts: ClinicalAlert[];
  inference_confidence: number | null;
  processing_status: "completed" | "partial" | "failed";
  source_image_url: string | null;
}
