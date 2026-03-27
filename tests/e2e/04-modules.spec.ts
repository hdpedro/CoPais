import { test, expect } from "@playwright/test";
import { loginAs } from "../utils/auth";

test.describe("Core Modules", () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, "primary");
  });

  test("health module loads", async ({ page }) => {
    await page.goto("/saude");
    await page.waitForLoadState("networkidle");
    await expect(page.locator("body")).toContainText(/Saúde|Saude|Health/);
  });

  test("expenses module loads", async ({ page }) => {
    await page.goto("/despesas");
    await page.waitForLoadState("networkidle");
    await expect(page.locator("body")).toContainText(/Despesa|Expense/);
  });

  test("decisions module loads", async ({ page }) => {
    await page.goto("/decisoes");
    await page.waitForLoadState("networkidle");
    await expect(page.locator("body")).toContainText(/Decis|Decision/);
  });

  test("chat module loads", async ({ page }) => {
    await page.goto("/chat");
    await page.waitForLoadState("networkidle");
    await expect(page.locator("body")).toContainText(/Chat|Geral|mensagem|message/i);
  });

  test("notes module loads", async ({ page }) => {
    await page.goto("/notas");
    await page.waitForLoadState("networkidle");
    await expect(page.locator("body")).toContainText(/Nota|Note/);
  });

  test("documents module loads", async ({ page }) => {
    await page.goto("/documentos");
    await page.waitForLoadState("networkidle");
    await expect(page.locator("body")).toContainText(/Document/);
  });

  test("financial module loads", async ({ page }) => {
    await page.goto("/financeiro");
    await page.waitForLoadState("networkidle");
    await expect(page.locator("body")).toContainText(/Financ|Financial/);
  });

  test("profile page loads", async ({ page }) => {
    await page.goto("/perfil");
    await page.waitForLoadState("networkidle");
    await expect(page.locator("body")).toContainText(/Grupo|Group|Idioma|Language/);
  });
});
