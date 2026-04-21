/**
 * Navigation Tests — All routes load correctly.
 * Validates that every module renders content (not blank screen).
 */

import { test, expect } from '@playwright/test';
import { loginAs, getPlatform, isHomeUrl } from '../utils/auth';
import { measureAction } from '../utils/timing';

test.describe('Navigation', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, 'primary');
  });

  const routes = [
    { path: '/dashboard', text: /Bom|Boa|Good|Buen/i, name: 'dashboard' },
    { path: '/calendario', text: /2026|Dom|Mon/, name: 'calendar' },
    { path: '/chat', text: /Chat|Geral|canal/i, name: 'chat' },
    { path: '/saude', text: /Saúde|Saude|Health/i, name: 'health' },
    { path: '/despesas', text: /Despesa|Expense|Nenhuma/i, name: 'expenses' },
    { path: '/financeiro', text: /Financ|Saldo/i, name: 'financial' },
    { path: '/atividades', text: /Atividade|Activity|Nenhuma/i, name: 'activities' },
    { path: '/eventos', text: /Evento|Event|Nenhum/i, name: 'events' },
    { path: '/criancas', text: /Crian|Child|anos/i, name: 'children' },
    { path: '/familia', text: /Famil|Family|Admin|Membro/i, name: 'family' },
    { path: '/decisoes', text: /Decis|Decision|Nenhuma/i, name: 'decisions' },
    { path: '/documentos', text: /Document|Nenhum/i, name: 'documents' },
    { path: '/notas', text: /Nota|Note|Nenhuma/i, name: 'notes' },
    { path: '/perfil', text: /Perfil|Profile|Nome|Idioma/i, name: 'profile' },
    { path: '/notificacoes', text: /Notific|Nenhuma/i, name: 'notifications' },
    { path: '/acordos', text: /Acordo|Agreement|Nenhum/i, name: 'agreements' },
    { path: '/checkin', text: /Check|Nenhum/i, name: 'checkin' },
    { path: '/escola', text: /Escola|School/i, name: 'school' },
    { path: '/semana', text: /Hoje|Today|Proximos|dias/i, name: 'week' },
  ];

  for (const route of routes) {
    test(`loads ${route.path}`, async ({ page }) => {
      const platform = getPlatform(page);
      await measureAction('navigation', platform, `load_${route.name}`, async () => {
        await page.goto(route.path);
        await page.waitForLoadState('networkidle');
      });
      await expect(page.locator('body')).toContainText(route.text, { timeout: 10000 });
    });
  }

  test('rapid navigation (30 switches)', async ({ page }) => {
    const paths = [
      '/dashboard', '/calendario', '/chat', '/saude', '/despesas',
      '/dashboard', '/financeiro', '/atividades', '/eventos', '/criancas',
      '/dashboard', '/familia', '/decisoes', '/documentos', '/notas',
      '/dashboard', '/calendario', '/chat', '/saude', '/despesas',
      '/perfil', '/notificacoes', '/acordos', '/checkin', '/escola',
      '/semana', '/dashboard', '/calendario', '/chat', '/dashboard',
    ];
    for (const p of paths) {
      await page.goto(p);
      await page.waitForLoadState('domcontentloaded');
    }
    // Should end on dashboard without crash
    expect(isHomeUrl(page.url())).toBeTruthy();
    await expect(page.locator('body')).not.toContainText(/error|crash|undefined/i);
  });
});
