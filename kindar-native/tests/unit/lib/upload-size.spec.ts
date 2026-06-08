/**
 * upload-size — guarda de tamanho de upload (native).
 *
 * Regressão do bug Murilo (2026-06-08): foto grande no "Novo documento" crashava
 * o app no Enviar. Causa: ImagePicker reporta fileSize=0 no Android → `0 > 10MB`
 * é false → arquivo gigante chegava no fetch().arrayBuffer() → OOM nativo.
 * Fix: usar o MAX(reportado, on-disk) — tamanho desconhecido (0) não fura mais.
 */
import { describe, expect, test } from 'vitest';
import { uploadSizeError, resolveFileSize, MAX_FILE_SIZE } from '../../../app/_src/lib/upload-size';

const MB = 1024 * 1024;

describe('uploadSizeError', () => {
  test('dentro do limite → null (reportado conhecido)', () => {
    expect(uploadSizeError(5 * MB, null)).toBeNull();
  });

  test('acima do limite pelo tamanho reportado → erro amigável', () => {
    const err = uploadSizeError(12 * MB, null);
    expect(err).toContain('muito grande');
    expect(err).toContain('12.0 MB');
    expect(err).toContain('10MB');
  });

  test('BUG MURILO: reportado=0 (Android) mas on-disk grande → erro (não fura)', () => {
    // antes: 0 > 10MB === false → passava → arrayBuffer → OOM/crash.
    expect(uploadSizeError(0, 30 * MB)).toContain('muito grande');
  });

  test('reportado=0 mas on-disk dentro do limite → null', () => {
    expect(uploadSizeError(0, 5 * MB)).toBeNull();
  });

  test('ambos desconhecidos (0, null) → null (não dá pra barrar; arrayBuffer cobre arquivos pequenos)', () => {
    expect(uploadSizeError(0, null)).toBeNull();
  });

  test('exatamente no limite → null; 1 byte acima → erro (fronteira)', () => {
    expect(uploadSizeError(MAX_FILE_SIZE, null)).toBeNull();
    expect(uploadSizeError(MAX_FILE_SIZE + 1, null)).toContain('muito grande');
  });

  test('usa o MAIOR entre reportado e on-disk', () => {
    // reportado pequeno, on-disk acima → barra
    expect(uploadSizeError(1 * MB, 20 * MB)).toContain('muito grande');
    // reportado acima, on-disk pequeno → barra
    expect(uploadSizeError(20 * MB, 1 * MB)).toContain('muito grande');
  });

  test('maxBytes customizado', () => {
    expect(uploadSizeError(2 * MB, null, 1 * MB)).toContain('1MB');
    expect(uploadSizeError(500 * 1024, null, 1 * MB)).toBeNull();
  });
});

describe('resolveFileSize', () => {
  test('pega o maior entre reportado e on-disk', () => {
    expect(resolveFileSize(0, 30 * MB)).toBe(30 * MB);
    expect(resolveFileSize(5 * MB, null)).toBe(5 * MB);
    expect(resolveFileSize(8 * MB, 2 * MB)).toBe(8 * MB);
  });

  test('ambos desconhecidos → 0 (= desconhecido)', () => {
    expect(resolveFileSize(0, null)).toBe(0);
  });
});
