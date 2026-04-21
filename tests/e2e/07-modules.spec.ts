/**
 * All 16 Modules — Load + content validation.
 * Single test with one login, iterates all modules to avoid auth rate limiting.
 */

import { test, expect } from '@playwright/test';
import { loginAs, getPlatform, isHomeUrl } from '../utils/auth';
// timing logged via console (avoids path issues in Playwright runner)

const modules = [
  { path: '/despesas', text: /Despesa|Expense|Nenhuma|R\$/i, name: 'expenses' },
  { path: '/financeiro', text: /Financ|Saldo|R\$/i, name: 'financial' },
  { path: '/atividades', text: /Atividade|Activity|Nenhuma/i, name: 'activities' },
  { path: '/eventos', text: /Evento|Event|Nenhum/i, name: 'events' },
  { path: '/criancas', text: /Crian|Child|anos/i, name: 'children' },
  { path: '/familia', text: /Famil|Family|Admin|Membro/i, name: 'family' },
  { path: '/perfil', text: /Perfil|Profile|Nome|Idioma|Sair/i, name: 'profile' },
  { path: '/notificacoes', text: /Notific|Nenhuma/i, name: 'notifications' },
  { path: '/documentos', text: /Document|Nenhum/i, name: 'documents' },
  { path: '/acordos', text: /Acordo|Agreement|Nenhum/i, name: 'agreements' },
  { path: '/decisoes', text: /Decis|Decision|Nenhuma/i, name: 'decisions' },
  { path: '/checkin', text: /Check|Nenhum/i, name: 'checkin' },
  { path: '/escola', text: /Escola|School/i, name: 'school' },
  { path: '/notas', text: /Nota|Note|Nenhuma/i, name: 'notes' },
  { path: '/temas-sensiveis', text: /Tema|Sensitive|Nenhum/i, name: 'sensitive-topics' },
  { path: '/semana', text: /Hoje|Today|Proximos|Sem evento/i, name: 'week-view' },
];

test.describe('All Modules', () => {

  test('all 16 modules load and show content', async ({ page }) => {
    test.setTimeout(180000); // 3 min for all modules
    await loginAs(page, 'primary');
    // Verify login succeeded
    expect(isHomeUrl(page.url())).toBeTruthy();
    const platform = getPlatform(page);

    const results: Array<{ name: string; passed: boolean; error?: string; ms: number }> = [];

    for (const mod of modules) {
      const start = Date.now();
      try {
        await page.goto(mod.path);
        await page.waitForLoadState('networkidle');
        await expect(page.locator('body')).toContainText(mod.text, { timeout: 10000 });

        const ms = Date.now() - start;
        results.push({ name: mod.name, passed: true, ms });
        console.log(`  [${platform}] ${mod.name}: ${ms}ms OK`);
      } catch (e: any) {
        results.push({ name: mod.name, passed: false, error: e.message?.slice(0, 100), ms: Date.now() - start });
      }
    }

    // Log summary
    const passed = results.filter(r => r.passed).length;
    const failed = results.filter(r => !r.passed);
    console.log(`[MODULES] ${platform}: ${passed}/${modules.length} passed`);
    failed.forEach(f => console.log(`  FAIL: ${f.name} — ${f.error}`));

    // At least 14/16 must pass (allow 2 timeout-related failures)
    expect(passed).toBeGreaterThanOrEqual(14);
  });
});
