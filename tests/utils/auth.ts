import { Page } from "@playwright/test";

export async function loginAs(
  page: Page,
  user: "primary" | "secondary"
) {
  const email =
    user === "primary"
      ? process.env.EMAIL_PRIMARY!
      : process.env.EMAIL_SECONDARY!;
  const password =
    user === "primary"
      ? process.env.PASSWORD_PRIMARY!
      : process.env.PASSWORD_SECONDARY!;

  await page.goto("/login");
  await page.waitForLoadState("networkidle");

  // Check if already logged in (redirected to dashboard)
  if (page.url().includes("/dashboard")) return;

  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);
  await page.click('button[type="submit"]');

  // Wait for redirect to dashboard
  await page.waitForURL("**/dashboard", { timeout: 15000 });
}

export async function logout(page: Page) {
  await page.goto("/api/auth/signout");
  await page.waitForURL("**/login", { timeout: 10000 });
}
