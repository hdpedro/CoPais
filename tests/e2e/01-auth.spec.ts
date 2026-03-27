import { test, expect } from "@playwright/test";
import { loginAs, logout } from "../utils/auth";

test.describe("Authentication", () => {
  test("login with primary user", async ({ page }) => {
    await loginAs(page, "primary");
    await expect(page).toHaveURL(/dashboard/);
    await expect(page.locator("body")).toContainText(/Boa|Good|Buen/);
  });

  test("login with secondary user", async ({ page }) => {
    await loginAs(page, "secondary");
    await expect(page).toHaveURL(/dashboard/);
  });

  test("logout works", async ({ page }) => {
    await loginAs(page, "primary");
    await logout(page);
    await expect(page).toHaveURL(/login/);
  });

  test("unauthenticated redirect to login", async ({ page }) => {
    await page.context().clearCookies();
    await page.goto("/dashboard");
    await page.waitForURL("**/login", { timeout: 10000 });
    await expect(page).toHaveURL(/login/);
  });
});
