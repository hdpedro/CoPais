/**
 * Bug Fernanda 2026-05-14: filha "Julio Cesar" aparecia só como "Julio" no
 * dashboard Native porque `getDisplayName` SEMPRE quebrava no primeiro espaço.
 *
 * Nomes compostos PT-BR (Julio Cesar, Maria Eduarda, Ana Clara, Luiz Felipe)
 * são o NOME PRÓPRIO inteiro — não devem ser truncados. O helper agora espelha
 * o do PWA (`src/lib/constants.ts:getDisplayName`): default retorna nome
 * completo; `firstOnly=true` ainda funciona pra contextos compactos (greeting,
 * lista de membros, expense paid-by, etc.).
 *
 * Estes testes garantem que a regressão não vai voltar.
 */
import { describe, it, expect } from 'vitest';
import { getDisplayName } from '../../kindar-native/app/_src/lib/constants';

describe('getDisplayName (Native)', () => {
  describe('default behavior (firstOnly=false): retorna nome completo', () => {
    it('mantém nome composto PT-BR completo (bug Fernanda)', () => {
      expect(getDisplayName('Julio Cesar')).toBe('Julio Cesar');
      expect(getDisplayName('Maria Eduarda')).toBe('Maria Eduarda');
      expect(getDisplayName('Ana Clara')).toBe('Ana Clara');
      expect(getDisplayName('Luiz Felipe')).toBe('Luiz Felipe');
    });

    it('retorna nome de uma palavra inalterado', () => {
      expect(getDisplayName('Fernanda')).toBe('Fernanda');
      expect(getDisplayName('Julio')).toBe('Julio');
    });

    it('retorna nome completo com sobrenomes', () => {
      expect(getDisplayName('Angelino Silva Barata')).toBe('Angelino Silva Barata');
    });

    it('trima espaços nas pontas', () => {
      expect(getDisplayName('  Julio Cesar  ')).toBe('Julio Cesar');
    });
  });

  describe('firstOnly=true: retorna só primeira palavra', () => {
    it('extrai primeira palavra', () => {
      expect(getDisplayName('Julio Cesar', true)).toBe('Julio');
      expect(getDisplayName('Angelino Silva Barata', true)).toBe('Angelino');
      expect(getDisplayName('Fernanda', true)).toBe('Fernanda');
    });
  });

  describe('entrada vazia: retorna string vazia', () => {
    it('null → ""', () => {
      expect(getDisplayName(null)).toBe('');
      expect(getDisplayName(null, true)).toBe('');
    });

    it('undefined → ""', () => {
      expect(getDisplayName(undefined)).toBe('');
      expect(getDisplayName(undefined, true)).toBe('');
    });

    it('string vazia/whitespace → ""', () => {
      expect(getDisplayName('')).toBe('');
      expect(getDisplayName('   ')).toBe('');
    });

    it('preserva o padrão `getDisplayName(x) || "Fallback"` dos callers', () => {
      // Vários callers Native fazem: `getDisplayName(x) || 'Co-responsavel'`
      // — depende de retornar string vazia (falsy) pra cair no fallback.
      expect(getDisplayName(null) || 'Co-responsavel').toBe('Co-responsavel');
      expect(getDisplayName('') || 'Co-responsavel').toBe('Co-responsavel');
      expect(getDisplayName(null, true) || 'Co-responsavel').toBe('Co-responsavel');
    });
  });

  describe('defensivo pra email acidental', () => {
    it('email → nome amigável com Title Case', () => {
      expect(getDisplayName('henrique.de.pedro@gmail.com')).toBe('Henrique De Pedro');
      expect(getDisplayName('maria_silva@example.com')).toBe('Maria Silva');
      expect(getDisplayName('joao-paulo@example.com')).toBe('Joao Paulo');
    });

    it('email + firstOnly → primeira palavra do prefixo', () => {
      expect(getDisplayName('henrique.de.pedro@gmail.com', true)).toBe('Henrique');
    });
  });
});
