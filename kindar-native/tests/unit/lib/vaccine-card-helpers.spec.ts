/**
 * vaccine-card-helpers — testes do dedupe/warning local.
 *
 * Boas práticas validadas:
 *   - canonicalize remove acento + alias (paridade simplificada com banco)
 *   - duplicate detection respeita janela de 30 dias e cruza por canonical
 *   - old_annual só dispara pra vacinas anuais (Influenza/COVID)
 *   - low_confidence usa threshold 0.6 (preserva chip "Revisar" mas não desmarca)
 *   - shouldPreUncheck só desmarca duplicates (sinal forte)
 */
import { describe, expect, test } from 'vitest';
import {
  canonicalizeVaccineName,
  detectVaccineWarnings,
  shouldPreUncheck,
  __internals,
} from '../../../app/_src/lib/vaccine-card-helpers';

describe('canonicalizeVaccineName', () => {
  test('remove acentos e normaliza minúsculas', () => {
    expect(canonicalizeVaccineName('Pneumocócica')).toBe('pneumo');
    expect(canonicalizeVaccineName('Tríplice Viral')).toBe('scr');
    expect(canonicalizeVaccineName('Hepatite A')).toBe('hep_a');
  });

  test('alias map normaliza variantes BR comuns', () => {
    expect(canonicalizeVaccineName('Gripe')).toBe('influenza');
    expect(canonicalizeVaccineName('COVID-19')).toBe('covid');
    expect(canonicalizeVaccineName('Catapora')).toBe('varicela');
    expect(canonicalizeVaccineName('Gotinha')).toBe('vop');
    expect(canonicalizeVaccineName('Antipolio')).toBe('vop');
  });

  test('trim + colapsa espaços múltiplos', () => {
    expect(canonicalizeVaccineName('  HEPATITE   A  ')).toBe('hep_a');
  });

  test('fallback retorna o canonical não-mapeado quando não há alias', () => {
    expect(canonicalizeVaccineName('Vacina Experimental X')).toBe('vacina experimental x');
  });
});

describe('detectVaccineWarnings — duplicate', () => {
  test('detecta duplicate quando mesma vacina + janela ±30d', () => {
    const warnings = detectVaccineWarnings(
      { vaccine_name: 'Gripe', administered_date: '2026-05-23' },
      [{ vaccine_name: 'Influenza (gripe)', administered_date: '2026-05-10' }],
    );
    expect(warnings).toContainEqual({ kind: 'duplicate', existingDate: '2026-05-10' });
  });

  test('não marca duplicate quando fora da janela de 30 dias', () => {
    const warnings = detectVaccineWarnings(
      { vaccine_name: 'Gripe', administered_date: '2026-05-23' },
      [{ vaccine_name: 'Influenza', administered_date: '2026-01-01' }],
    );
    expect(warnings.find(w => w.kind === 'duplicate')).toBeUndefined();
  });

  test('não marca duplicate pra vacinas diferentes (canonical distinto)', () => {
    const warnings = detectVaccineWarnings(
      { vaccine_name: 'Hepatite B', administered_date: '2026-05-23' },
      [{ vaccine_name: 'Hepatite A', administered_date: '2026-05-23' }],
    );
    expect(warnings).toEqual([]);
  });
});

describe('detectVaccineWarnings — old_annual', () => {
  const NOW = new Date('2026-05-23T12:00:00Z');

  test('Influenza com data 2 anos atrás dispara warning', () => {
    const warnings = detectVaccineWarnings(
      { vaccine_name: 'Influenza', administered_date: '2023-05-25' },
      [],
      NOW,
    );
    expect(warnings).toContainEqual({ kind: 'old_annual', year: 2023 });
  });

  test('Influenza ano passado NÃO dispara (tolerância)', () => {
    const warnings = detectVaccineWarnings(
      { vaccine_name: 'Influenza', administered_date: '2025-08-10' },
      [],
      NOW,
    );
    expect(warnings.find(w => w.kind === 'old_annual')).toBeUndefined();
  });

  test('BCG (não-anual) com data antiga NÃO dispara', () => {
    const warnings = detectVaccineWarnings(
      { vaccine_name: 'BCG', administered_date: '2017-08-23' },
      [],
      NOW,
    );
    expect(warnings.find(w => w.kind === 'old_annual')).toBeUndefined();
  });
});

