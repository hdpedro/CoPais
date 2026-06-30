/* ------------------------------------------------------------------ */
/* upload-guard.ts — validação de upload por MAGIC BYTES (PURO)         */
/*                                                                      */
/* O tipo real do arquivo é detectado pelos bytes iniciais, NÃO pelo    */
/* file.type do cliente (que é forjável). Dependency-free (a lib        */
/* file-type não está no projeto). Limites concretos do plano: imagem   */
/* ≤8MB; só JPEG/PNG/WebP no A0 (≤1 página, PDF multipágina adiado).    */
/* ------------------------------------------------------------------ */

/** Limite de tamanho de imagem (plano: ≤8MB). */
export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

export type DetectedImageType = "image/jpeg" | "image/png" | "image/webp" | null;

/** Detecta o tipo real pela assinatura (magic bytes). null = desconhecido. */
export function detectImageType(buf: Uint8Array): DetectedImageType {
  // JPEG: FF D8 FF
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return "image/jpeg";
  }
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buf.length >= 8 &&
    buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47 &&
    buf[4] === 0x0d && buf[5] === 0x0a && buf[6] === 0x1a && buf[7] === 0x0a
  ) {
    return "image/png";
  }
  // WebP: "RIFF"(0-3) .... "WEBP"(8-11)
  if (
    buf.length >= 12 &&
    buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 &&
    buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50
  ) {
    return "image/webp";
  }
  return null;
}

export type UploadRejectReason = "empty" | "too_large" | "unsupported_type";

export interface UploadValidation {
  ok: boolean;
  type: DetectedImageType;
  reason?: UploadRejectReason;
}

/**
 * Valida tamanho + tipo real do buffer de imagem. Ordem: vazio → grande
 * demais → tipo não suportado. Não toca rede/disco.
 */
export function validateImageUpload(buf: Uint8Array): UploadValidation {
  if (buf.length === 0) return { ok: false, type: null, reason: "empty" };
  if (buf.length > MAX_IMAGE_BYTES) return { ok: false, type: null, reason: "too_large" };
  const type = detectImageType(buf);
  if (type === null) return { ok: false, type: null, reason: "unsupported_type" };
  return { ok: true, type };
}
