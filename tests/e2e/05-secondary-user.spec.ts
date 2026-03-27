import { test, expect } from "@playwright/test";
import { loginAs } from "../utils/auth";

test.describe("Secondary User (Angelino)", () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, "secondary");
  });

  test("dashboard loads for secondary user", async ({ page }) => {
    await expect(page).toHaveURL(/dashboard/);
    await page.waitForLoadState("domcontentloaded");
    await expect(page.locator("body")).toContainText(/Boa|Good|Buen|Kindar/, { timeout: 15000 });
  });

  test("can view calendar", async ({ page }) => {
    await page.goto("/calendario");
    await page.waitForLoadState("domcontentloaded");
    await expect(page.locator("body")).toContainText(/2026/, { timeout: 15000 });
  });

  test("can view chat", async ({ page }) => {
    await page.goto("/chat");
    await page.waitForLoadState("domcontentloaded");
    await expect(page.locator("body")).toContainText(/Chat|Geral|mensagem/i, { timeout: 15000 });
  });

  test("can view decisions", async ({ page }) => {
    await page.goto("/decisoes");
    await page.waitForLoadState("networkidle");
    await expect(page.locator("body")).toContainText(/Decis|Decision/);
  });

  test("can view expenses", async ({ page }) => {
    await page.goto("/despesas");
    await page.waitForLoadState("networkidle");
    await expect(page.locator("body")).toContainText(/Despesa|Expense/);
  });
});
