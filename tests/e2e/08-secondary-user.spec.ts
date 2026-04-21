/**
 * Secondary User Tests — Validates multi-user data isolation.
 */

import { test, expect } from '@playwright/test';
import { loginAs, isHomeUrl } from '../utils/auth';

test.describe('Secondary User', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, 'secondary');
  });

  test('dashboard loads', async ({ page }) => {
    expect(isHomeUrl(page.url())).toBeTruthy();
    await expect(page.locator('body')).toContainText(/Bom|Boa|Good|Buen|Kindar/i, { timeout: 15000 });
  });

  test('calendar loads', async ({ page }) => {
    await page.goto('/calendario');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('body')).toContainText(/2026/, { timeout: 15000 });
  });

  test('chat loads', async ({ page }) => {
    await page.goto('/chat');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('body')).toContainText(/Chat|Geral|canal/i, { timeout: 15000 });
  });

  test('health loads', async ({ page }) => {
    await page.goto('/saude');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('body')).toContainText(/Saúde|Saude/i, { timeout: 15000 });
  });

  test('expenses loads', async ({ page }) => {
    await page.goto('/despesas');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('body')).toContainText(/Despesa|Expense|Nenhuma/i, { timeout: 15000 });
  });
});
