/**
 * Regression tests for `normalizePhone` and `hashPhone`.
 *
 * Bug background: na vinculacao do PWA + Native, usuarios digitavam o
 * numero brasileiro sem o codigo do pais (ex: "(21) 99785-9793" ou
 * "21972859793") e o `normalizePhone` original apenas adicionava '+'
 * sem detectar a falta do '55', salvando "+21972859793" no DB. Quando
 * a Meta entregava webhook com "5521972859793", o hash nao batia e o
 * bot tratava o numero como nao-vinculado.
 *
 * Esta suite trava o contrato: qualquer formato de input BR deve
 * normalizar para o canonico "+55DDNNNNNNNNN" e produzir o mesmo hash
 * que a Meta envia.
 */

import { describe, it, expect } from "vitest";
import { normalizePhone, hashPhone } from "@/lib/whatsapp/signature";

describe("normalizePhone (E.164 + BR-aware)", () => {
  describe("inputs com '+' explicito (internacional)", () => {
    it("mantem +55 BR canonico inalterado", () => {
      expect(normalizePhone("+5521997859793")).toBe("+5521997859793");
      expect(normalizePhone("+5511999998888")).toBe("+5511999998888");
    });

    it("respeita codigo de pais nao-BR sem reinterpretar", () => {
      // EUA: 11 digitos com '+1', NAO virar BR.
      expect(normalizePhone("+15551234567")).toBe("+15551234567");
      // UK: 12 digitos.
      expect(normalizePhone("+447911123456")).toBe("+447911123456");
    });

    it("strip mascaras e espacos quando '+' presente", () => {
      expect(normalizePhone("+55 (21) 99785-9793")).toBe("+5521997859793");
      expect(normalizePhone("+1 555 123 4567")).toBe("+15551234567");
    });
  });

  describe("inputs sem '+' (Meta webhook ou usuario digitando)", () => {
    it("Meta envia codigo de pais sem '+' — adiciona apenas '+'", () => {
      // Meta Cloud API envia E.164 sem '+'. Para BR (caso real do
      // Kindar): "5521997859793" -> "+5521997859793".
      expect(normalizePhone("5521997859793")).toBe("+5521997859793");
      // Para numeros muito longos (12+ digitos), respeita o que veio.
      expect(normalizePhone("442071234567")).toBe("+442071234567");
    });

    it("trade-off BR-aware: 11 digitos sem '+' SEMPRE viram BR", () => {
      // CASO RARO: se a WABA do Kindar atender outro pais cujo numero
      // sem codigo do pais tenha exatamente 11 digitos (ex: "15551234567"
      // de US), seria interpretado como BR. Como o Kindar e BR-only por
      // ora, isso e aceitavel — quando expandirmos, esta funcao vira
      // locale-aware.
      expect(normalizePhone("15551234567")).toBe("+5515551234567");
    });

    it("BR mobile sem codigo do pais — prepende +55", () => {
      // Cenario do bug: user digita "(21) 99785-9793" no formulario.
      expect(normalizePhone("21997859793")).toBe("+5521997859793");
      expect(normalizePhone("(21) 99785-9793")).toBe("+5521997859793");
      expect(normalizePhone("21 99785 9793")).toBe("+5521997859793");
      expect(normalizePhone("21 9 9785-9793")).toBe("+5521997859793");
    });

    it("BR fixo (10 digitos) sem codigo do pais — prepende +55", () => {
      expect(normalizePhone("2133334444")).toBe("+552133334444");
      expect(normalizePhone("(21) 3333-4444")).toBe("+552133334444");
    });
  });

  describe("edge cases", () => {
    it("entrada vazia ou so-mascara — retorna string vazia", () => {
      expect(normalizePhone("")).toBe("");
      expect(normalizePhone("   ")).toBe("");
      expect(normalizePhone("()-")).toBe("");
    });

    it("numero com leading zero (DDD com 0) e tratado como BR", () => {
      // "021997859793" -> 12 digitos, NAO 10/11, retorna "+021997859793"
      // (caso raro, formatos antigos com 0 no DDD)
      expect(normalizePhone("021997859793")).toBe("+021997859793");
    });

    it("normaliza idempotente: aplicar 2x produz mesmo resultado", () => {
      const inputs = [
        "+5521997859793",
        "21997859793",
        "(21) 99785-9793",
        "5521997859793",
        "+1 555 123 4567",
      ];
      for (const input of inputs) {
        const once = normalizePhone(input);
        const twice = normalizePhone(once);
        expect(twice).toBe(once);
      }
    });
  });
});

describe("hashPhone — consistencia entre vinculacao e webhook", () => {
  it("hash do que o user digita == hash do que Meta envia", () => {
    // O user digita "(21) 99785-9793" no formulario.
    const userTyped = hashPhone("(21) 99785-9793");
    // Meta entrega o mesmo numero como "5521997859793" no webhook.
    const metaSent = hashPhone("5521997859793");
    expect(userTyped).toBe(metaSent);
  });

  it("hash de '+55...' == hash de '55...' (com vs sem +)", () => {
    expect(hashPhone("+5521997859793")).toBe(hashPhone("5521997859793"));
  });

  it("hash diferente para numeros diferentes (sanity)", () => {
    expect(hashPhone("+5521997859793")).not.toBe(hashPhone("+5521997859794"));
  });

  it("hash hex de 64 chars (SHA-256)", () => {
    const h = hashPhone("+5521997859793");
    expect(h).toMatch(/^[0-9a-f]{64}$/);
  });
});
