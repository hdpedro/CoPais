import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // kindar-native app/_src/* contains code moved from kindar-native/src/
    // (commit XXXX) pra contornar bug do EAS upload que perdia src/. Os
    // arquivos sao os mesmos que ja estavam em src/ — pre-existing warnings
    // nao sao do refactor. Mantemos ignorado pra nao bloquear husky.
    "kindar-native/app/_src/**",
    // Generated/vendored artifacts — never edit, never lint:
    // - Playwright HTML report bundles (UI mode webapp + trace assets)
    // - Expo web export bundle
    // - Test runtime caches & coverage outputs
    "kindar-native/tests/reports/**",
    "kindar-native/dist/**",
    "kindar-native/playwright-report/**",
    "kindar-native/test-results/**",
    "playwright-report/**",
    "test-results/**",
    "coverage/**",
  ]),
  // Relax rules for test files — mocks require `any` and unused vars
  // Covers both root /tests (PWA) and kindar-native/tests (native+e2e).
  {
    files: [
      "tests/**/*.{ts,tsx}",
      "kindar-native/tests/**/*.{ts,tsx}",
    ],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": "warn",
    },
  },
  // CommonJS standalone scripts (docx/report/comparison generators):
  // they run via `node generate-*.js` and have no TS pipeline, so
  // `require()` is the correct module form. Disable the ES-only rule.
  {
    files: ["generate-*.js", "scripts/generate-*.js"],
    rules: {
      "@typescript-eslint/no-require-imports": "off",
    },
  },
  // Domain-prop "children": several Server Component pages (notas, familia,
  // saude/*, calendario/escala, etc.) pass `children: Child[]` (i.e. crianças
  // do grupo de coparentalidade) to their Client components. The shape and
  // semantics are documented in the Client's props interface, but it
  // collides with React's reserved `children` prop. Renaming sitewide would
  // touch 20+ files with no functional benefit — disable the rule for these
  // page wrappers only.
  {
    files: [
      "src/app/(app)/notas/page.tsx",
      "src/app/(app)/familia/page.tsx",
      "src/app/(app)/despesas/nova/page.tsx",
      "src/app/(app)/calendario/escala/page.tsx",
      "src/app/(app)/saude/alergias/nova/page.tsx",
      "src/app/(app)/saude/consultas/nova/page.tsx",
      "src/app/(app)/saude/crescimento/novo/page.tsx",
      "src/app/(app)/saude/medicamentos/novo/page.tsx",
      "src/app/(app)/saude/vacinas/nova/page.tsx",
    ],
    rules: {
      "react/no-children-prop": "off",
    },
  },
]);

export default eslintConfig;
