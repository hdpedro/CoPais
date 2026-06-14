/**
 * maskCRM — máscara de input do CRM/CRO (número + UF).
 * Bug device dono 14/jun: o campo aceitava texto-lixo ("lehdhauahddn"). A
 * máscara reordena dígitos→número (até 7) e letras→UF (2, maiúsculas).
 */
import { describe, it, expect } from 'vitest';
import { maskCRM } from '../../../app/_src/lib/format';

describe('maskCRM', () => {
  it('número + UF colados → formata com barra', () => {
    expect(maskCRM('123456SP')).toBe('123456/SP');
  });
  it('já formatado se mantém', () => {
    expect(maskCRM('123456/SP')).toBe('123456/SP');
  });
  it('UF antes do número → reordena', () => {
    expect(maskCRM('SP123456')).toBe('123456/SP');
  });
  it('texto-lixo (só letras) cai pra no máx 2 letras maiúsculas', () => {
    expect(maskCRM('lehdhauahddn')).toBe('LE');
  });
  it('só número se mantém sem barra solta', () => {
    expect(maskCRM('123456')).toBe('123456');
  });
  it('número capado em 7 dígitos', () => {
    expect(maskCRM('123456789')).toBe('1234567');
  });
  it('UF capada em 2 letras', () => {
    expect(maskCRM('12345SPX')).toBe('12345/SP');
  });
  it('separadores (barra/espaço) são ignorados', () => {
    expect(maskCRM('12345 / SP')).toBe('12345/SP');
  });
  it('vazio/nullish → vazio', () => {
    expect(maskCRM('')).toBe('');
    expect(maskCRM(null)).toBe('');
    expect(maskCRM(undefined)).toBe('');
  });
});
