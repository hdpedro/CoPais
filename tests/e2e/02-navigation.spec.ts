import { test, expect } from "@playwright/test";
import { loginAs } from "../utils/auth";

test.describe("Navigation", () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, "primary");
  });

  const routes = [
    { path: "/dashboard", text: /Boa|Good|Buen/ },
    { path: "/calendario", text: /2026/ },
    { path: "/chat", text: /Chat|Geral/ },
    { path: "/despesas", text: /Despesa|Expense/ },
    { path: "/decisoes", text: /Decis|Decision/ },
    { path: "/saude", text: /Saúde|Saude|Health/ },
    { path: "/notas", text: /Nota|Note/ },
    { path: "/familia", text: /Famil|Family/ },
    { path: "/criancas", text: /Crian|Child/ },
    { path: "/documentos", text: /Document/ },
    { path: "/perfil", text: /Grupo|Group|Idioma|Language/ },
  ];

  for (const route of routes) {
    test(`loads ${route.path}`, async ({ page }) => {
      await page.goto(route.path);
      await page.waitForLoadState("networkidle");
      await expect(page.locator("body")).toContainText(route.text, { timeout: 10000 });
    });
  }

  test("rapid navigation between screens", async ({ page }) => {
    const paths = ["/dashboard", "/calendario", "/chat", "/despesas", "/dashboard"];
    for (const p of paths) {
      await page.goto(p);
      await page.waitForLoadState("domcontentloaded");
    }
    // Should end on dashboard without crash
    await expect(page).toHaveURL(/dashboard/);
  });
});
