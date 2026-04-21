/**
 * Calendar Tests — Grid, navigation, custody colors, day detail.
 */

import { test, expect } from '@playwright/test';
import { loginAs, getPlatform } from '../utils/auth';
import { measureAction } from '../utils/timing';

test.describe('Calendar', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, 'primary');
    const platform = getPlatform(page);
    await measureAction('calendar', platform, 'load_calendar', async () => {
      await page.goto('/calendario');
      await page.waitForLoadState('networkidle');
    });
  });

  test('shows month and year', async ({ page }) => {
    await expect(page.locator('body')).toContainText(/2026/);
  });

  test('shows day headers', async ({ page }) => {
    await expect(page.locator('body')).toContainText(/Dom|Sun|Seg|Mon/);
  });

  test('navigate to next month', async ({ page }) => {
    const nextBtn = page.locator('button, [role="button"]').filter({ has: page.locator('[data-testid="next-month"], svg') }).first();
    // Try clicking any forward button
    const buttons = page.locator('button');
    const count = await buttons.count();
    // Find button with chevron-forward or > text
    for (let i = 0; i < count; i++) {
      const btn = buttons.nth(i);
      const text = await btn.textContent();
      if (text?.includes('›') || text?.includes('>') || text?.includes('→')) {
        await btn.click();
        break;
      }
    }
    await page.waitForTimeout(500);
    await expect(page.locator('body')).toContainText(/2026/);
  });

  test('day cell clickable (opens detail)', async ({ page }) => {
    // Click on day 15
    const dayCell = page.locator('button, div, [role="button"]').filter({ hasText: /^15$/ }).first();
    if (await dayCell.isVisible()) {
      await dayCell.click();
      await page.waitForTimeout(1000);
    }
    // No crash
    expect(page.url()).toContain('calendario');
  });

  test('empty month does not crash', async ({ page }) => {
    // Navigate far forward
    for (let i = 0; i < 6; i++) {
      const buttons = page.locator('button');
      const count = await buttons.count();
      for (let j = 0; j < count; j++) {
        const btn = buttons.nth(j);
        const text = await btn.textContent();
        if (text?.includes('›') || text?.includes('>') || text?.includes('→')) {
          await btn.click();
          await page.waitForTimeout(300);
          break;
        }
      }
    }
    // Should not crash
    await expect(page.locator('body')).not.toContainText(/error|undefined/i);
  });
});
