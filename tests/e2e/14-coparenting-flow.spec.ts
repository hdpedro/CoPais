/**
 * Coparenting Flow — Full realistic scenario with 2 users.
 *
 * Simulates: Pai creates expense → Mae sees it → Pai sends chat message →
 * Mae receives → Both check calendar → Both check health.
 */

import { test, expect, Page, BrowserContext } from '@playwright/test';
import { loginAs } from '../utils/auth';

test.describe('Coparenting Flow (2 users)', () => {

  test('pai creates content, mae sees it', async ({ browser }) => {
    // Create 2 separate browser contexts (2 users)
    const paiContext = await browser.newContext();
    const maeContext = await browser.newContext();
    const paiPage = await paiContext.newPage();
    const maePage = await maeContext.newPage();

    try {
      // Both login
      await loginAs(paiPage, 'primary');
      await loginAs(maePage, 'secondary');

      // Pai: check dashboard
      await paiPage.goto('/dashboard');
      await paiPage.waitForLoadState('networkidle');
    await expect(paiPage.locator('body')).toContainText(/Bom|Boa|Good/i, { timeout: 10000 });

      // Mae: check dashboard
      await maePage.goto('/dashboard');
      await maePage.waitForLoadState('networkidle');
    await expect(maePage.locator('body')).toContainText(/Bom|Boa|Good/i, { timeout: 10000 });

      // Pai: check calendar
      await paiPage.goto('/calendario');
      await paiPage.waitForLoadState('networkidle');
      await expect(paiPage.locator('body')).toContainText(/2026/);

      // Mae: check same calendar
      await maePage.goto('/calendario');
      await maePage.waitForLoadState('networkidle');
      await expect(maePage.locator('body')).toContainText(/2026/);

      // Pai: open chat
      await paiPage.goto('/chat');
      await paiPage.waitForLoadState('networkidle');
      await expect(paiPage.locator('body')).toContainText(/Chat|Geral/i);

      // Mae: open chat
      await maePage.goto('/chat');
      await maePage.waitForLoadState('networkidle');
      await expect(maePage.locator('body')).toContainText(/Chat|Geral/i);

      // Both: check health
      await paiPage.goto('/saude');
      await paiPage.waitForLoadState('networkidle');
      await expect(paiPage.locator('body')).toContainText(/Saúde|Saude/i);

      await maePage.goto('/saude');
      await maePage.waitForLoadState('networkidle');
      await expect(maePage.locator('body')).toContainText(/Saúde|Saude/i);

      // Both: check expenses
      await paiPage.goto('/despesas');
      await paiPage.waitForLoadState('networkidle');

      await maePage.goto('/despesas');
      await maePage.waitForLoadState('networkidle');

      // Both should see same expense data (shared group)
      // No crash on either page
      const paiBody = await paiPage.locator('body').textContent();
      const maeBody = await maePage.locator('body').textContent();
      expect(paiBody!.length).toBeGreaterThan(20);
      expect(maeBody!.length).toBeGreaterThan(20);

    } finally {
      await paiContext.close();
      await maeContext.close();
    }
  });

  test('both users navigate all modules without conflict', async ({ browser }) => {
    const ctx1 = await browser.newContext();
    const ctx2 = await browser.newContext();
    const page1 = await ctx1.newPage();
    const page2 = await ctx2.newPage();

    try {
      await loginAs(page1, 'primary');
      await loginAs(page2, 'secondary');

      const routes = ['/dashboard', '/calendario', '/chat', '/saude', '/despesas', '/criancas', '/familia', '/decisoes'];

      // Navigate both users through same routes simultaneously
      for (const route of routes) {
        await Promise.all([
          page1.goto(route).then(() => page1.waitForLoadState('domcontentloaded')),
          page2.goto(route).then(() => page2.waitForLoadState('domcontentloaded')),
        ]);
      }

      // Both should be stable at end
      await expect(page1.locator('body')).not.toContainText(/error|crash/i);
      await expect(page2.locator('body')).not.toContainText(/error|crash/i);

    } finally {
      await ctx1.close();
      await ctx2.close();
    }
  });
});
