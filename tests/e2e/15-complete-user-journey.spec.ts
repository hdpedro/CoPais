/**
 * Complete User Journey — Simulates a full day of use.
 *
 * Morning: check dashboard → view custody → check activities
 * Afternoon: register health event → check financial → chat
 * Evening: review calendar → check notifications → profile
 */

import { test, expect } from '@playwright/test';
import { loginAs, getPlatform } from '../utils/auth';

test.describe('Complete User Journey', () => {

  test('full day simulation (20+ actions)', async ({ page }) => {
    await loginAs(page, 'primary');
    const platform = getPlatform(page);

    // === MORNING ===

    // 1. Check dashboard
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('body')).toContainText(/Bom|Boa|Good/i, { timeout: 10000 });

    // 2. Check calendar
    await page.goto('/calendario');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('body')).toContainText(/2026/);

    // 3. Check activities
    await page.goto('/atividades');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('body')).toContainText(/Atividade|Activity|Nenhuma/i);

    // 4. Check this week
    await page.goto('/semana');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('body')).toContainText(/Hoje|Today/i);

    // 5. Check children
    await page.goto('/criancas');
    await page.waitForLoadState('networkidle');

    // === AFTERNOON ===

    // 6. Health module
    await page.goto('/saude');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('body')).toContainText(/Saúde|Saude/i);

    // 7. Try to open health registration
    const registerBtn = page.locator('button:has-text("Registrar"), a:has-text("Registrar")').first();
    if (await registerBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await registerBtn.click();
      await page.waitForTimeout(1000);
      // Should show wizard
      const body = await page.locator('body').textContent();
      const hasWizard = /Sintoma|Medicamento|Consulta|tipo/i.test(body || '');
      if (hasWizard) {
        // Go back without saving
        await page.goBack();
      }
    }

    // 8. Financial overview
    await page.goto('/financeiro');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('body')).toContainText(/Financ|Saldo/i);

    // 9. Expenses
    await page.goto('/despesas');
    await page.waitForLoadState('networkidle');

    // 10. Chat
    await page.goto('/chat');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('body')).toContainText(/Chat|Geral/i);

    // === EVENING ===

    // 11. Decisions
    await page.goto('/decisoes');
    await page.waitForLoadState('networkidle');

    // 12. Documents
    await page.goto('/documentos');
    await page.waitForLoadState('networkidle');

    // 13. Agreements
    await page.goto('/acordos');
    await page.waitForLoadState('networkidle');

    // 14. School
    await page.goto('/escola');
    await page.waitForLoadState('networkidle');

    // 15. Check-in
    await page.goto('/checkin');
    await page.waitForLoadState('networkidle');

    // 16. Notes
    await page.goto('/notas');
    await page.waitForLoadState('networkidle');

    // 17. Notifications
    await page.goto('/notificacoes');
    await page.waitForLoadState('networkidle');

    // 18. Family
    await page.goto('/familia');
    await page.waitForLoadState('networkidle');

    // 19. Profile
    await page.goto('/perfil');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('body')).toContainText(/Perfil|Profile|Sair/i);

    // 20. Back to dashboard
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('body')).toContainText(/Bom|Boa|Good/i);

    console.log(`[JOURNEY] ${platform}: 20 actions completed successfully`);
  });

  test('error recovery: navigate after network hiccup', async ({ page }) => {
    await loginAs(page, 'primary');

    // Navigate normally
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');

    // Simulate brief network hiccup (block for 2 seconds)
    await page.route('**/supabase.co/**', async route => {
      await new Promise(resolve => setTimeout(resolve, 2000));
      await route.continue();
    });

    // Try to navigate during hiccup
    await page.goto('/calendario');
    await page.waitForTimeout(3000);

    // Remove interception
    await page.unrouteAll();

    // Navigate again — should work
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('body')).toContainText(/Bom|Boa|Good|Kindar/i, { timeout: 15000 });
  });

  test('empty state handling: new group with no data', async ({ page }) => {
    // This tests that pages handle empty data gracefully
    await loginAs(page, 'primary');

    const emptyStatePages = ['/despesas', '/atividades', '/eventos', '/decisoes', '/documentos', '/acordos', '/notas', '/checkin'];

    for (const p of emptyStatePages) {
      await page.goto(p);
      await page.waitForLoadState('networkidle');
      // Should not crash — show empty state or data
      const body = await page.locator('body').textContent();
      expect(body!.length).toBeGreaterThan(10);
      // Should not show raw errors
      expect(body).not.toContain('undefined');
      expect(body).not.toContain('NaN');
    }
  });
});
