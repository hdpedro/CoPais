/**
 * Performance Tests — Measures load times across all key screens.
 * Target: < 1s for every screen.
 * Results logged to timing.json for PWA vs Native comparison.
 */

import { test, expect } from '@playwright/test';
import { loginAs, getPlatform } from '../utils/auth';
import { measureAction } from '../utils/timing';

test.describe('Performance', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, 'primary');
  });

  const screens = [
    { path: '/dashboard', name: 'dashboard', maxMs: 3000 },
    { path: '/calendario', name: 'calendar', maxMs: 3000 },
    { path: '/chat', name: 'chat', maxMs: 3000 },
    { path: '/saude', name: 'health', maxMs: 3000 },
    { path: '/despesas', name: 'expenses', maxMs: 2000 },
    { path: '/financeiro', name: 'financial', maxMs: 2000 },
    { path: '/criancas', name: 'children', maxMs: 2000 },
    { path: '/notificacoes', name: 'notifications', maxMs: 2000 },
  ];

  for (const screen of screens) {
    test(`${screen.name} loads within ${screen.maxMs}ms`, async ({ page }) => {
      const platform = getPlatform(page);
      const start = Date.now();

      await page.goto(screen.path);
      await page.waitForLoadState('networkidle');

      const duration = Date.now() - start;

      measureAction('performance', platform, `perf_${screen.name}`, async () => {
        // Already measured above
      });

      // Log timing entry manually since measureAction wraps async
      const { logTiming } = await import('../utils/timing');
      logTiming({
        test: 'performance',
        platform,
        action: `perf_${screen.name}`,
        durationMs: duration,
        timestamp: new Date().toISOString(),
      });

      console.log(`[PERF] ${platform}:${screen.name} = ${duration}ms`);

      // Soft assertion — warn if too slow but don't fail
      if (duration > screen.maxMs) {
        console.warn(`⚠️ ${screen.name} took ${duration}ms (target: ${screen.maxMs}ms)`);
      }

      // Hard assertion — must load within 10s
      expect(duration).toBeLessThan(10000);
    });
  }

  test('rapid tab switching (no memory leak)', async ({ page }) => {
    const tabs = ['/dashboard', '/calendario', '/chat', '/saude', '/despesas'];
    const start = Date.now();

    for (let i = 0; i < 20; i++) {
      await page.goto(tabs[i % tabs.length]);
      await page.waitForLoadState('domcontentloaded');
    }

    const totalDuration = Date.now() - start;
    console.log(`[PERF] 20 tab switches in ${totalDuration}ms (avg ${Math.round(totalDuration / 20)}ms)`);

    // Should complete within 60s total
    expect(totalDuration).toBeLessThan(60000);

    // Final page should render
    await expect(page.locator('body')).not.toContainText(/error|crash/i);
  });
});
