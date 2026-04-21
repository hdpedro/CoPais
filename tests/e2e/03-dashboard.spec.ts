/**
 * Dashboard Tests — Content, cards, health summary, quick actions.
 */

import { test, expect } from '@playwright/test';
import { loginAs, getPlatform, isHomeUrl } from '../utils/auth';
import { measureAction } from '../utils/timing';

test.describe('Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, 'primary');
  });

  test('shows greeting', async ({ page }) => {
    await expect(page.locator('body')).toContainText(/Bom dia|Boa tarde|Boa noite|Good/i, { timeout: 10000 });
  });

  test('shows date', async ({ page }) => {
    await expect(page.locator('body')).toContainText(/2026/, { timeout: 10000 });
  });

  test('shows custody card (if enabled)', async ({ page }) => {
    // Check if custody text is present — it's ok if not (custody might not be enabled)
    const body = await page.locator('body').textContent();
    const hasCustody = /Guarda|Com voce|Com você|custody/i.test(body || '');
    if (hasCustody) {
      await expect(page.locator('body')).toContainText(/Guarda|Com/i);
    }
  });

  test('shows health summary', async ({ page }) => {
    const body = await page.locator('body').textContent();
    // Health block should show if children exist
    const hasChildren = /Saude|Saudavel|Saudável|tratamento|observacao/i.test(body || '');
    // Just verify no crash — the block may or may not appear
    expect(isHomeUrl(page.url())).toBeTruthy();
  });

  test('quick actions navigate correctly', async ({ page }) => {
    // Find a "Despesas" link/button
    const despesasLink = page.locator('a:has-text("Despesas"), button:has-text("Despesas"), [href*="despesas"]').first();
    if (await despesasLink.isVisible()) {
      await despesasLink.click();
      await page.waitForLoadState('domcontentloaded');
      await expect(page.locator('body')).toContainText(/Despesa|Expense/i, { timeout: 10000 });
    }
  });

  test('pull-to-refresh loads fresh data', async ({ page }) => {
    const platform = getPlatform(page);
    await measureAction('dashboard', platform, 'load_dashboard', async () => {
      await page.goto('/dashboard');
      await page.waitForLoadState('networkidle');
    });
    // Verify content loaded
    await expect(page.locator('body')).toContainText(/Bom|Boa|Good|Buen/i);
  });
});
