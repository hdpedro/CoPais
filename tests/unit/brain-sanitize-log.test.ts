import { describe, it, expect } from "vitest";
import { sanitizeRawTextForLog, sanitizeForLogPreview } from "@/lib/ai/brain/sanitize-log";

describe("sanitizeRawTextForLog — redige PII antes de logar/persistir", () => {
  it("redige e-mail", () => {
    const out = sanitizeRawTextForLog("contato: maria.silva@escola.com.br ok");
    expect(out).not.toContain("maria.silva@escola.com.br");
    expect(out).toContain("[email]");
  });

  it("redige CPF (com e sem pontuação)", () => {
    expect(sanitizeRawTextForLog("CPF 123.456.789-09")).toContain("[cpf]");
    expect(sanitizeRawTextForLog("12345678909")).not.toContain("12345678909");
  });

  it("redige CNPJ", () => {
    expect(sanitizeRawTextForLog("CNPJ 20.306.044/0001-51")).toContain("[cnpj]");
  });

  it("redige telefone BR", () => {
    const out = sanitizeRawTextForLog("ligar (11) 98765-4321 amanhã");
    expect(out).not.toContain("98765-4321");
    expect(out).toContain("[telefone]");
  });

  it("redige CEP", () => {
    expect(sanitizeRawTextForLog("CEP 01310-100")).toContain("[cep]");
  });

  it("redige sequências longas de dígitos remanescentes", () => {
    expect(sanitizeRawTextForLog("cartão 4111111111111111")).not.toContain("4111111111111111");
  });

  it("preserva texto sem PII (datas curtas de prova, matérias)", () => {
    const text = "Prova de Matemática dia 12/08 capítulos 3 e 4";
    const out = sanitizeRawTextForLog(text);
    expect(out).toContain("Prova de Matemática");
    expect(out).toContain("capítulos 3 e 4");
  });

  it("entrada vazia/nula → string vazia", () => {
    expect(sanitizeRawTextForLog("")).toBe("");
    expect(sanitizeRawTextForLog(null)).toBe("");
    expect(sanitizeRawTextForLog(undefined)).toBe("");
  });
});

describe("sanitizeForLogPreview — trunca + sanitiza", () => {
  it("trunca além do limite e sanitiza", () => {
    const long = "a".repeat(400) + " email@x.com";
    const out = sanitizeForLogPreview(long, 100);
    expect(out.length).toBeLessThanOrEqual(101); // 100 + reticências
    expect(out.endsWith("…")).toBe(true);
  });

  it("não trunca texto curto", () => {
    expect(sanitizeForLogPreview("curto")).toBe("curto");
  });
});
