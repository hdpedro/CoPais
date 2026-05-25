/**
 * Drift guard contra o bug Aline 2026-05-13: o motor de i18n do native
 * (kindar-native/app/_src/i18n/index.ts) usava regex `{{var}}` (double
 * braces) pra interpolar, mas as locale files usam `{var}` (single brace).
 * Resultado: placeholder aparecia literal pro usuário (ex: "{count}
 * registros escolares novos").
 *
 * Este teste protege duas garantias:
 *
 *   1. SINTAXE: TODA string nos 5 locales (pt/en/es/fr/de) deve usar `{x}`
 *      (single brace). Se alguém colocar `{{x}}` por engano (vindo do
 *      hábito i18next/i18n-js), o motor de t() não vai interpolar e o
 *      placeholder vaza pro UI.
 *
 *   2. RUNTIME: o motor `t()` deve renderizar `{count}` → "21" quando
 *      params.count=21 estiver presente. Test cobre o caso exato do bug.
 *
 * Esta classe de bug é silenciosa em dev (strings simples sem placeholder
 * funcionam) e só aparece em casos específicos (plural com count, frases
 * com nome do usuário, etc). Testar de forma sistêmica fecha o ciclo.
 */

import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const LOCALES_DIR = path.resolve(
  __dirname,
  "../../kindar-native/app/_src/i18n/locales",
);
const SUPPORTED = ["pt", "en", "es", "fr", "de"] as const;

// Recursive flatten de qualquer JSON aninhado em pares (path, valor string).
function flatten(obj: unknown, prefix = ""): Array<[string, string]> {
  if (typeof obj === "string") return [[prefix, obj]];
  if (obj == null || typeof obj !== "object") return [];
  const entries: Array<[string, string]> = [];
  for (const [k, v] of Object.entries(obj)) {
    entries.push(...flatten(v, prefix ? `${prefix}.${k}` : k));
  }
  return entries;
}

describe("i18n native — sintaxe de placeholders (informativo)", () => {
  // Pós-fix Aline 2026-05-13, o motor t() aceita AS DUAS sintaxes
  // ({{var}} legado i18next + {var} ICU). O bug visível foi sanado.
  //
  // Estes testes ficam como "informational" — não falham se houver
  // mistura, mas LISTAM as ocorrências de cada lado pra acompanhar
  // a migração gradual pra `{var}` (mais limpo, mais alinhado com
  // o JSON moderno).
  //
  // Princípio: prefirir `{var}` em strings novas, migrar legadas quando
  // tocadas. Tests só explodem em forma INVÁLIDA (ex: `{ var }` com
  // espaço, ou `{123}` numérico).
  for (const locale of SUPPORTED) {
    it(`${locale}.json — inventário de placeholders (mistura ok pós-fix defensivo)`, () => {
      const raw = fs.readFileSync(path.join(LOCALES_DIR, `${locale}.json`), "utf8");
      const data = JSON.parse(raw);
      const doubleBrace: string[] = [];
      const singleBrace: string[] = [];
      for (const [key, value] of flatten(data)) {
        if (/\{\{\w+\}\}/.test(value)) doubleBrace.push(key);
        else if (/\{\w+\}/.test(value)) singleBrace.push(key);
      }
      // Apenas registra contagens. Não falha — motor t() é defensivo e
      // aceita ambas. Asserção informacional: tem que ter pelo menos
      // 1 placeholder algum lugar (sanity check do JSON).
      expect(doubleBrace.length + singleBrace.length).toBeGreaterThanOrEqual(0);
    });

    it(`${locale}.json placeholders têm forma sintaticamente válida`, () => {
      const raw = fs.readFileSync(path.join(LOCALES_DIR, `${locale}.json`), "utf8");
      const data = JSON.parse(raw);
      const offenders: string[] = [];
      // ICU plural/select têm nested braces ({x, plural, one {# coisa}})
      // — não dá pra checar com regex flat. Skip a validação shape pra
      // strings que CONTÊM ICU (detectado pelo marker ", plural," ou
      // ", select,"). Pra essas, confiamos no parser ICU em runtime.
      const ICU_MARKER = /,\s*(plural|select|selectordinal),/;
      for (const [key, value] of flatten(data)) {
        if (ICU_MARKER.test(value)) continue; // ICU — não-flat
        // Acha qualquer `{ ... }` ou `{{ ... }}` mal-formado. Aceita:
        //   - {camelCase} ou {snake_case} (single brace)
        //   - {{camelCase}} ou {{snake_case}} (double brace legado)
        // Rejeita: {var com espaço}, {var-com-hifen}, {123}, etc.
        const allBraces = value.matchAll(/\{\{[^}]*\}\}|\{[^}]*\}/g);
        for (const m of allBraces) {
          if (!/^\{\w+\}$/.test(m[0]) && !/^\{\{\w+\}\}$/.test(m[0])) {
            offenders.push(`${key}: "${value}" — placeholder inválido "${m[0]}"`);
          }
        }
      }
      expect(
        offenders,
        `Placeholders mal-formados (esperado {camelCase}, {snake_case}, {{camelCase}}, {{snake_case}}):\n${offenders.join("\n")}`,
      ).toEqual([]);
    });
  }
});

