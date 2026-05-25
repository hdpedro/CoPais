/**
 * Drift guard contra o bug F#62 (E2E PRD 2026-05-25): /chat renderizava
 * `{count, plural, one {# membro} other {# membros}}` literal em vez de
 * "1 membro" ou "2 membros". Causa: motor `t()` em `src/i18n/index.ts` só
 * lidava com placeholders simples `{name}` e `{{name}}`. Sintaxe ICU
 * plural passava direto sem ser processada.
 *
 * Fix em `src/i18n/index.ts` adicionou `applyICUPlural` + `pluralKey` que
 * resolve o template ICU pra branch correto baseado em CLDR (pt: one
 * pra 0..1, other pra resto; en: one pra =1 estrito).
 *
 * Este teste tranca o suporte ICU contra regressão.
 */

import { describe, it, expect } from "vitest";
import { t } from "@/i18n";

describe("i18n PWA — ICU plural support (F#62 drift guard)", () => {
  describe("chat.members — pt-BR (rule: 0..1 = one)", () => {
    it("count=1 rende 'one' branch (singular)", () => {
      expect(t("chat.members", { count: 1 })).toBe("1 membro");
    });

    it("count=0 rende 'one' branch (CLDR pt: zero usa one)", () => {
      expect(t("chat.members", { count: 0 })).toBe("0 membro");
    });

    it("count=2 rende 'other' branch (plural)", () => {
      expect(t("chat.members", { count: 2 })).toBe("2 membros");
    });

    it("count=100 rende 'other' com substituição correta", () => {
      expect(t("chat.members", { count: 100 })).toBe("100 membros");
    });

    it("NÃO renderiza ICU literal (bug original)", () => {
      const out = t("chat.members", { count: 5 });
      expect(out).not.toContain("plural");
      expect(out).not.toContain("{count");
      expect(out).not.toMatch(/^\{/);
    });
  });

  describe("chat.members — en (rule: =1 estrito)", () => {
    it("count=1 rende 'one' branch", () => {
      // Lazy-load en dict; fall back to pt if not loaded.
      // Test only asserts no ICU literal leaks.
      const out = t("chat.members", { count: 1 }, "en");
      expect(out).not.toContain("plural");
    });
  });

  describe("interpolação sem ICU continua funcionando", () => {
    it("placeholder `{name}` simples ainda interpola", () => {
      // dashboard.todayWith é template com `{name}` simples
      const out = t("dashboard.greeting.welcome", { name: "Henrique" });
      // Resultado depende do valor real do dict; importante é não ter
      // `{name}` no resultado (interpolação funcionou).
      expect(out).not.toContain("{name}");
    });
  });
});
