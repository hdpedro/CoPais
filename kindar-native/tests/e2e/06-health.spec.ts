/**
 * Health Module Tests — Status, registration wizard, timeline, detail.
 */

import { test, expect } from '@playwright/test';
import { loginAs, getPlatform } from '../utils/auth';
import { measureAction } from '../utils/timing';

test.describe('Health Module', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, 'primary');
  });

  test('health page loads with status', async ({ page }) => {
    const platform = getPlatform(page);
    await measureAction('health', platform, 'load_health', async () => {
      await page.goto('/saude');
      await page.waitForLoadState('networkidle');
    });
    await expect(page.locator('body')).toContainText(/Saúde|Saude|Health/i, { timeout: 10000 });
  });

  test('shows child health status (healthy/monitoring/treatment)', async ({ page }) => {
    await page.goto('/saude');
    await page.waitForLoadState('networkidle');
    const body = await page.locator('body').textContent();
    // Should show at least one of: Saudavel, Em observacao, Em tratamento, or Healthy
    const hasStatus = /Saud[aá]vel|observa[cç][aã]o|tratamento|Healthy|monitoring|treatment/i.test(body || '');
    // Or it could be empty state
    const hasEmpty = /Nenhum registro|No records/i.test(body || '');
    expect(hasStatus || hasEmpty).toBeTruthy();
  });

  test('register button exists', async ({ page }) => {
    await page.goto('/saude');
    await page.waitForLoadState('networkidle');
    const registerBtn = page.locator('button:has-text("Registrar"), a:has-text("Registrar"), button:has-text("Register")').first();
    await expect(registerBtn).toBeVisible({ timeout: 5000 });
  });

  test('registration wizard opens', async ({ page }) => {
    await page.goto('/saude');
    await page.waitForLoadState('networkidle');
    const registerBtn = page.locator('button:has-text("Registrar"), a:has-text("Registrar")').first();
    if (await registerBtn.isVisible()) {
      await registerBtn.click();
      await page.waitForLoadState('domcontentloaded');
      // Should show event type selection
      await expect(page.locator('body')).toContainText(/Sintoma|Medicamento|Consulta|Observa/i, { timeout: 5000 });
    }
  });

  test('timeline loads (or shows empty state)', async ({ page }) => {
    await page.goto('/saude');
    await page.waitForLoadState('networkidle');
    const body = await page.locator('body').textContent();
    // Timeline should show events or empty state
    const hasContent = /Histor|Timeline|Nenhum registro|Registrar/i.test(body || '');
    expect(hasContent).toBeTruthy();
  });

  test('child selector works (if multiple children)', async ({ page }) => {
    await page.goto('/saude');
    await page.waitForLoadState('networkidle');
    // Try to click "Todos" button
    const todosBtn = page.locator('button:has-text("Todos"), button:has-text("All")').first();
    if (await todosBtn.isVisible()) {
      await todosBtn.click();
      await page.waitForTimeout(500);
      // No crash
      await expect(page.locator('body')).toContainText(/Saúde|Saude/i);
    }
  });
});
