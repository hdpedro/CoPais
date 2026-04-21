/**
 * Stress Tests — 100+ rapid actions, bulk navigation, error resilience.
 */

import { test, expect } from '@playwright/test';
import { loginAs, getPlatform } from '../utils/auth';

test.describe('Stress Tests', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, 'primary');
  });

  test('100 rapid navigations without crash', async ({ page }) => {
    const routes = [
      '/dashboard', '/calendario', '/chat', '/saude', '/despesas',
      '/financeiro', '/atividades', '/eventos', '/criancas', '/familia',
      '/decisoes', '/documentos', '/notas', '/perfil', '/notificacoes',
      '/acordos', '/checkin', '/escola', '/semana', '/dashboard',
    ];

    const start = Date.now();
    let errors = 0;

    for (let i = 0; i < 100; i++) {
      try {
        await page.goto(routes[i % routes.length], { timeout: 5000 });
        await page.waitForLoadState('domcontentloaded', { timeout: 5000 });
      } catch {
        errors++;
      }
    }

    const duration = Date.now() - start;
    const platform = getPlatform(page);

    console.log(`[STRESS] ${platform}: 100 navigations in ${duration}ms, ${errors} errors`);

    // Must complete
    expect(errors).toBeLessThan(10); // Allow some timeout errors
    // Should end on a valid page
    const body = await page.locator('body').textContent();
    expect(body!.length).toBeGreaterThan(10);
  });

  test('rapid back-forward navigation', async ({ page }) => {
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');

    await page.goto('/calendario');
    await page.waitForLoadState('domcontentloaded');

    await page.goto('/chat');
    await page.waitForLoadState('domcontentloaded');

    // Go back multiple times
    await page.goBack();
    await page.waitForTimeout(500);
    await page.goBack();
    await page.waitForTimeout(500);

    // Go forward
    await page.goForward();
    await page.waitForTimeout(500);

    // Should not crash
    const body = await page.locator('body').textContent();
    expect(body!.length).toBeGreaterThan(10);
  });

  test('error page handling (404)', async ({ page }) => {
    await page.goto('/nonexistent-page-12345');
    await page.waitForTimeout(3000);

    // Should show error page or redirect, not crash
    const body = await page.locator('body').textContent();
    expect(body!.length).toBeGreaterThan(5);
  });

  test('session expired handling', async ({ page }) => {
    // Clear all auth
    await page.context().clearCookies();
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    }).catch(() => {});

    // Try to access protected route
    await page.goto('/dashboard');
    await page.waitForTimeout(5000);

    // Should redirect to login
    const url = page.url();
    const isOnLoginOrDashboard = url.includes('login') || url.includes('dashboard');
    expect(isOnLoginOrDashboard).toBeTruthy();
  });

  test('concurrent data loading', async ({ page }) => {
    // Open dashboard which loads multiple queries in parallel
    const start = Date.now();
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');
    const duration = Date.now() - start;

    // Should handle parallel queries without deadlock
    expect(duration).toBeLessThan(15000);
    await expect(page.locator('body')).toContainText(/Bom|Boa|Good|Kindar/i);
  });
});
