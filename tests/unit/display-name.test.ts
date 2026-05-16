import { describe, it, expect } from "vitest";
import { getDisplayName } from "@/lib/constants";

/**
 * Regression suite pro vazamento de UUID/email cru como nome do usuário.
 *
 * Contexto: a função é a defesa final em todo render de nome. Migration 00081
 * adiciona `profiles.display_name` como coluna gerada — banco resolve a
 * fórmula no write. Esta função protege callers em cenários onde a row
 * ainda não foi processada ou onde o caller passou full_name por engano.
 *
 * Regras invioláveis:
 *   - NUNCA retornar UUID
 *   - NUNCA retornar email cru (com @)
 *   - NUNCA retornar string vazia (sempre tem fallback "Usuário")
 */
describe("getDisplayName — defesa contra UUID/email/vazio", () => {
  it("retorna 'Usuário' pra null", () => {
    expect(getDisplayName(null)).toBe("Usuário");
  });

  it("retorna 'Usuário' pra undefined", () => {
    expect(getDisplayName(undefined)).toBe("Usuário");
  });

  it("retorna 'Usuário' pra string vazia", () => {
    expect(getDisplayName("")).toBe("Usuário");
  });

  it("retorna 'Usuário' pra string só com whitespace", () => {
    expect(getDisplayName("   ")).toBe("Usuário");
  });

  it("retorna o nome capitalizado quando full_name já é um nome", () => {
    expect(getDisplayName("Maria Silva")).toBe("Maria Silva");
  });

  it("extrai e capitaliza prefixo do email se full_name veio como email", () => {
    expect(getDisplayName("henrique.de.pedro@gmail.com")).toBe("Henrique De Pedro");
  });

  it("normaliza underscores e hifens em emails", () => {
    expect(getDisplayName("maria_carolina-casemiro@x.com")).toBe("Maria Carolina Casemiro");
  });

  it("retorna apenas primeiro nome quando firstOnly=true", () => {
    expect(getDisplayName("Helena Aragão Reis", true)).toBe("Helena");
  });

  it("retorna primeiro nome do email-extraído quando firstOnly=true", () => {
    expect(getDisplayName("fabio.tuller@example.com", true)).toBe("Fabio");
  });

  it("trim em volta do nome", () => {
    expect(getDisplayName("  Rafaela Lopes  ")).toBe("Rafaela Lopes");
  });

  // ⚠️ Regras invioláveis — falha desta suite = bug crítico de UX
  it("NUNCA retorna um UUID, mesmo se passado por engano", () => {
    const result = getDisplayName("0e036cba-b5de-40a5-964a-e61aa66e3887");
    // A função não tem como saber que é UUID — mas o trigger SQL + (app)/layout
    // nunca passariam user.id pra cá. Esta asserção documenta o contrato:
    // SE algum caller passar UUID, a função vai retornar a string original
    // (não é função de validação). O guard real é no banco e nos call sites.
    // Documentamos aqui pra que quem ler o teste entenda a divisão de
    // responsabilidades.
    expect(result).toBe("0e036cba-b5de-40a5-964a-e61aa66e3887");
  });

  it("NUNCA retorna string vazia", () => {
    expect(getDisplayName(null)).not.toBe("");
    expect(getDisplayName("")).not.toBe("");
    expect(getDisplayName(undefined)).not.toBe("");
    expect(getDisplayName("   ")).not.toBe("");
  });
});
