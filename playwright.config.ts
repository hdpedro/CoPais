import { defineConfig, devices } from "@playwright/test";
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.test.local" });

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 1,
  workers: 1,
  reporter: [["html", { open: "never" }], ["list"]],
  timeout: 30000,
  use: {
    // baseURL override via env so the i18n locale smoke tests (06-...) can
    // run against localhost (when iterating on translations) or a preview
    // deploy (when the feature flag is ON) without editing this file.
    baseURL: process.env.PLAYWRIGHT_BASE_URL || "https://kindar.com.br",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "off",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
