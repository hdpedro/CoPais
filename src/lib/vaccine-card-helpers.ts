/**
 * vaccine-card-helpers.ts — helpers client-side para tela carteirinha (PWA).
 *
 * **PARIDADE COM NATIVE**: este arquivo é o espelho de
 * `kindar-native/app/_src/lib/vaccine-card-helpers.ts`. Toda mudança aqui
 * DEVE ser replicada no native (CLAUDE.md "paridade PWA ↔ Native"). Em
 * particular: ALIAS_MAP, ANNUAL_CANONICAL, LOW_CONFIDENCE_THRESHOLD,
 * DUPLICATE_WINDOW_DAYS, lógica de canonicalize.
 *
 * Mapeia 3 tipos de warning visíveis ao usuário antes de salvar via
 * createVaccinationRecordsBulk:
 *
 *   - 'duplicate'      → já existe vaccination_record similar (mesmo
 *                        nome canonicalizado, janela ±30 dias). Pré-marca
 *                        selected=false pra evitar registrar 2 Influenzas
 *                        no mesmo dia (caso real Angelino 2026-05-23).
 *
 *   - 'old_annual'     → vacina anual (Influenza, COVID, Gripe) com data
 *                        muito antiga (> ano atual − 1). Provável OCR
 *                        leu campo errado (caso Angelino: Influenza
 *                        salva como 2023 quando era 2025).
 *
 *   - 'low_confidence' → confidence_score < 0.6 reportado pela AI.
 *                        Chip "Revisar" sem pré-desmarcar.
 *
 * Banco normaliza catalog_id na escrita (trigger migration 00093), mas
 * UX deve prevenir o erro ANTES do submit pra dar feedback imediato.
 */

/** Normalização canônica para comparação local (cross-platform JS).
 *  Mirror simplificado de vaccine_name_canonical no banco (PostgreSQL),
 *  com unaccent via Unicode + alias map mínimo pros casos brasileiros. */
const ALIAS_MAP: Record<string, string> = {
  // Influenza/Gripe
  gripe: "influenza",
  flu: "influenza",
  fluarix: "influenza",
  "fluarix tetra": "influenza",
  influvac: "influenza",
  vaxigrip: "influenza",
  // COVID
  "covid-19": "covid",
  "sars-cov-2": "covid",
  coronavac: "covid",
  // Polio
  "polio oral": "vop",
  "polio inativada": "vip",
  antipolio: "vop",
  sabin: "vop",
  salk: "vip",
  gotinha: "vop",
  // Varicela
  catapora: "varicela",
  // HPV
  papilomavirus: "hpv",
  // DTPa
  dtp: "dtpa",
  // Pneumo
  pneumococica: "pneumo",
  pneumo10: "pneumo",
  pneumo13: "pneumo",
  // Meningo
  "meningococica c": "meningo_c",
  "meningococica acwy": "meningo_acwy",
  // Tríplice
  "triplice viral": "scr",
  "tetra viral": "scrv",
  // Hexa/Penta
  hexavalente: "hexa",
  pentavalente: "penta",
  // Hep
  "hepatite a": "hep_a",
  "hepatite b": "hep_b",
  // Febre amarela
  "febre amarela": "febre_amarela",
};

/** Lista de catalog codes que são VACINAS ANUAIS — drive do warning old_annual. */
const ANNUAL_CANONICAL = new Set(["influenza", "covid"]);

/** Threshold de confidence abaixo do qual mostramos chip "Revisar". */
const LOW_CONFIDENCE_THRESHOLD = 0.6;

/** Janela em dias pra considerar duplicata (mesma vacina ± N dias). */
const DUPLICATE_WINDOW_DAYS = 30;

/**
 * Canonicaliza um nome de vacina: lower + trim + sem acento + alias map.
 *
 * Espelha vaccine_name_canonical do banco (00093) o suficiente pra dedupe
 * local. Não substitui o trigger BEFORE INSERT — apenas previne dups antes
 * do submit pra feedback imediato.
 */
