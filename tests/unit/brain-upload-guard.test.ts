import { describe, it, expect } from "vitest";
import {
  detectImageType,
  validateImageUpload,
  MAX_IMAGE_BYTES,
} from "@/lib/ai/brain/upload-guard";

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);
const WEBP = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]);

describe("detectImageType — magic bytes (não confia no file.type)", () => {
  it("reconhece JPEG/PNG/WebP", () => {
    expect(detectImageType(JPEG)).toBe("image/jpeg");
    expect(detectImageType(PNG)).toBe("image/png");
    expect(detectImageType(WEBP)).toBe("image/webp");
  });
  it("rejeita conteúdo não-imagem (ex: PDF, HTML, texto)", () => {
    expect(detectImageType(new Uint8Array([0x25, 0x50, 0x44, 0x46]))).toBeNull(); // %PDF
    expect(detectImageType(new Uint8Array([0x3c, 0x68, 0x74, 0x6d]))).toBeNull(); // <htm
    expect(detectImageType(new Uint8Array([]))).toBeNull();
  });
  it("não se deixa enganar por buffer curto", () => {
    expect(detectImageType(new Uint8Array([0xff, 0xd8]))).toBeNull();
  });
});

describe("validateImageUpload — tamanho + tipo real", () => {
  it("aceita imagem válida dentro do limite", () => {
    expect(validateImageUpload(JPEG)).toEqual({ ok: true, type: "image/jpeg" });
  });
  it("rejeita vazio", () => {
    expect(validateImageUpload(new Uint8Array([]))).toMatchObject({ ok: false, reason: "empty" });
  });
  it("rejeita acima de 8MB", () => {
    const big = new Uint8Array(MAX_IMAGE_BYTES + 1);
    big[0] = 0xff; big[1] = 0xd8; big[2] = 0xff;
    expect(validateImageUpload(big)).toMatchObject({ ok: false, reason: "too_large" });
  });
  it("rejeita tipo não suportado mesmo dentro do tamanho", () => {
    expect(validateImageUpload(new Uint8Array([0x25, 0x50, 0x44, 0x46]))).toMatchObject({
      ok: false,
      reason: "unsupported_type",
    });
  });
});
