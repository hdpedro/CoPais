/**
 * i18n — ICU plural/select + interpolação (formatMessage).
 *
 * Por que existe: o `t()` nativo só fazia `{var}`/`{{var}}`. Strings ICU
 * (`{count, plural, one {…} other {…}}`, iguais às do PWA) vazavam CRUAS pro
 * user — bug do briefing "Sua Atenção" no device do dono (14/jun): o card
 * mostrava `{count, plural, one {Aconteceu? Jiu Jitsu} other {…}}` literal.
 * Estes testes travam a renderização ICU + garantem que strings SEM ICU
 * continuam idênticas (blast radius contido).
 */
import { describe, it, expect, vi } from 'vitest';

// formatMessage não usa AsyncStorage, mas importar o módulo i18n o puxa.
vi.mock('@react-native-async-storage/async-storage', () => ({
  default: { getItem: vi.fn(), setItem: vi.fn() },
}));

import { formatMessage } from '../../../app/_src/i18n';

// Strings reais do briefing (copiadas de locales/pt.json) — o que o device viu.
const PENDING_REPORT_FAMILY =
  '{count, plural, one {Aconteceu? {activity}} other {# atividades esperando seu relato}}';
const PENDING_REPORT =
  '{count, plural, one {Aconteceu? {activity} de {child}} other {# atividades esperando seu relato}}';
const SCHOOL_NEW = '{count, plural, one {1 novidade da escola} other {# novidades da escola}}';

describe('formatMessage — ICU plural (bug do briefing 14/jun)', () => {
  it('pendingReportFamily count=1 → ramo "one" com {activity} interpolado', () => {
    expect(formatMessage(PENDING_REPORT_FAMILY, { count: 1, activity: 'Jiu Jitsu' }, 'pt')).toBe(
      'Aconteceu? Jiu Jitsu',
    );
  });
  it('pendingReportFamily count=3 → ramo "other" com # = contagem', () => {
    expect(formatMessage(PENDING_REPORT_FAMILY, { count: 3, activity: 'Jiu Jitsu' }, 'pt')).toBe(
      '3 atividades esperando seu relato',
    );
  });
  it('pendingReport com child (one) interpola activity + child', () => {
    expect(formatMessage(PENDING_REPORT, { count: 1, activity: 'Futsal', child: 'Otto' }, 'pt')).toBe(
      'Aconteceu? Futsal de Otto',
    );
  });
  it('schoolNew one usa literal "1 novidade", other usa # ', () => {
    expect(formatMessage(SCHOOL_NEW, { count: 1 }, 'pt')).toBe('1 novidade da escola');
    expect(formatMessage(SCHOOL_NEW, { count: 5 }, 'pt')).toBe('5 novidades da escola');
  });
});

describe('formatMessage — select + =N exato', () => {
  it('select escolhe pelo valor, cai pra other', () => {
    const s = '{g, select, male {ele} female {ela} other {elu}}';
    expect(formatMessage(s, { g: 'female' }, 'pt')).toBe('ela');
    expect(formatMessage(s, { g: 'x' }, 'pt')).toBe('elu');
  });
  it('=0 exato vence a categoria CLDR', () => {
    const s = '{count, plural, =0 {nada} one {um} other {# itens}}';
    expect(formatMessage(s, { count: 0 }, 'pt')).toBe('nada');
    expect(formatMessage(s, { count: 1 }, 'pt')).toBe('um');
    expect(formatMessage(s, { count: 4 }, 'pt')).toBe('4 itens');
  });
});

describe('formatMessage — strings SEM ICU seguem idênticas (regressão Aline)', () => {
  it('{var} single brace interpola', () => {
    expect(formatMessage('Olá {name}', { name: 'Henrique' }, 'pt')).toBe('Olá Henrique');
  });
  it('{{var}} double brace (i18next legacy) interpola', () => {
    expect(formatMessage('{{count}} registros', { count: 21 }, 'pt')).toBe('21 registros');
  });
  it('sem params devolve a string crua', () => {
    expect(formatMessage('Texto fixo', undefined, 'pt')).toBe('Texto fixo');
  });
  it('param ausente preserva o placeholder (não quebra)', () => {
    expect(formatMessage('Oi {name}', { other: 'x' }, 'pt')).toBe('Oi {name}');
  });
  it('string com chave literal mas sem plural/select não entra no ICU', () => {
    // `{foo}` é interpolação simples, não ICU — não deve ser tocado pelo renderer.
    expect(formatMessage('valor: {foo}', { foo: 'ok' }, 'pt')).toBe('valor: ok');
  });
});
