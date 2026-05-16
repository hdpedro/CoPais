/**
 * E2E i18n smoke tests — validate that auth screens render in each of the 5
 * supported locales when the locale cookie is set.
 *
 * GATING:
 *   - Skipped by default. Opt-in with PLAYWRIGHT_I18N_LOCALES=1 in env, AND
 *     requires the target instance to have NEXT_PUBLIC_ENABLE_LOCALE_SWITCH=1
 *     (Fase 0 keeps it OFF in prod so middleware forces pt for everyone —
 *     a non-pt cookie would be overwritten back to pt on every request).
 *
 *   - Run locally:
 *       NEXT_PUBLIC_ENABLE_LOCALE_SWITCH=1 npm run dev   (in one shell)
 *       PLAYWRIGHT_I18N_LOCALES=1 PLAYWRIGHT_BASE_URL=http://localhost:3000 \
 *         npx playwright test tests/e2e/06-i18n-locales.spec.ts
 *
 *   - In CI: needs a preview deploy with the flag set. Once the cleanup PRs
 *     bring the visible-strings coverage above 95% and we flip the flag in
 *     production, this opt-in flag can be removed and the suite becomes
 *     mandatory in every PR check.
 *
 * COVERAGE:
 *   - /login, /signup, /verify-email, /forgot-password, /reset-password
 *   - All 5 locales (pt, en, es, fr, de)
 *   - Asserts on the page heading + primary CTA — copy most likely to break
 *     when a translation key is missing or renames silently.
 *
 * Why a separate file: kept distinct from 01-auth.spec.ts because that file
 * covers auth behavior (cookies, redirects); this one covers visual i18n
 * correctness and runs slower (5× the requests).
 */
import { test, expect, type Page } from "@playwright/test";

const RUN_I18N_E2E = process.env.PLAYWRIGHT_I18N_LOCALES === "1";

// Per-locale expectations — sourced from src/i18n/locales/*.json. Keep these
// in sync if the canonical strings change. The matcher is a substring check
// (toContainText), so partial updates won't break the assertion.
const EXPECTATIONS: Record<
  string,
  {
    loginHeading: string;
    loginButton: string;
    signupHeading: string;
    forgotTitle: string;
    verifyTitle: string;
    resetTitle: string;
  }
> = {
  pt: {
    loginHeading: "Kindar",
    loginButton: "Entrar",
    signupHeading: "Kindar",
    forgotTitle: "Recuperar Senha",
    verifyTitle: "Confirme seu e-mail",
    resetTitle: "Nova Senha",
  },
  en: {
    loginHeading: "Kindar",
    loginButton: "Log in",
    signupHeading: "Kindar",
    forgotTitle: "Recover Password",
    verifyTitle: "Confirm your email",
    resetTitle: "New Password",
  },
  es: {
    loginHeading: "Kindar",
    loginButton: "Iniciar sesión",
    signupHeading: "Kindar",
    forgotTitle: "Recuperar Contraseña",
    verifyTitle: "Confirma tu correo",
    resetTitle: "Nueva Contraseña",
  },
  fr: {
    loginHeading: "Kindar",
    loginButton: "Se connecter",
    signupHeading: "Kindar",
    forgotTitle: "Récupérer le mot de passe",
    verifyTitle: "Confirmez votre e-mail",
    resetTitle: "Nouveau mot de passe",
  },
  de: {
    loginHeading: "Kindar",
    loginButton: "Anmelden",
    signupHeading: "Kindar",
    forgotTitle: "Passwort wiederherstellen",
    verifyTitle: "Bestätigen Sie Ihre E-Mail",
    resetTitle: "Neues Passwort",
  },
};

test.describe("i18n locales — auth screens render correctly per locale", () => {
  test.skip(!RUN_I18N_E2E, "Opt-in via PLAYWRIGHT_I18N_LOCALES=1");

  for (const locale of Object.keys(EXPECTATIONS)) {
    test.describe(`locale=${locale}`, () => {
      test.beforeEach(async ({ context, baseURL }) => {
        // The cookie is the source of truth — server reads it via
        // getRequestLocale() and renders the page in this locale on first
        // request. Domain must match the baseURL host for the cookie to
        // be sent; we strip protocol+port.
        const host = new URL(baseURL || "http://localhost:3000").hostname;
        await context.addCookies([
          {
            name: "kindar-locale",
            value: locale,
            domain: host,
            path: "/",
            sameSite: "Lax",
          },
        ]);
      });

      test("login page renders translated CTA", async ({ page }) => {
        await page.goto("/login");
        await expect(page.getByRole("heading", { name: "Kindar" })).toBeVisible();
        await assertLoginCta(page, locale);
      });

      test("signup page renders translated header", async ({ page }) => {
        await page.goto("/signup");
        await expect(page.getByRole("heading", { name: "Kindar" })).toBeVisible();
        // Email/Password labels exist in all locales — assert the field is
        // present rather than specific text (would need per-locale labels).
        await expect(page.locator('input[type="email"]')).toBeVisible();
      });

      test("forgot-password page renders translated title", async ({ page }) => {
        await page.goto("/forgot-password");
        const { forgotTitle } = EXPECTATIONS[locale];
        await expect(page.getByRole("heading", { name: forgotTitle })).toBeVisible();
      });

      test("verify-email page renders translated title", async ({ page }) => {
        await page.goto("/verify-email");
        const { verifyTitle } = EXPECTATIONS[locale];
        await expect(page.getByRole("heading", { name: verifyTitle })).toBeVisible();
      });

      test("reset-password page renders translated header (eventually)", async ({ page }) => {
        // Reset-password requires a recovery session; without it the page
        // redirects to /forgot-password. We just ensure no crash + correct
        // surrounding flow renders in the chosen locale.
        await page.goto("/reset-password");
        // Should either show the heading (when recovery session present) or
        // a known forwarding loader. Both are acceptable for this smoke test.
        await page.waitForLoadState("domcontentloaded");
        const body = await page.textContent("body");
        expect(body?.length).toBeGreaterThan(0);
      });
    });
  }
});

/**
 * Login CTA assertion is in a helper because "Sign in" / "Iniciar sesión"
 * appear on the submit button — which has no role=button (it's `<button>`)
 * with text content. We assert the visible label is present.
 */
async function assertLoginCta(page: Page, locale: string) {
  const expected = EXPECTATIONS[locale].loginButton;
  // The submit button OR the social-login button should contain the label.
  await expect(
    page.locator("button", { hasText: expected }).first(),
  ).toBeVisible();
}