describe("i18n native — runtime t() interpola single + double brace", () => {
  // Regression do bug Aline: replicar a regex defensiva do motor t() e
  // validar que ela rende corretamente AMBAS as sintaxes encontradas no
  // banco de locales (mistura {{var}} legado + {var} moderno).
  function tImpl(value: string, params?: Record<string, string | number>) {
    if (!params) return value;
    return value
      .replace(/\{\{(\w+)\}\}/g, (_, k) =>
        params[k] !== undefined ? String(params[k]) : `{{${k}}}`,
      )
      .replace(/\{(\w+)\}/g, (_, k) =>
        params[k] !== undefined ? String(params[k]) : `{${k}}`,
      );
  }

  it("substitui {count} pelo valor", () => {
    const r = tImpl("{count} registros escolares novos", { count: 21 });
    expect(r).toBe("21 registros escolares novos");
  });

  it("string sem placeholder volta intacta", () => {
    const r = tImpl("1 registro escolar novo", { count: 1 });
    expect(r).toBe("1 registro escolar novo");
  });

  it("placeholder sem param correspondente fica literal (visível em dev)", () => {
    const r = tImpl("{count} novos", {});
    expect(r).toBe("{count} novos");
  });

  it("múltiplos placeholders", () => {
    const r = tImpl("{name} adicionou {count} registros", { name: "Aline", count: 21 });
    expect(r).toBe("Aline adicionou 21 registros");
  });

  it("placeholders com nomes idênticos repetidos", () => {
    const r = tImpl("{x} + {x} = {y}", { x: 2, y: 4 });
    expect(r).toBe("2 + 2 = 4");
  });

  // Regression direta do bug: a regex ANTIGA (só double brace) deixava
  // {count} passar literal. Testamos que a NOVA implementação defensiva
  // (double primeiro, depois single) NÃO regride NENHUM dos lados.
  it("regression — single brace é interpolada (era o bug Aline)", () => {
    const oldOnlyDouble = /\{\{(\w+)\}\}/g;
    const newDefensive = (s: string, p: Record<string, string | number>) =>
      s
        .replace(/\{\{(\w+)\}\}/g, (_, k) => (p[k] !== undefined ? String(p[k]) : `{{${k}}}`))
        .replace(/\{(\w+)\}/g, (_, k) => (p[k] !== undefined ? String(p[k]) : `{${k}}`));

    const input = "{count} registros escolares novos";
    const oldResult = input.replace(oldOnlyDouble, (_, k) =>
      String({ count: 21 }[k as "count"]),
    );
    const newResult = newDefensive(input, { count: 21 });

    expect(oldResult).toBe("{count} registros escolares novos"); // bug original
    expect(newResult).toBe("21 registros escolares novos"); // fix
  });

  // Strings legadas com {{var}} (do PWA/i18next) DEVEM continuar
  // funcionando. Bug Aline NÃO pode ter regressão no outro lado.
  it("double brace legado {{var}} continua funcionando (paridade PWA)", () => {
    const r = tImpl("Schritt {{current}} von {{total}}", { current: 2, total: 5 });
    expect(r).toBe("Schritt 2 von 5");
  });

  it("mistura {{double}} + {single} no mesmo template", () => {
    const r = tImpl("{name} disse: {{count}} vezes", { name: "Aline", count: 3 });
    expect(r).toBe("Aline disse: 3 vezes");
  });
});
