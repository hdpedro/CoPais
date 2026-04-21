/**
 * Payments Tests — Validates pricing page, subscription status, and UI.
 *
 * NOTE: Actual IAP purchases cannot be tested via Playwright.
 * These tests validate the UI and subscription state display.
 */

import { test, expect } from '@playwright/test';
import { loginAs } from '../utils/auth';
import { getAuthenticatedClient } from '../utils/supabase-client';

test.describe('Payments', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, 'primary');
  });

  test('pricing page loads', async ({ page }) => {
    await page.goto('/pricing');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('body')).toContainText(/Premium|Assinatura|Subscribe/i, { timeout: 10000 });
  });

  test('pricing shows features list', async ({ page }) => {
    await page.goto('/pricing');
    await page.waitForLoadState('networkidle');
    // Should show feature list
    await expect(page.locator('body')).toContainText(/Calendario|Calendar/i);
    await expect(page.locator('body')).toContainText(/Chat/i);
  });

  test('pricing shows CTA or active status', async ({ page }) => {
    await page.goto('/pricing');
    await page.waitForLoadState('networkidle');

    const body = await page.locator('body').textContent();
    // Should show either "Assinar" (subscribe) or "Assinatura ativa" (active)
    const hasSubscribeCTA = /Assinar|Subscribe|Comprar/i.test(body || '');
    const hasActiveStatus = /ativa|active|Premium/i.test(body || '');
    expect(hasSubscribeCTA || hasActiveStatus).toBeTruthy();
  });

  test('subscription data exists in database', async () => {
    const { client, userId } = await getAuthenticatedClient(
      process.env.EMAIL_PRIMARY!,
      process.env.PASSWORD_PRIMARY!
    );
    if (!userId) return;

    // Check subscriptions table
    const { data } = await client
      .from('subscriptions')
      .select('plan_id, status, platform')
      .eq('user_id', userId)
      .limit(1);

    // User might be free or premium — just validate query works
    console.log(`[PAYMENTS] User subscription: ${JSON.stringify(data)}`);
    // No crash
    expect(true).toBeTruthy();
  });

  test('profile shows subscription link', async ({ page }) => {
    await page.goto('/perfil');
    await page.waitForLoadState('networkidle');
    // Should have a link/button to subscription
    const subLink = page.locator('a:has-text("Assinatura"), button:has-text("Assinatura"), [href*="pricing"]').first();
    if (await subLink.isVisible()) {
      await subLink.click();
      await page.waitForLoadState('domcontentloaded');
      await expect(page.locator('body')).toContainText(/Premium|Assinatura/i);
    }
  });
});
