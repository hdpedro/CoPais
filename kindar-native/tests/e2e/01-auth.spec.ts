/**
 * Auth Tests — Login, Signup, Logout, Session persistence.
 * Runs against both PWA and Native (same suite).
 */

import { test, expect } from '@playwright/test';
import { loginAs, logout, getPlatform, isHomeUrl } from '../utils/auth';
import { measureAction } from '../utils/timing';

test.describe('Auth', () => {

  test('login with primary user', async ({ page }) => {
    const platform = getPlatform(page);
    await measureAction('auth', platform, 'login', async () => {
      await loginAs(page, 'primary');
    });
    expect(isHomeUrl(page.url())).toBeTruthy();
    await expect(page.locator('body')).toContainText(/Bom|Boa|Good|Buen|Kindar/i, { timeout: 10000 });
  });

  test('login with secondary user', async ({ page }) => {
    await loginAs(page, 'secondary');
    expect(isHomeUrl(page.url())).toBeTruthy();
  });

  test('logout works', async ({ page }) => {
    await loginAs(page, 'primary');
    await logout(page);
    await expect(page).toHaveURL(/login/);
  });

  test('unauthenticated redirect to login', async ({ page }) => {
    await page.context().clearCookies();
    await page.goto('/dashboard');
    await page.waitForURL(/login/, { timeout: 10000 });
    await expect(page).toHaveURL(/login/);
  });

  test('session persists after reload', async ({ page }) => {
    await loginAs(page, 'primary');
    await page.reload();
    await page.waitForLoadState('networkidle');
    // Should still be on dashboard, not redirected to login
    const url = page.url();
    expect(url).not.toContain('/login');
  });
});
