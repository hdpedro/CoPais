/**
 * Playwright Config — Kindar Test Pipeline
 *
 * Two projects:
 * 1. "pwa" → tests against kindar.com.br (production PWA)
 * 2. "native" → tests against localhost:8081 (Expo web export)
 *
 * Both run the SAME test suite. Results are compared by the reporter.
 */

import { defineConfig, devices } from '@playwright/test';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.test' });

const PWA_URL = process.env.PWA_URL || 'https://kindar.com.br';
const NATIVE_URL = process.env.NATIVE_URL || 'http://localhost:8081';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 1,
  workers: 1,
  timeout: 30000,
  reporter: [
    ['list'],
    ['html', { open: 'never', outputFolder: 'tests/reports/html' }],
    ['json', { outputFile: 'tests/reports/results.json' }],
    ['./tests/utils/parity-reporter.ts'],
  ],
  use: {
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'off',
  },
  projects: [
    {
      name: 'pwa',
      use: {
        ...devices['Desktop Chrome'],
        baseURL: PWA_URL,
      },
      metadata: { platform: 'pwa' },
    },
    {
      name: 'expo-web',
      use: {
        ...devices['Desktop Chrome'],
        baseURL: NATIVE_URL,
      },
      metadata: { platform: 'expo-web' },
    },
  ],
});
