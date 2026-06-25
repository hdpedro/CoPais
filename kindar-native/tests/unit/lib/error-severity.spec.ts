/**
 * transientSeverity — contrato de classificação de ruído transiente.
 *
 * Por que esse teste existe:
 *
 *   17/jun/2026: um `TypeError: Network request failed` em
 *   `useDashboard.loadData` (user real offline) subiu como severity 'error' e
 *   pingou o Discord — falso-alarme. O `push-setup.ts` já rebaixava esse exato
 *   erro pra 'info', mas a regra estava inline e duplicada; o dashboard não a
 *   tinha. Este helper centraliza a classificação e este teste trava o
 *   contrato pra que nenhum caller volte a tratar ruído transiente como erro
 *   real (nem o contrário: um erro real ser silenciado).
 */
import { describe, it, expect } from 'vitest';
import { transientSeverity } from '@/lib/error-severity';

describe('transientSeverity', () => {
  it('rebaixa falha de rede pura do fetch RN (TypeError) pra info', () => {
    expect(transientSeverity(new TypeError('Network request failed'))).toBe('info');
  });

  it('reconhece TimeoutError pelo name (sem acoplar a classe)', () => {
    const e = new Error('Timeout (15000ms): useDashboard:rpc');
    e.name = 'TimeoutError';
    expect(transientSeverity(e)).toBe('info');
  });

  it('rebaixa condições de device/serviço do FCM pra info', () => {
    expect(
      transientSeverity(new Error('java.io.IOException: TOO_MANY_REGISTRATIONS')),
    ).toBe('info');
    expect(transientSeverity(new Error('SERVICE_NOT_AVAILABLE'))).toBe('info');
  });

  it('NÃO rebaixa erro real → retorna null (caller usa "error")', () => {
    expect(transientSeverity(new Error('relation "x" does not exist'))).toBeNull();
    expect(transientSeverity(new Error('Request failed with status 500'))).toBeNull();
  });

  it('só conta "network request failed" quando é TypeError (paridade com push-setup)', () => {
    // Um Error genérico com a mesma frase NÃO é a falha de transporte do fetch.
    expect(transientSeverity(new Error('Network request failed'))).toBeNull();
  });

  it('lida com valores não-Error sem quebrar', () => {
    expect(transientSeverity('TOO_MANY_REGISTRATIONS')).toBe('info');
    expect(transientSeverity(null)).toBeNull();
    expect(transientSeverity(undefined)).toBeNull();
    expect(transientSeverity(42)).toBeNull();
  });
});
