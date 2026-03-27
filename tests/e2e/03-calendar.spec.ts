import { test, expect } from "@playwright/test";
import { loginAs } from "../utils/auth";

test.describe("Calendar", () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, "primary");
    await page.goto("/calendario");
    await page.waitForLoadState("networkidle");
  });

  test("calendar page loads with month view", async ({ page }) => {
    await expect(page.locator("body")).toContainText(/2026/);
    await expect(page.locator("body")).toContainText(/Dom|Sun|Seg|Mon/);
  });

  test("navigate between months", async ({ page }) => {
    // Click next month
    const nextBtn = page.locator('button[aria-label*="next" i], button[aria-label*="próximo" i], button[aria-label*="Próximo" i]').first();
    if (await nextBtn.isVisible()) {
      await nextBtn.click();
      await page.waitForTimeout(500);
      // Should still show calendar grid
      await expect(page.locator("body")).toContainText(/2026/);
    }
  });

  test("click on a day opens detail sheet", async ({ page }) => {
    // Click on a day number
    const dayCell = page.locator("button, div").filter({ hasText: /^23$/ }).first();
    if (await dayCell.isVisible()) {
      await dayCell.click();
      await page.waitForTimeout(1000);
      // Detail sheet should appear
      await expect(page.locator("body")).toContainText(/Responsável|Responsible|ATIVIDADES|Activities/i);
    }
  });

  test("new event page loads", async ({ page }) => {
    await page.goto("/calendario/novo");
    await page.waitForLoadState("networkidle");
    await expect(page.locator("body")).toContainText(/Tipo|Type|compromisso|Appointment/i);
  });

  test("schedule page loads", async ({ page }) => {
    await page.goto("/calendario/escala");
    await page.waitForLoadState("networkidle");
    await expect(page.locator("body")).toContainText(/Escala|Schedule|Configurar|Configure/i);
  });
});