describe('detectVaccineWarnings — low_confidence', () => {
  test('confidence_score < 0.6 dispara warning', () => {
    const warnings = detectVaccineWarnings(
      { vaccine_name: 'BCG', administered_date: '2023-01-15', confidence_score: 0.45 },
      [],
    );
    expect(warnings).toContainEqual({ kind: 'low_confidence', score: 0.45 });
  });

  test('confidence_score >= 0.6 NÃO dispara', () => {
    const warnings = detectVaccineWarnings(
      { vaccine_name: 'BCG', administered_date: '2023-01-15', confidence_score: 0.85 },
      [],
    );
    expect(warnings.find(w => w.kind === 'low_confidence')).toBeUndefined();
  });

  test('confidence_score ausente NÃO dispara', () => {
    const warnings = detectVaccineWarnings(
      { vaccine_name: 'BCG', administered_date: '2023-01-15' },
      [],
    );
    expect(warnings.find(w => w.kind === 'low_confidence')).toBeUndefined();
  });
});

describe('shouldPreUncheck', () => {
  test('desmarca quando há duplicate (sinal forte)', () => {
    expect(shouldPreUncheck([{ kind: 'duplicate', existingDate: '2026-05-10' }])).toBe(true);
  });

  test('NÃO desmarca pra old_annual ou low_confidence (sinais suaves)', () => {
    expect(shouldPreUncheck([{ kind: 'old_annual', year: 2023 }])).toBe(false);
    expect(shouldPreUncheck([{ kind: 'low_confidence', score: 0.3 }])).toBe(false);
  });

  test('desmarca quando lista contém duplicate + outros', () => {
    expect(shouldPreUncheck([
      { kind: 'low_confidence', score: 0.3 },
      { kind: 'duplicate', existingDate: '2026-05-10' },
    ])).toBe(true);
  });

  test('lista vazia = mantém marcado', () => {
    expect(shouldPreUncheck([])).toBe(false);
  });
});

describe('thresholds & constantes', () => {
  test('LOW_CONFIDENCE_THRESHOLD alinha com prompt da AI (0.6)', () => {
    expect(__internals.LOW_CONFIDENCE_THRESHOLD).toBe(0.6);
  });

  test('DUPLICATE_WINDOW_DAYS é 30', () => {
    expect(__internals.DUPLICATE_WINDOW_DAYS).toBe(30);
  });

  test('ANNUAL_CANONICAL cobre Influenza e COVID', () => {
    expect(__internals.ANNUAL_CANONICAL.has('influenza')).toBe(true);
    expect(__internals.ANNUAL_CANONICAL.has('covid')).toBe(true);
  });
});

describe('cenário real Angelino 2026-05-23', () => {
  test('OCR detecta 2 Influenzas com data 2023, dup detection pega a segunda', () => {
    const NOW = new Date('2026-05-23T12:00:00Z');
    const existing: { vaccine_name: string; administered_date: string }[] = [];

    // Primeiro processamento bem-sucedido: usuário salva 1ª Influenza
    const first = detectVaccineWarnings(
      { vaccine_name: 'Influenza (gripe)', administered_date: '2023-05-23', confidence_score: 0.5 },
      existing,
      NOW,
    );
    // Não detecta duplicate (nada no banco), mas detecta old_annual + low_confidence
    expect(first.find(w => w.kind === 'duplicate')).toBeUndefined();
    expect(first.find(w => w.kind === 'old_annual')).toBeDefined();
    expect(first.find(w => w.kind === 'low_confidence')).toBeDefined();

    // Após salvar, segundo upload tenta gravar de novo
    existing.push({ vaccine_name: 'Influenza (gripe)', administered_date: '2023-05-23' });
    const second = detectVaccineWarnings(
      { vaccine_name: 'Influenza (gripe)', administered_date: '2023-05-25', confidence_score: 0.5 },
      existing,
      NOW,
    );
    // Agora pega duplicate (dentro de 30d) + old_annual + low_confidence
    expect(second.find(w => w.kind === 'duplicate')).toEqual({ kind: 'duplicate', existingDate: '2023-05-23' });
    expect(shouldPreUncheck(second)).toBe(true);
  });
});