export function canonicalizeVaccineName(name: string): string {
  const stripped = name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // remove combining diacritics (unaccent)
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
  // Match direto no alias map
  if (ALIAS_MAP[stripped]) return ALIAS_MAP[stripped];
  // Match sem parenteses ("Influenza (gripe)" → "influenza")
  const noParens = stripped
    .replace(/\s*\([^)]*\)\s*/g, " ")
    .trim()
    .replace(/\s+/g, " ");
  if (noParens !== stripped && ALIAS_MAP[noParens]) return ALIAS_MAP[noParens];
  return noParens || stripped;
}

export interface ExistingVaccinationRecord {
  vaccine_name: string;
  administered_date: string | null;
  catalog_id?: string | null;
}

export type VaccineWarning =
  | { kind: "duplicate"; existingDate: string | null }
  | { kind: "old_annual"; year: number }
  | { kind: "low_confidence"; score: number };

interface ParsedForDetection {
  vaccine_name: string;
  administered_date: string | null;
  confidence_score?: number | null;
  date_confidence?: number | null;
}

function daysBetweenIso(a: string, b: string): number {
  const dA = new Date(a + "T12:00:00").getTime();
  const dB = new Date(b + "T12:00:00").getTime();
  return Math.abs(dA - dB) / 86_400_000;
}

/**
 * Detecta warnings pra UI da carteirinha. Retorna lista (pode ter múltiplos).
 */
export function detectVaccineWarnings(
  parsed: ParsedForDetection,
  existing: ExistingVaccinationRecord[],
  now: Date = new Date(),
): VaccineWarning[] {
  const out: VaccineWarning[] = [];
  const canon = canonicalizeVaccineName(parsed.vaccine_name);

  // 1. Duplicate detection
  if (parsed.administered_date) {
    for (const e of existing) {
      if (!e.administered_date) continue;
      const sameName = canonicalizeVaccineName(e.vaccine_name) === canon;
      if (!sameName) continue;
      const dist = daysBetweenIso(parsed.administered_date, e.administered_date);
      if (dist <= DUPLICATE_WINDOW_DAYS) {
        out.push({ kind: "duplicate", existingDate: e.administered_date });
        break;
      }
    }
  }

  // 2. Old annual — vacina anual com data antiga (> ano atual − 1).
  // Heurística específica pro caso Angelino: OCR leu 2023 em Influenza 2025.
  if (ANNUAL_CANONICAL.has(canon) && parsed.administered_date) {
    const year = Number(parsed.administered_date.slice(0, 4));
    if (Number.isFinite(year) && year < now.getFullYear() - 1) {
      out.push({ kind: "old_annual", year });
    }
  }

  // 3. Low confidence — chip "Revisar" mas sem desmarcar (sinal suave).
  const score = parsed.confidence_score ?? null;
  if (score !== null && score < LOW_CONFIDENCE_THRESHOLD) {
    out.push({ kind: "low_confidence", score });
  }

  return out;
}

/**
 * Determina se uma vacina deve vir pré-desmarcada baseado em seus warnings.
 * Duplicatas são pré-desmarcadas (sinal forte). Outros warnings ficam
 * marcados (sinal suave — user precisa olhar mas pode confirmar).
 */
export function shouldPreUncheck(warnings: VaccineWarning[]): boolean {
  return warnings.some((w) => w.kind === "duplicate");
}

/** Test-only constants pra unit tests assertarem comportamento. */
export const __internals = {
  ALIAS_MAP,
  ANNUAL_CANONICAL,
  LOW_CONFIDENCE_THRESHOLD,
  DUPLICATE_WINDOW_DAYS,
};

export const LOW_CONFIDENCE_THRESHOLD_VALUE = LOW_CONFIDENCE_THRESHOLD;
export const DUPLICATE_WINDOW_DAYS_VALUE = DUPLICATE_WINDOW_DAYS;
