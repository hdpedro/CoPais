/**
 * Auth utilities for E2E tests.
 * Works for both PWA and Native web.
 *
 * IMPORTANT: The PWA has social login buttons ABOVE the email form.
 * We must target the email form submit specifically, not the social buttons.
 */

import { Page } from '@playwright/test';

export function isHomeUrl(urlString: string): boolean {
  try {
    const path = new URL(urlString).pathname;
    return path === '/' || path === '/dashboard' || path.includes('/(tabs)');
  } catch {
    return /\/dashboard|\/\(tabs\)|localhost:8081\/?$/.test(urlString);
  }
}

export async function waitForAuthenticatedHome(page: Page) {
  await page.waitForURL(url => isHomeUrl(url.toString()), { timeout: 20000 });
}

export async function loginAs(page: Page, user: 'primary' | 'secondary') {
  const email = user === 'primary' ? process.env.EMAIL_PRIMARY! : process.env.EMAIL_SECONDARY!;
  const password = user === 'primary' ? process.env.PASSWORD_PRIMARY! : process.env.PASSWORD_SECONDARY!;

  await page.goto('/login');
  await page.waitForLoadState('networkidle');

  // Already logged in?
  if (isHomeUrl(page.url())) return;

  // Wait for email input
  const emailInput = page.locator('input[id="email"], input[name="email"], input[type="email"]').first();
  await emailInput.waitFor({ state: 'visible', timeout: 10000 });
  await emailInput.fill(email);

  // Fill password
  const passwordInput = page.locator('input[id="password"], input[name="password"], input[type="password"]').first();
  await passwordInput.fill(password);

  // Click the FORM submit button — NOT social login buttons.
  // On React Native Web, TouchableOpacity may render without a <button> role.
  const formSubmit = page.locator('form button[type="submit"]').first();
  if (await formSubmit.isVisible().catch(() => false)) {
    await formSubmit.click();
  } else {
    const nativeSubmit = page.locator('[data-testid="login-submit"], [data-testid="login-submit"]').first();
    if (await nativeSubmit.isVisible().catch(() => false)) {
      await nativeSubmit.click();
    } else {
      const entrarText = page.locator('text=/^Entrar$/').first();
      await entrarText.click();
    }
  }

  // Wait for redirect
  await waitForAuthenticatedHome(page);
}

export async function logout(page: Page) {
  await page.goto('/perfil');
  await page.waitForLoadState('networkidle');

  // Click sign-out
  const signOutBtn = page.locator('button:has-text("Sair"), a:has-text("Sair")').first();
  if (await signOutBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
    await signOutBtn.click();
    await page.waitForURL(/\/(auth\/)?login/, { timeout: 10000 });
    return;
  }

  const signOutText = page.locator('text=/^Sair$/').first();
  if (await signOutText.isVisible({ timeout: 5000 }).catch(() => false)) {
    await signOutText.click();
    await page.waitForURL(/\/(auth\/)?login/, { timeout: 10000 });
    return;
  }

  // Fallback: hidden form (PWA)
  await page.evaluate(() => {
    const form = document.getElementById('signout-form') as HTMLFormElement;
    if (form) form.requestSubmit();
  }).catch(() => {});
  await page.waitForURL(/\/(auth\/)?login/, { timeout: 10000 }).catch(() => {});

  // Last resort
  if (!page.url().includes('login')) {
    await page.context().clearCookies();
    await page.evaluate(() => localStorage.clear()).catch(() => {});
    await page.goto('/login');
  }
}

export function getPlatform(page: Page): 'pwa' | 'expo-web' {
  return page.url().includes('kindar.com.br') ? 'pwa' : 'expo-web';
}
