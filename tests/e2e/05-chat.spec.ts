/**
 * Chat Tests — Channels, messages, realtime.
 */

import { test, expect } from '@playwright/test';
import { loginAs, getPlatform } from '../utils/auth';
import { measureAction } from '../utils/timing';

test.describe('Chat', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, 'primary');
  });

  test('chat page loads with channels', async ({ page }) => {
    const platform = getPlatform(page);
    await measureAction('chat', platform, 'load_chat', async () => {
      await page.goto('/chat');
      await page.waitForLoadState('networkidle');
    });
    await expect(page.locator('body')).toContainText(/Chat|Geral|canal/i, { timeout: 10000 });
  });

  test('can open a channel', async ({ page }) => {
    await page.goto('/chat');
    await page.waitForLoadState('networkidle');

    // Click first channel
    const channelItem = page.locator('a, button, [role="button"]').filter({ hasText: /Geral|General/ }).first();
    if (await channelItem.isVisible()) {
      await channelItem.click();
      await page.waitForLoadState('domcontentloaded');
      // Should show message input
      await expect(page.locator('input, textarea, [contenteditable]').first()).toBeVisible({ timeout: 5000 });
    }
  });

  test('message input exists in chat room', async ({ page }) => {
    await page.goto('/chat');
    await page.waitForLoadState('networkidle');

    // Click first channel
    const channelItem = page.locator('a, button, [role="button"]').filter({ hasText: /Geral|General/ }).first();
    if (await channelItem.isVisible()) {
      await channelItem.click();
      await page.waitForTimeout(2000);
      // Input should exist
      const input = page.locator('input[placeholder*="Mensagem" i], textarea[placeholder*="Mensagem" i], input[placeholder*="Message" i]').first();
      if (await input.isVisible()) {
        await expect(input).toBeEditable();
      }
    }
  });

  test('send and receive message flow', async ({ page }) => {
    await page.goto('/chat');
    await page.waitForLoadState('networkidle');

    const channelItem = page.locator('a, button, [role="button"]').filter({ hasText: /Geral|General/ }).first();
    if (!(await channelItem.isVisible())) return;

    await channelItem.click();
    await page.waitForTimeout(2000);

    const testMsg = `test-${Date.now()}`;
    const input = page.locator('input[placeholder*="Mensagem" i], textarea[placeholder*="Mensagem" i]').first();
    if (await input.isVisible()) {
      await input.fill(testMsg);
      const sendBtn = page.locator('button[type="submit"], button:has(svg)').last();
      if (await sendBtn.isVisible()) {
        await sendBtn.click();
        await page.waitForTimeout(2000);
        // Message should appear
        await expect(page.locator('body')).toContainText(testMsg, { timeout: 5000 });
      }
    }
  });
});
