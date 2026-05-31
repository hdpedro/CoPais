import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import kindarPlugin from "./eslint-rules/index.mjs";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Kindar-local plugin — Regras Canônicas enforced as ESLint rules.
  // `kindar/no-pt-literal` flags Portuguese literals in JSX text and i18n-
  // sensitive attributes (Regra Canônica 2). Promoted to `error` on
  // 2026-05-16 after the cleanup PR brought the count to 0 hits in the
  // unscoped (non-allowlisted) codebase. Allowlisted modules are tracked
  // in PLANO_I18N_EXECUCAO.md §3.1 for incremental refactor.
  {
    plugins: { kindar: kindarPlugin },
    rules: {
      "kindar/no-pt-literal": "error",
      // Trava regressão do bug de 2026-05-27: rotas API que usam createClient
      // SSR (cookies-only) + auth.getUser() retornam 401 silencioso pra TODO
      // caller native (Bearer). Force resolveAuthenticatedUser ou opt-out
      // explícito. Vide eslint-rules/api-route-auth-helper.mjs.
      "kindar/api-route-auth-helper": "error",
    },
  },
  // Legal / marketing / admin-only pages are deliberately pt-only:
  //   - /termos, /privacidade, /suporte, /pricing  → Regra Canônica 14
  //     (jurídico/marketing must approve translation before localization)
  //   - /admin/**                                  → internal-only UI, no end-
  //     user reach; localizing would only add maintenance burden.
  //   - src/app/page.tsx (root landing) + components/landing/**
  //                                                → marketing landing, copy
  //     iterations are pt-BR-first; ASO/SEO localization is Tier 2.
  // Disable the rule there to keep CI clean without per-line ignore comments.
  {
    files: [
      "src/app/termos/**/*.{ts,tsx}",
      "src/app/privacidade/**/*.{ts,tsx}",
      "src/app/suporte/**/*.{ts,tsx}",
      "src/app/pricing/**/*.{ts,tsx}",
      "src/app/admin/**/*.{ts,tsx}",
      "src/app/page.tsx",
      "src/app/prototipo/**/*.{ts,tsx}",
      "src/components/landing/**/*.{ts,tsx}",
    ],
    rules: {
      "kindar/no-pt-literal": "off",
    },
  },
  // Financial copy (Regra Canônica 14 — requires legal + marketing review
  // before localization). Despesas flow shows BRL amounts, refund policies,
  // approval/rejection language, and audit trail. Once finance/legal approve
  // multi-region translation (Tier 2), remove these and migrate via
  // add-keys.mjs --target=both.
  {
    files: [
      "src/app/(app)/despesas/**/*.{ts,tsx}",
      "kindar-native/app/despesas/**/*.{ts,tsx}",
      "kindar-native/app/financeiro/**/*.{ts,tsx}",
      "kindar-native/app/assinatura.tsx",
    ],
    rules: {
      "kindar/no-pt-literal": "off",
    },
  },
  // Native frontend remaining files — scheduled for a dedicated PR after
  // this i18n foundation merges. The infrastructure is in place (parity,
  // char-limits, types, locale-utils, getServerT). Each native screen
  // follows the exact same pattern as the PWA ones already refactored in
  // this PR (auth/login, dashboard, saude/emergencia, etc.). Tracking
  // doc: docs/03-architecture/PLANO_I18N_EXECUCAO.md "§3.3 Native frontend".
  //
  // Allowlisting here (NOT in the source files with i18n-ignore-block) so
  // the next PR can simply remove this block once all files are refactored
  // — a single source of truth for the debt.
  {
    files: [
      "kindar-native/app/**/*.{ts,tsx}",
    ],
    rules: {
      "kindar/no-pt-literal": "off",
    },
  },
  // PWA remaining modules — scheduled for incremental PRs. The infrastructure
  // is in place; each module follows the pattern already applied to:
  //   - dashboard, perfil, saude (server pages)
  //   - login/signup/verify/forgot/reset (auth)
  //   - escola, emergencia, vaccine-detail, prescription, delete-account,
  //     referral, ferias (client components)
  //
  // To remove from the allowlist: refactor the module's strings into
  // src/i18n/locales/*.json via `node scripts/i18n/add-keys.mjs --target=both`,
  // then delete the corresponding entry below. CI's `kindar/no-pt-literal`
  // immediately starts surfacing remaining hits, guiding the cleanup.
  //
  // Each module here is tracked in PLANO_I18N_EXECUCAO.md §3.1 with hit count.
  {
    files: [
      "src/app/(app)/atividades/**/*.{ts,tsx}",
      "src/app/(app)/eventos/**/*.{ts,tsx}",
      "src/app/(app)/calendario/**/*.{ts,tsx}",
      "src/app/(app)/familia/**/*.{ts,tsx}",
      "src/app/(app)/semana/**/*.{ts,tsx}",
      "src/app/(app)/financeiro/**/*.{ts,tsx}",
      "src/app/(app)/saude/crescimento/**/*.{ts,tsx}",
      "src/app/(app)/saude/vacinas/carteirinha/**/*.{ts,tsx}",
      "src/app/(app)/saude/vacinas/VacinasClient.tsx",
      "src/app/(app)/saude/vacinas/nova/**/*.{ts,tsx}",
      "src/app/(app)/saude/consultas/nova/**/*.{ts,tsx}",
      "src/app/(app)/saude/medicamentos/**/*.{ts,tsx}",
      "src/app/(app)/saude/emergencia/page.tsx",
      "src/app/(app)/onboarding/**/*.{ts,tsx}",
      "src/app/(app)/convite/**/*.{ts,tsx}",
      "src/app/(app)/dashboard/DashboardClient.tsx",
      "src/components/billing/**/*.{ts,tsx}",
      "src/components/saude/**/*.{ts,tsx}",
      "src/components/PWAInstallBanner.tsx",
      "src/components/PushNotificationManager.tsx",
      "src/components/PremiumGate.tsx",
      "src/components/OnboardingChecklist.tsx",
      "src/components/LanguageSelector.tsx",
      "src/app/(auth)/error.tsx",
      "src/app/(auth)/session-recovery/page.tsx",
      "src/app/error.tsx",
      "src/app/global-error.tsx",
      "src/app/native-bridge/page.tsx",
      "src/app/not-found.tsx",
    ],
    rules: {
      "kindar/no-pt-literal": "off",
    },
  },
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
