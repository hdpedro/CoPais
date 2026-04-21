/**
 * Offline Tests — Validates offline-first behavior.
 *
 * Uses Playwright's route.abort() to simulate network failure.
 * Tests: cache reads, graceful degradation, no crash.
 */

import { test, expect } from '@playwright/test';
import { loginAs, getPlatform } from '../utils/auth';

test.describe('Offline Behavior', () => {
  test.beforeEach(async ({ page }) => {
    // Login first (needs network)
    await loginAs(page, 'primary');

    // Load dashboard to populate cache
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');
  });

  test('dashboard shows content after going offline', async ({ page }) => {
    // Visit dashboard to warm cache
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');
    const contentBefore = await page.locator('body').textContent();

    // Go offline — block all Supabase API calls
    await page.route('**/supabase.co/**', route => route.abort());
    await page.route('**/rest/v1/**', route => route.abort());

    // Reload
    await page.reload();
    await page.waitForTimeout(3000);

    // Should still show content (from cache or graceful degradation)
    // At minimum, should NOT show a blank page or crash
    const bodyText = await page.locator('body').textContent();
    expect(bodyText!.length).toBeGreaterThan(50);
  });

  test('calendar survives offline', async ({ page }) => {
    // Warm cache
    await page.goto('/calendario');
    await page.waitForLoadState('networkidle');

    // Go offline
    await page.route('**/supabase.co/**', route => route.abort());

    await page.reload();
    await page.waitForTimeout(3000);

    // Should still show calendar structure
    const bodyText = await page.locator('body').textContent();
    expect(bodyText!.length).toBeGreaterThan(50);
  });

  test('navigation works offline (no blank screens)', async ({ page }) => {
    // Go offline
    await page.route('**/supabase.co/**', route => route.abort());
    await page.route('**/rest/v1/**', route => route.abort());

    const paths = ['/dashboard', '/calendario', '/chat', '/saude'];
    for (const p of paths) {
      await page.goto(p);
      await page.waitForTimeout(2000);
      const bodyText = await page.locator('body').textContent();
      // Should not be completely blank
      expect(bodyText!.length).toBeGreaterThan(10);
    }
  });

  test('reconnect recovers data', async ({ page }) => {
    // Go offline
    await page.route('**/supabase.co/**', route => route.abort());
    await page.goto('/dashboard');
    await page.waitForTimeout(2000);

    // Go back online
    await page.unrouteAll();
    await page.reload();
    await page.waitForLoadState('networkidle');

    // Should show fresh data
    await expect(page.locator('body')).toContainText(/Bom|Boa|Good|Buen/i, { timeout: 10000 });
  });
});
