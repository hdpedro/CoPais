import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
    environment: "jsdom",
    setupFiles: ["./tests/vitest.setup.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov"],
      include: ["src/**/*.{ts,tsx}"],
      exclude: [
        "src/**/*.d.ts",
        "src/app/**/layout.tsx",
        "src/app/**/loading.tsx",
        "src/app/**/error.tsx",
        "src/i18n/locales/**",
      ],
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      // "server-only" lança fora de RSC; nos testes vira um módulo vazio para
      // que módulos server-side (brain-handlers, activity-reminders, …) e as
      // suítes que os importam transitivamente (characterization do processor)
      // carreguem sem throw.
      "server-only": path.resolve(__dirname, "./tests/stubs/server-only.ts"),
    },
  },
  // Os testes de paridade native importam kindar-native/app/_src/lib/*.ts. Sem
  // isto o transform (oxc) resolve o tsconfig de cada arquivo e sobe até
  // kindar-native/tsconfig.json, que faz `extends "expo/tsconfig.base"`. O job
  // de teste da raiz no CI não instala as deps do native, então esse extends
  // não resolve → "Tsconfig not found". Um tsconfig inline em `oxc.tsconfig`
  // desliga o lookup por arquivo; o transform só precisa stripar tipos.
  oxc: {
    // @ts-expect-error rolldown-vite aceita `tsconfig` em runtime, mas o tipo
    // OxcOptions desta versão ainda não declara essa propriedade.
    tsconfig: {
      compilerOptions: { jsx: "react-jsx", jsxImportSource: "react" },
    },
  },
});
