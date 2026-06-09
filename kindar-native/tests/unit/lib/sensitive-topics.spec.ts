/**
 * sensitive-topics — paridade dos valores de tópico com o DB/PWA.
 *
 * Regressão do bug Matheus (2026-06-08): o native mandava uma taxonomia PT
 * (consumo/conflito/sexualidade/saude_mental/…) que NÃO batia com o enum
 * sensitive_topic_type nem com VALID_TOPICS de src/app/api/sensitive-notes/route.ts,
 * então o servidor coagia tudo (menos 'bullying') pra 'other'. Este teste trava
 * os valores no set canônico em inglês.
 */
import { describe, expect, test } from 'vitest';
import { SENSITIVE_TOPICS } from '../../../app/_src/lib/sensitive-topics';

// Espelho do enum DB `sensitive_topic_type` + VALID_TOPICS da rota PWA.
const CANONICAL = [
  'gender_violence',
  'sexual_violence',
  'bullying',
  'mental_health',
  'substance_abuse',
  'safety',
  'other',
];

describe('SENSITIVE_TOPICS (paridade DB/PWA)', () => {
  test('bate exatamente com o enum sensitive_topic_type + VALID_TOPICS', () => {
    expect([...SENSITIVE_TOPICS].sort()).toEqual([...CANONICAL].sort());
  });

  test('contém bullying e other', () => {
    expect(SENSITIVE_TOPICS).toContain('bullying');
    expect(SENSITIVE_TOPICS).toContain('other');
  });

  test('NÃO contém os valores PT antigos (que a rota coage pra other)', () => {
    const legacyPt = ['consumo', 'conflito', 'sexualidade', 'saude_mental', 'outro', 'abuso', 'escola', 'divorcio', 'morte_luto'];
    for (const pt of legacyPt) {
      expect(SENSITIVE_TOPICS as readonly string[]).not.toContain(pt);
    }
  });
});
